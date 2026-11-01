import type { ItineraryItem } from "../types";
import type {
  ItineraryConflict,
  ItineraryResolutionChoice,
  ItinerarySyncState,
} from "../storage/itinerarySyncStorage";

export type ItineraryMergeResult =
  | {
      status: "merged";
      daysData: Record<string, ItineraryItem[]>;
      conflicts: [];
    }
  | {
      status: "conflict";
      daysData: Record<string, ItineraryItem[]>;
      conflicts: ItineraryConflict[];
    };

export type PendingItineraryReconciliationResult =
  | { status: "already-synced"; state: ItinerarySyncState }
  | { status: "pending"; state: ItinerarySyncState }
  | { status: "conflict"; state: ItinerarySyncState };

type LocatedCard = {
  dayKey: string;
  card: ItineraryItem;
};

type LocatedCardsResult =
  | { ok: true; cards: Map<string, LocatedCard> }
  | { ok: false; conflicts: ItineraryConflict[] };

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) =>
      key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]),
    );
};

const toLocatedCards = (
  daysData: Record<string, ItineraryItem[]>,
  source: "base" | "local" | "cloud",
): LocatedCardsResult => {
  const cards = new Map<string, LocatedCard>();
  const conflicts: ItineraryConflict[] = [];
  const occurrences = new Map<string, string[]>();

  for (const [dayKey, items] of Object.entries(daysData)) {
    items.forEach((card, index) => {
      if (!card.id) {
        conflicts.push({
          id: `legacy:${source}:${dayKey}:${index}`,
          kind: "legacy-id",
          dayKey,
          fields: ["id"],
        });
        return;
      }
      const seenIn = occurrences.get(card.id) ?? [];
      seenIn.push(dayKey);
      occurrences.set(card.id, seenIn);
      if (!cards.has(card.id)) cards.set(card.id, { dayKey, card });
      else {
        conflicts.push({
          id: `duplicate:${source}:${card.id}:${index}`,
          kind: "duplicate-id",
          cardId: card.id,
          dayKey,
          fields: ["id"],
        });
      }
    });
  }

  return conflicts.length
    ? { ok: false, conflicts }
    : { ok: true, cards };
};

const CARD_FIELD_GROUPS: Array<{ key: string; fields: string[] }> = [
  { key: "time", fields: ["time", "departureTime"] },
  { key: "title", fields: ["title"] },
  { key: "type", fields: ["type", "typeColor"] },
  { key: "desc", fields: ["desc"] },
  { key: "location", fields: ["location"] },
  { key: "place", fields: ["place"] },
  { key: "weather", fields: ["showWeather"] },
  { key: "travelKind", fields: ["travelKind"] },
  { key: "travelMode", fields: ["travelModeToNext", "includeInTravelCalculation"] },
  { key: "otherInfoFolder", fields: ["otherInfoFolderId"] },
  { key: "coverPhoto", fields: ["coverPhoto"] },
  { key: "travelEstimate", fields: ["travelToNext"] },
];

const mergeCardFields = (
  baseCard: ItineraryItem,
  localCard: ItineraryItem,
  cloudCard: ItineraryItem,
): { card: ItineraryItem; conflicts: string[] } => {
  const result = { ...baseCard } as ItineraryItem;
  const conflicts: string[] = [];
  const hasDependencyChange =
    !sameValue(baseCard.place, localCard.place) ||
    !sameValue(baseCard.place, cloudCard.place) ||
    !sameValue(baseCard.location, localCard.location) ||
    !sameValue(baseCard.location, cloudCard.location) ||
    !sameValue(baseCard.travelModeToNext, localCard.travelModeToNext) ||
    !sameValue(baseCard.travelModeToNext, cloudCard.travelModeToNext) ||
    !sameValue(baseCard.includeInTravelCalculation, localCard.includeInTravelCalculation) ||
    !sameValue(baseCard.includeInTravelCalculation, cloudCard.includeInTravelCalculation);

  for (const { key, fields } of CARD_FIELD_GROUPS) {
    const baseValue = fields.map((field) => baseCard[field as keyof ItineraryItem]);
    const localValue = fields.map((field) => localCard[field as keyof ItineraryItem]);
    const cloudValue = fields.map((field) => cloudCard[field as keyof ItineraryItem]);
    const localChanged = !sameValue(baseValue, localValue);
    const cloudChanged = !sameValue(baseValue, cloudValue);

    if (!localChanged && cloudChanged) {
      fields.forEach((field) => {
        const value = cloudCard[field as keyof ItineraryItem];
        if (value === undefined) delete (result as unknown as Record<string, unknown>)[field];
        else (result as unknown as Record<string, unknown>)[field] = value;
      });
      continue;
    }
    if (localChanged && !cloudChanged) {
      fields.forEach((field) => {
        const value = localCard[field as keyof ItineraryItem];
        if (value === undefined) delete (result as unknown as Record<string, unknown>)[field];
        else (result as unknown as Record<string, unknown>)[field] = value;
      });
      continue;
    }
    if (!localChanged || sameValue(localValue, cloudValue)) continue;

    conflicts.push(key);
    fields.forEach((field) => {
      const value = localCard[field as keyof ItineraryItem];
      if (value === undefined) delete (result as unknown as Record<string, unknown>)[field];
      else (result as unknown as Record<string, unknown>)[field] = value;
    });
  }

  // 路線估算依賴相鄰卡片與地點／交通偏好；有依賴資料改動時不能保留舊估算。
  if (hasDependencyChange) {
    delete result.travelToNext;
  }

  return { card: result, conflicts };
};

