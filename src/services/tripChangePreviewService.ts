import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_SOURCE_CLIENT_ID } from "./tripDataRevisionService";

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

export const getTripChangePreview = async (
  supabase: SupabaseClient,
  tripId: string,
  window: TripChangePreviewWindow,
): Promise<TripChangePreviewSummary> => {
  const { data, error } = await supabase
    .from("trip_change_journal")
    .select("category, action, item_count, source_client_id, occurred_at")
    .eq("trip_id", tripId)
    .gt("revision", window.fromRevision)
    .lte("revision", window.toRevision)
    .gt("occurred_at", window.fromUpdatedAt)
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  const rows = ((data ?? []) as TripChangeJournalRow[]).filter(
    (row) =>
      row.source_client_id === null ||
      row.source_client_id !== APP_SOURCE_CLIENT_ID,
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

  const categories = CATEGORY_ORDER.flatMap((category) => {
    const summary = summaries.get(category);
    return summary ? [summary] : [];
  });

  return {
    categories,
    totalChanges: categories.reduce((sum, item) => sum + item.total, 0),
    lastChangedAt,
    sourceLabel: hasUnknownSource ? "遠端資料" : "其他裝置",
  };
};
