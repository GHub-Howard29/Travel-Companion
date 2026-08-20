import type { PrivateChecklist, PrivateChecklistItem } from "../types";

const PRIVATE_CHECKLIST_STORAGE_PREFIX = "travel_companion_private_checklist";
const PRIVATE_CHECKLIST_PENDING_PREFIX =
  "travel_companion_pending_private_checklist";

export interface PrivateChecklistPendingState {
  revision: string;
  baseItemIds: string[] | null;
  baseItems: PrivateChecklistItem[] | null;
}

const getPrivateChecklistStorageKey = (
  tripId: string,
  userEmail: string,
): string => {
  return `${PRIVATE_CHECKLIST_STORAGE_PREFIX}_${tripId}_${userEmail}`;
};

const isPrivateChecklistItem = (
  value: unknown,
): value is PrivateChecklistItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<PrivateChecklistItem>;

  return (
    typeof item.id === "string" &&
    typeof item.tripId === "string" &&
    typeof item.userEmail === "string" &&
    typeof item.label === "string" &&
    typeof item.isChecked === "boolean" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
};

const isPrivateChecklist = (value: unknown): value is PrivateChecklist => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const checklist = value as Partial<PrivateChecklist>;

  return (
    typeof checklist.tripId === "string" &&
    typeof checklist.userEmail === "string" &&
    Array.isArray(checklist.items) &&
    checklist.items.every(isPrivateChecklistItem) &&
    typeof checklist.updatedAt === "string"
  );
};

export const readStoredPrivateChecklist = (
  tripId: string,
  userEmail: string,
): PrivateChecklist => {
  const fallback: PrivateChecklist = {
    tripId,
    userEmail,
    items: [],
    updatedAt: "",
  };
  const rawData = localStorage.getItem(
    getPrivateChecklistStorageKey(tripId, userEmail),
  );

  if (!rawData) {
    return fallback;
  }

  try {
    const parsedData = JSON.parse(rawData);

    if (
      !isPrivateChecklist(parsedData) ||
      parsedData.tripId !== tripId ||
      parsedData.userEmail !== userEmail ||
      parsedData.items.some(
        (item) => item.tripId !== tripId || item.userEmail !== userEmail,
      )
    ) {
      return fallback;
    }

    return parsedData;
  } catch {
    return fallback;
  }
};

export const writeStoredPrivateChecklist = (
  checklist: PrivateChecklist,
): void => {
  localStorage.setItem(
    getPrivateChecklistStorageKey(checklist.tripId, checklist.userEmail),
    JSON.stringify(checklist),
  );
};

const getPrivateChecklistPendingKey = (
  tripId: string,
  userEmail: string,
): string => `${PRIVATE_CHECKLIST_PENDING_PREFIX}_${tripId}_${userEmail}`;

export const markPrivateChecklistPending = (
  checklist: PrivateChecklist,
  baseItems: PrivateChecklistItem[],
): string => {
  const revision = crypto.randomUUID();
  const currentPending = readPrivateChecklistPending(
    checklist.tripId,
    checklist.userEmail,
  );
  const mergedBaseItemsById = new Map(
    (currentPending?.baseItems ?? []).map((item) => [item.id, item]),
  );
  baseItems.forEach((item) => {
    if (!mergedBaseItemsById.has(item.id)) {
      mergedBaseItemsById.set(item.id, item);
    }
  });
  const mergedBaseItems = Array.from(mergedBaseItemsById.values());
  localStorage.setItem(
    getPrivateChecklistPendingKey(checklist.tripId, checklist.userEmail),
    JSON.stringify({
      revision,
      baseItemIds: mergedBaseItems.map((item) => item.id),
      baseItems: mergedBaseItems,
    } satisfies PrivateChecklistPendingState),
  );
  return revision;
};

export const readPrivateChecklistPending = (
  tripId: string,
  userEmail: string,
): PrivateChecklistPendingState | null => {
  const rawData = localStorage.getItem(
    getPrivateChecklistPendingKey(tripId, userEmail),
  );
  if (!rawData) return null;

  try {
    const parsedData = JSON.parse(rawData) as Partial<PrivateChecklistPendingState>;
    if (
      typeof parsedData.revision === "string" &&
      (parsedData.baseItemIds === null ||
        (Array.isArray(parsedData.baseItemIds) &&
          parsedData.baseItemIds.every((itemId) => typeof itemId === "string")))
    ) {
      return {
        revision: parsedData.revision,
        baseItemIds: parsedData.baseItemIds,
        baseItems:
          Array.isArray(parsedData.baseItems) &&
          parsedData.baseItems.every(isPrivateChecklistItem)
            ? parsedData.baseItems
            : null,
      };
    }
  } catch {
    // 舊版 pending 只保存 revision 字串；保留相容但不推測其合併基準。
  }

  return {
    revision: rawData,
    baseItemIds: null,
    baseItems: null,
  };
};

export const readPrivateChecklistPendingRevision = (
  tripId: string,
  userEmail: string,
): string | null =>
  readPrivateChecklistPending(tripId, userEmail)?.revision ?? null;

export const clearPrivateChecklistPending = (
  tripId: string,
  userEmail: string,
  revision: string,
): boolean => {
  const key = getPrivateChecklistPendingKey(tripId, userEmail);
  if (readPrivateChecklistPendingRevision(tripId, userEmail) !== revision) {
    return false;
  }
  localStorage.removeItem(key);
  return true;
};