const orderChanged = (baseIds: string[], sideIds: string[]): boolean => {
  const baseExisting = new Set(baseIds);
  const sideCommon = sideIds.filter((id) => baseExisting.has(id));
  const baseCommon = baseIds.filter((id) => sideIds.includes(id));
  return !sameValue(baseCommon, sideCommon);
};

const mergeOneSidedOrder = (
  baseIds: string[],
  preferredIds: string[],
  otherIds: string[],
  keepIds: Set<string>,
): string[] => {
  const ordered: string[] = [];
  const append = (id: string) => {
    if (keepIds.has(id) && !ordered.includes(id)) ordered.push(id);
  };
  preferredIds.forEach(append);
  otherIds.forEach(append);
  baseIds.forEach(append);
  return ordered;
};

const makeCardConflict = (
  id: string,
  kind: ItineraryConflict["kind"],
  base: LocatedCard | undefined,
  local: LocatedCard | undefined,
  cloud: LocatedCard | undefined,
  fields: string[],
): ItineraryConflict => ({
  id: `card:${id}`,
  kind,
  cardId: id,
  dayKey: base?.dayKey ?? local?.dayKey ?? cloud?.dayKey,
  fields,
  baseDayKey: base?.dayKey ?? null,
  localDayKey: local?.dayKey ?? null,
  cloudDayKey: cloud?.dayKey ?? null,
  baseCard: base?.card ?? null,
  localCard: local?.card ?? null,
  cloudCard: cloud?.card ?? null,
});

export const sameItineraryDaysData = (
  left: Record<string, ItineraryItem[]>,
  right: Record<string, ItineraryItem[]>,
): boolean => sameValue(left, right);

