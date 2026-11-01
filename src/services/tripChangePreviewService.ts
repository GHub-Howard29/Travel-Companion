import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItineraryItem } from "../types";
import { APP_SOURCE_CLIENT_ID } from "./tripDataRevisionService.ts";

export type TripChangeCategory =
  | "itinerary"
  | "photo"
  | "settings";

export type TripChangeAction = "added" | "updated" | "deleted" | "changed";

interface TripChangeJournalRow {
  category: TripChangeCategory;
  action: TripChangeAction;
  item_count: number;
  source_client_id: string | null;
  occurred_at: string;
}

export interface TripChangeActionCounts {
  added: number;
  updated: number;
  deleted: number;
  changed: number;
}

export interface TripChangeCategorySummary {
  category: TripChangeCategory;
  total: number;
  actions: TripChangeActionCounts;
}

export interface TripChangePreviewSummary {
  categories: TripChangeCategorySummary[];
  totalChanges: number;
  lastChangedAt: string | null;
  sourceLabel: "其他裝置" | "遠端資料";
}

export interface TripChangePreviewWindow {
  fromRevision: number;
  toRevision: number;
  fromUpdatedAt: string;
  toUpdatedAt: string;
}

export interface ItineraryChangeSnapshot {
  revision: number;
  updatedAt: string;
  daysData: Record<string, ItineraryItem[]>;
}

const SNAPSHOT_KEY_PREFIX = "travel_companion_trip_change_confirmed:";

export const readConfirmedItinerarySnapshot = (tripId: string): ItineraryChangeSnapshot | null => {
  try {
    const value = JSON.parse(localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${tripId}`) ?? "null") as ItineraryChangeSnapshot | null;
    if (!value || !Number.isSafeInteger(value.revision) || typeof value.updatedAt !== "string" || !value.daysData || typeof value.daysData !== "object") return null;
    return value;
  } catch {
    return null;
  }
};

export const writeConfirmedItinerarySnapshot = (tripId: string, snapshot: ItineraryChangeSnapshot): void => {
  localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${tripId}`, JSON.stringify(snapshot));
};

const CATEGORY_ORDER: TripChangeCategory[] = [
  "itinerary",
  "photo",
  "settings",
];

const emptyActions = (): TripChangeActionCounts => ({
  added: 0,
  updated: 0,
  deleted: 0,
  changed: 0,
});

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]));
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length && aKeys.every((key, index) =>
    key === bKeys[index] && sameValue(a[key], b[key]));
};

export const summarizeItineraryNetChanges = (
  baseline: Record<string, ItineraryItem[]>,
  current: Record<string, ItineraryItem[]>,
): TripChangeCategorySummary | null => {
  const locate = (daysData: Record<string, ItineraryItem[]>) => {
    const cards = new Map<string, { dayKey: string; card: ItineraryItem }>();
    for (const [dayKey, items] of Object.entries(daysData)) {
      items.forEach((card, index) => {
        const id = card.id || `legacy:${dayKey}:${index}:${card.title}`;
        cards.set(id, { dayKey, card });
      });
    }
    return cards;
  };
  const before = locate(baseline);
  const after = locate(current);
  const actions = emptyActions();
  for (const [id, next] of after) {
    const previous = before.get(id);
    if (!previous) actions.added += 1;
    else if (previous.dayKey !== next.dayKey || !sameValue(previous.card, next.card)) actions.updated += 1;
  }
  for (const id of before.keys()) {
    if (!after.has(id)) actions.deleted += 1;
  }
  const total = actions.added + actions.updated + actions.deleted;
  return total > 0 ? { category: "itinerary", total, actions } : null;
};

export const getTripChangePreview = async (
  supabase: SupabaseClient,
  tripId: string,
  window: TripChangePreviewWindow,
  currentDaysData: Record<string, ItineraryItem[]>,
  currentUpdatedAt: string,
  monitoringBaseline?: ItineraryChangeSnapshot,
): Promise<TripChangePreviewSummary> => {
  const baseline = monitoringBaseline ?? readConfirmedItinerarySnapshot(tripId);
  if (!baseline) {
    writeConfirmedItinerarySnapshot(tripId, {
      revision: window.fromRevision,
      updatedAt: window.fromUpdatedAt,
      daysData: currentDaysData,
    });
    return {
      categories: [],
      totalChanges: 0,
      lastChangedAt: null,
      sourceLabel: "其他裝置",
    };
  }

  const itinerarySummary = summarizeItineraryNetChanges(
    baseline.daysData,
    currentDaysData,
  );
  const { data, error } = await supabase
    .from("trip_change_journal")
    .select("category, action, item_count, source_client_id, occurred_at")
    .eq("trip_id", tripId)
    .gt("revision", baseline.revision)
    .lte("revision", window.toRevision)
    .gt("occurred_at", baseline.updatedAt)
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  const rows = ((data ?? []) as TripChangeJournalRow[]).filter(
    (row) => row.source_client_id !== APP_SOURCE_CLIENT_ID,
  );
  const summaries = new Map<TripChangeCategory, TripChangeCategorySummary>();
  let lastChangedAt: string | null = null;
  let hasUnknownSource = false;

  rows.forEach((row) => {
    if (!CATEGORY_ORDER.includes(row.category)) return;
    if (!["added", "updated", "deleted", "changed"].includes(row.action)) {
      return;
    }
    const count = Number(row.item_count);
    if (!Number.isSafeInteger(count) || count <= 0) return;

    const current = summaries.get(row.category) ?? {
      category: row.category,
      total: 0,
      actions: emptyActions(),
    };
    current.total += count;
    current.actions[row.action] += count;
    summaries.set(row.category, current);

    if (!lastChangedAt || row.occurred_at > lastChangedAt) {
      lastChangedAt = row.occurred_at;
    }
    if (!row.source_client_id) hasUnknownSource = true;
  });

  // The itinerary journal records operations, not final card state. Replace
  // its raw added/deleted counters with the net baseline-to-cloud difference.
  if (itinerarySummary) summaries.set("itinerary", itinerarySummary);
  else summaries.delete("itinerary");

  const categories = CATEGORY_ORDER.flatMap((category) => {
    const summary = summaries.get(category);
    return summary ? [summary] : [];
  });

  return {
    categories,
    totalChanges: categories.reduce((sum, item) => sum + item.total, 0),
    lastChangedAt: currentUpdatedAt || lastChangedAt,
    sourceLabel: hasUnknownSource ? "遠端資料" : "其他裝置",
  };
};