export const mergeItineraryDaysData = (
  baseDaysData: Record<string, ItineraryItem[]>,
  localDaysData: Record<string, ItineraryItem[]>,
  cloudDaysData: Record<string, ItineraryItem[]>,
): ItineraryMergeResult => {
  const baseResult = toLocatedCards(baseDaysData, "base");
  const localResult = toLocatedCards(localDaysData, "local");
  const cloudResult = toLocatedCards(cloudDaysData, "cloud");
  const structuralConflicts = [
    ...(baseResult.ok ? [] : baseResult.conflicts),
    ...(localResult.ok ? [] : localResult.conflicts),
    ...(cloudResult.ok ? [] : cloudResult.conflicts),
  ];
  if (!baseResult.ok || !localResult.ok || !cloudResult.ok) {
    return {
      status: "conflict",
      daysData: localDaysData,
      conflicts: structuralConflicts,
    };
  }

  const base = baseResult.cards;
  const local = localResult.cards;
  const cloud = cloudResult.cards;
  const allIds = new Set([...base.keys(), ...local.keys(), ...cloud.keys()]);
  const merged = new Map<string, LocatedCard>();
  const conflicts: ItineraryConflict[] = [];

  for (const id of allIds) {
    const baseValue = base.get(id);
    const localValue = local.get(id);
    const cloudValue = cloud.get(id);
    const localChanged = !sameValue(baseValue, localValue);
    const cloudChanged = !sameValue(baseValue, cloudValue);

    if (!baseValue && localValue && cloudValue) {
      if (!sameValue(localValue, cloudValue)) {
        conflicts.push(makeCardConflict(id, "field", undefined, localValue, cloudValue, ["duplicate-create"]));
      }
      merged.set(id, localValue);
      continue;
    }

    if (baseValue && (!localValue || !cloudValue)) {
      const surviving = localValue ?? cloudValue;
      const survivorChanged = surviving ? !sameValue(baseValue, surviving) : false;
      if (survivorChanged) {
        conflicts.push(makeCardConflict(
          id,
          "delete-edit",
          baseValue,
          localValue,
          cloudValue,
          ["deletion"],
        ));
        if (localValue) merged.set(id, localValue);
      }
      continue;
    }

    const localMoved = Boolean(baseValue && localValue && localValue.dayKey !== baseValue.dayKey);
    const cloudMoved = Boolean(baseValue && cloudValue && cloudValue.dayKey !== baseValue.dayKey);
    if (baseValue && localValue && cloudValue &&
      localMoved && cloudMoved && localValue.dayKey !== cloudValue.dayKey) {
      conflicts.push(makeCardConflict(id, "move", baseValue, localValue, cloudValue, ["dayKey"]));
      merged.set(id, localValue);
      continue;
    }

    if (!localChanged) {
      if (cloudValue) {
        const card = baseValue && cloudValue
          ? mergeCardFields(baseValue.card, baseValue.card, cloudValue.card).card
          : cloudValue.card;
        merged.set(id, { ...cloudValue, card });
      }
      continue;
    }
    if (!cloudChanged || sameValue(localValue, cloudValue)) {
      if (localValue) {
        const card = baseValue && localValue
          ? mergeCardFields(baseValue.card, localValue.card, baseValue.card).card
          : localValue.card;
        merged.set(id, { ...localValue, card });
      }
      continue;
    }

    if (!localValue || !cloudValue) continue;

    const mergedFields = mergeCardFields(
      baseValue?.card ?? localValue.card,
      localValue.card,
      cloudValue.card,
    );
    const destination = localMoved ? localValue.dayKey : cloudMoved ? cloudValue.dayKey : localValue.dayKey;
    if (destination !== baseValue?.dayKey) delete mergedFields.card.travelToNext;
    merged.set(id, { dayKey: destination, card: mergedFields.card });

    if (mergedFields.conflicts.length) {
      conflicts.push(makeCardConflict(
        id,
        "field",
        baseValue,
        localValue,
        cloudValue,
        mergedFields.conflicts,
      ));
    }
  }

  const dayKeys = new Set([
    ...Object.keys(baseDaysData),
    ...Object.keys(localDaysData),
    ...Object.keys(cloudDaysData),
    ...[...merged.values()].map(({ dayKey }) => dayKey),
  ]);
  const daysData: Record<string, ItineraryItem[]> = Object.fromEntries(
    [...dayKeys].map((dayKey) => [dayKey, []]),
  );

  for (const dayKey of dayKeys) {
    const baseIds = (baseDaysData[dayKey] ?? []).flatMap((card) => card.id ? [card.id] : []);
    const localIds = (localDaysData[dayKey] ?? []).flatMap((card) => card.id ? [card.id] : []);
    const cloudIds = (cloudDaysData[dayKey] ?? []).flatMap((card) => card.id ? [card.id] : []);
    const localOrderChanged = orderChanged(baseIds, localIds);
    const cloudOrderChanged = orderChanged(baseIds, cloudIds);
    const idsForDay = new Set(
      [...merged.entries()]
        .filter(([, value]) => value.dayKey === dayKey)
        .map(([id]) => id),
    );

    if (localOrderChanged && cloudOrderChanged) {
      const localCommon = localIds.filter((id) => cloudIds.includes(id) && baseIds.includes(id));
      const cloudCommon = cloudIds.filter((id) => localIds.includes(id) && baseIds.includes(id));
      if (!sameValue(localCommon, cloudCommon)) {
        conflicts.push({
          id: `order:${dayKey}`,
          kind: "order",
          dayKey,
          fields: ["order"],
          baseOrder: baseIds,
          localOrder: localIds,
          cloudOrder: cloudIds,
        });
      }
    }

    const preferredOrder = localOrderChanged ? localIds : cloudOrderChanged ? cloudIds : baseIds;
    const fallbackOrder = localOrderChanged ? cloudIds : localIds;
    const order = localOrderChanged && cloudOrderChanged
      ? mergeOneSidedOrder(baseIds, localIds, cloudIds, idsForDay)
      : mergeOneSidedOrder(baseIds, preferredOrder, fallbackOrder, idsForDay);

    for (const id of order) {
      const item = merged.get(id);
      if (item?.dayKey === dayKey) daysData[dayKey].push(item.card);
    }
    for (const [id, item] of merged) {
      if (item.dayKey === dayKey && !order.includes(id)) daysData[dayKey].push(item.card);
    }
  }

  return conflicts.length
    ? { status: "conflict", daysData, conflicts }
    : { status: "merged", daysData, conflicts: [] };
};

export const reconcilePendingItinerarySyncState = (
  state: ItinerarySyncState,
  cloudDaysData: Record<string, ItineraryItem[]>,
  cloudUpdatedAt: string,
): PendingItineraryReconciliationResult => {
  const merge = mergeItineraryDaysData(
    state.baseDaysData,
    state.pendingDaysData,
    cloudDaysData,
  );
  if (merge.status === "conflict") {
    return {
      status: "conflict",
      state: {
        ...state,
        revision: crypto.randomUUID(),
        status: "conflict",
        updatedAt: new Date().toISOString(),
        pendingDaysData: merge.daysData,
        conflictCloudUpdatedAt: cloudUpdatedAt,
        conflictCloudDaysData: cloudDaysData,
        conflicts: merge.conflicts,
        resolutionChoices: [],
        lastError: `${merge.conflicts.length} 個行程卡片／排序衝突需要確認。`,
      },
    };
  }

  const now = new Date().toISOString();
  if (sameItineraryDaysData(merge.daysData, cloudDaysData)) {
    return {
      status: "already-synced",
      state: createSyncedItineraryState(state.tripId, cloudUpdatedAt, cloudDaysData),
    };
  }

  return {
    status: "pending",
    state: {
      ...state,
      revision: crypto.randomUUID(),
      status: "pending",
      updatedAt: now,
      baseCloudUpdatedAt: cloudUpdatedAt,
      baseDaysData: cloudDaysData,
      pendingDaysData: merge.daysData,
      conflictCloudUpdatedAt: undefined,
      conflictCloudDaysData: undefined,
      conflicts: [],
      resolutionChoices: [],
      lastError: undefined,
    },
  };
};

export const createPendingItinerarySyncState = (
  tripId: string,
  baseCloudUpdatedAt: string | null,
  baseDaysData: Record<string, ItineraryItem[]>,
  pendingDaysData: Record<string, ItineraryItem[]>,
  current?: ItinerarySyncState | null,
): ItinerarySyncState => ({
  tripId,
  revision: crypto.randomUUID(),
  status: "pending",
  updatedAt: new Date().toISOString(),
  baseCloudUpdatedAt: current?.status === "pending" || current?.status === "conflict" ? current.baseCloudUpdatedAt : baseCloudUpdatedAt,
  baseDaysData: current?.status === "pending" || current?.status === "conflict" ? current.baseDaysData : baseDaysData,
  pendingDaysData,
  conflicts: [],
  resolutionChoices: [],
});

export const createSyncedItineraryState = (
  tripId: string,
  cloudUpdatedAt: string,
  daysData: Record<string, ItineraryItem[]>,
): ItinerarySyncState => ({
  tripId,
  revision: crypto.randomUUID(),
  status: "synced",
  updatedAt: new Date().toISOString(),
  baseCloudUpdatedAt: cloudUpdatedAt,
  baseDaysData: daysData,
  pendingDaysData: daysData,
  conflicts: [],
  resolutionChoices: [],
});

export const createConflictedItineraryState = (
  state: ItinerarySyncState,
  mergedDaysData: Record<string, ItineraryItem[]>,
  error: string,
): ItinerarySyncState => ({
  ...state,
  revision: crypto.randomUUID(),
  status: "conflict",
  updatedAt: new Date().toISOString(),
  pendingDaysData: mergedDaysData,
  lastError: error,
});

export const saveItineraryResolutionChoice = (
  state: ItinerarySyncState,
  choice: ItineraryResolutionChoice,
): ItinerarySyncState => {
  const choices = (state.resolutionChoices ?? []).filter(
    (item) => item.conflictId !== choice.conflictId,
  );
  return {
    ...state,
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    resolutionChoices: [...choices, choice],
  };
};

export const applyItineraryResolutionChoices = (
  state: ItinerarySyncState,
): { daysData: Record<string, ItineraryItem[]>; unresolved: ItineraryConflict[] } => {
  const daysData: Record<string, ItineraryItem[]> = Object.fromEntries(
    Object.entries(state.pendingDaysData).map(([dayKey, items]) => [dayKey, [...items]]),
  );
  const choices = new Map((state.resolutionChoices ?? []).map((item) => [item.conflictId, item]));
  const unresolved: ItineraryConflict[] = [];

  for (const conflict of state.conflicts ?? []) {
    const choice = choices.get(conflict.id);
    if (!choice) {
      unresolved.push(conflict);
      continue;
    }

    if (conflict.kind === "order" && choice.kind === "order") {
      const ids = (choice.order === "local" ? conflict.localOrder : conflict.cloudOrder) ?? [];
      const currentById = new Map(
        Object.values(daysData).flat().flatMap((card) => card.id ? [[card.id, card] as const] : []),
      );
      const dayCards = ids.flatMap((id) => {
        const card = currentById.get(id);
        return card ? [card] : [];
      });
      const currentIds = new Set(dayCards.flatMap((card) => card.id ? [card.id] : []));
      const pendingCards = daysData[conflict.dayKey ?? ""] ?? [];
      for (const card of pendingCards) {
        if (card.id && !currentIds.has(card.id)) dayCards.push(card);
      }
      daysData[conflict.dayKey ?? ""] = dayCards;
      continue;
    }

    const cardId = conflict.cardId;
    if (!cardId) {
      unresolved.push(conflict);
      continue;
    }
    const selected = choice.kind === "cloud" ? conflict.cloudCard : conflict.localCard;
    const currentDay = conflict.dayKey ?? conflict.localDayKey ?? conflict.cloudDayKey ?? "1";
    for (const [dayKey, items] of Object.entries(daysData)) {
      daysData[dayKey] = items.filter((item) => item.id !== cardId);
    }

    if (choice.kind === "delete" || (!selected && choice.kind === "local") ||
      (choice.kind === "cloud" && !conflict.cloudCard)) {
      continue;
    }
    if (choice.kind === "restore" && !selected) {
      unresolved.push(conflict);
      continue;
    }

    let resolvedCard = selected ?? conflict.localCard ?? conflict.cloudCard ?? undefined;
    if (!resolvedCard) {
      unresolved.push(conflict);
      continue;
    }
    if (choice.kind === "fields") {
      const mutable = { ...resolvedCard } as ItineraryItem;
      const cloud = conflict.cloudCard;
      const local = conflict.localCard;
      if (!cloud || !local) {
        unresolved.push(conflict);
        continue;
      }
      for (const [groupKey, source] of Object.entries(choice.fields)) {
        const group = CARD_FIELD_GROUPS.find((item) => item.key === groupKey);
        if (!group) continue;
        const sourceCard = source === "cloud" ? cloud : local;
        for (const field of group.fields) {
          const value = sourceCard[field as keyof ItineraryItem];
          if (value === undefined) delete (mutable as unknown as Record<string, unknown>)[field];
          else (mutable as unknown as Record<string, unknown>)[field] = value;
        }
      }
      if (
        !sameValue(conflict.baseCard?.place, mutable.place) ||
        !sameValue(conflict.baseCard?.location, mutable.location) ||
        !sameValue(conflict.baseCard?.travelModeToNext, mutable.travelModeToNext)
      ) delete mutable.travelToNext;
      resolvedCard = mutable;
    }
    const destination = choice.kind === "restore"
      ? choice.dayKey ?? currentDay
      : choice.kind === "cloud"
        ? conflict.cloudDayKey ?? currentDay
        : conflict.localDayKey ?? currentDay;
    daysData[destination] ??= [];
    daysData[destination].push(resolvedCard);
  }

  return { daysData, unresolved };
};

export const hasUnresolvedItineraryConflicts = (state: ItinerarySyncState): boolean =>
  (state.conflicts ?? []).some((conflict) =>
    !(state.resolutionChoices ?? []).some((choice) => choice.conflictId === conflict.id),
  );
