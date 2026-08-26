import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChecklistItem, SharedChecklist, SharedChecklistItem } from "../types";

interface CloudChecklistRow {
  id: string;
  updated_at: string;
}

interface CloudChecklistItemRow {
  id: string;
  client_item_id: string | null;
  label: string;
  is_checked: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CloudChecklistItemIdentityRow {
  id: string;
  client_item_id: string | null;
  deleted_at: string | null;
}

const SHARED_CHECKLIST_TITLE = "共同檢查清單";
const FALLBACK_CATEGORY = "其他";

export const getCloudSharedChecklistId = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("checklists")
    .select("id")
    .eq("trip_id", tripId)
    .eq("scope", "shared")
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
};

const getCurrentUserId = async (
  supabase: SupabaseClient,
): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user?.id ?? null;
};

const findSeedItem = (
  seedItems: ChecklistItem[],
  cloudItem: CloudChecklistItemRow,
): ChecklistItem | undefined => {
  return seedItems.find((item) => item.id === cloudItem.client_item_id);
};

const mapCloudRowsToSharedChecklist = (
  tripId: string,
  checklist: CloudChecklistRow,
  rows: CloudChecklistItemRow[],
  seedItems: ChecklistItem[],
): SharedChecklist => {
  const items = rows.map((item): SharedChecklistItem => {
    const seedItem = findSeedItem(seedItems, item);

    return {
      id: item.client_item_id ?? `cloud_${item.id}`,
      tripId,
      category: seedItem?.category ?? FALLBACK_CATEGORY,
      label: item.label,
      isChecked: item.is_checked,
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });
  const latestItemUpdatedAt = items.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    checklist.updated_at,
  );

  return {
    tripId,
    items,
    updatedAt: latestItemUpdatedAt,
  };
};

export const getCloudSharedChecklist = async (
  supabase: SupabaseClient,
  tripId: string,
  seedItems: ChecklistItem[],
): Promise<SharedChecklist | null> => {
  const { data: checklist, error: selectError } = await supabase
    .from("checklists")
    .select("id, updated_at")
    .eq("trip_id", tripId)
    .eq("scope", "shared")
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (!checklist) {
    return null;
  }

  const { data: rows, error: itemError } = await supabase
    .from("checklist_items")
    .select("id, client_item_id, label, is_checked, sort_order, created_at, updated_at")
    .eq("checklist_id", checklist.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  return mapCloudRowsToSharedChecklist(
    tripId,
    checklist as CloudChecklistRow,
    (rows ?? []) as CloudChecklistItemRow[],
    seedItems,
  );
};

export const initializeCloudSharedChecklist = async (
  supabase: SupabaseClient,
  tripId: string,
  seedItems: ChecklistItem[],
  checkedItemIds: string[],
): Promise<SharedChecklist | null> => {
  const userId = await getCurrentUserId(supabase);

  if (!userId) {
    return null;
  }

  const { data: createdChecklist, error: insertError } = await supabase
    .from("checklists")
    .insert({
      trip_id: tripId,
      scope: "shared",
      owner_user_id: null,
      created_by: userId,
      title: SHARED_CHECKLIST_TITLE,
    })
    .select("id, updated_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return getCloudSharedChecklist(supabase, tripId, seedItems);
    }

    throw insertError;
  }

  if (seedItems.length > 0) {
    const checkedItemIdSet = new Set(checkedItemIds);
    const { error: itemError } = await supabase.from("checklist_items").insert(
      seedItems.map((item, sortOrder) => ({
        checklist_id: createdChecklist.id,
        client_item_id: item.id,
        label: item.label,
        is_checked: checkedItemIdSet.has(item.id),
        sort_order: sortOrder,
        created_by: userId,
      })),
    );

    if (itemError) {
      throw itemError;
    }
  }

  return getCloudSharedChecklist(supabase, tripId, seedItems);
};

export const syncCloudSharedChecklistSeedItems = async (
  supabase: SupabaseClient,
  tripId: string,
  seedItems: ChecklistItem[],
  checkedItemIds: string[],
  shouldSyncCheckedState = false,
): Promise<SharedChecklist | null> => {
  const userId = await getCurrentUserId(supabase);

  if (!userId) {
    return null;
  }

  const { data: checklist, error: checklistError } = await supabase
    .from("checklists")
    .select("id")
    .eq("trip_id", tripId)
    .eq("scope", "shared")
    .maybeSingle();

  if (checklistError) {
    throw checklistError;
  }

  if (!checklist) {
    return initializeCloudSharedChecklist(
      supabase,
      tripId,
      seedItems,
      checkedItemIds,
    );
  }

  const { data: existingRows, error: itemSelectError } = await supabase
    .from("checklist_items")
    .select("id, client_item_id, deleted_at")
    .eq("checklist_id", checklist.id);

  if (itemSelectError) {
    throw itemSelectError;
  }

  const existingRowsByClientItemId = new Map<
    string,
    CloudChecklistItemIdentityRow
  >();

  for (const row of (existingRows ?? []) as CloudChecklistItemIdentityRow[]) {
    if (row.client_item_id) {
      existingRowsByClientItemId.set(row.client_item_id, row);
    }
  }

  const checkedItemIdSet = new Set(checkedItemIds);
  const activeSeedItemIdSet = new Set(seedItems.map((item) => item.id));
  const missingSeedItems = seedItems.filter(
    (item) => !existingRowsByClientItemId.has(item.id),
  );
  const existingSeedRows = seedItems
    .map((item) => {
      const row = existingRowsByClientItemId.get(item.id);
      return row ? { item, row } : null;
    })
    .filter(
      (entry): entry is { item: ChecklistItem; row: CloudChecklistItemIdentityRow } =>
        Boolean(entry),
    );
  const deletedSeedRows = seedItems
    .map((item) => existingRowsByClientItemId.get(item.id))
    .filter((row): row is CloudChecklistItemIdentityRow =>
      Boolean(row?.deleted_at),
    );

  if (missingSeedItems.length > 0) {
    const { error: insertError } = await supabase.from("checklist_items").insert(
      missingSeedItems.map((item) => ({
        checklist_id: checklist.id,
        client_item_id: item.id,
        label: item.label,
        is_checked: checkedItemIdSet.has(item.id),
        sort_order: seedItems.findIndex((seedItem) => seedItem.id === item.id),
        created_by: userId,
      })),
    );

    if (insertError) {
      if (insertError.code === "23505") {
        return getCloudSharedChecklist(supabase, tripId, seedItems);
      }

      throw insertError;
    }
  }

  for (const { item, row } of existingSeedRows) {
    const nextValues: {
      label: string;
      sort_order: number;
      deleted_at: null;
      is_checked?: boolean;
    } = {
      label: item.label,
      sort_order: seedItems.findIndex((seedItem) => seedItem.id === item.id),
      deleted_at: null,
    };
    if (shouldSyncCheckedState) {
      nextValues.is_checked = checkedItemIdSet.has(item.id);
    }
    const { error: updateError } = await supabase
      .from("checklist_items")
      .update(nextValues)
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
  }

  if (deletedSeedRows.length > 0) {
    const { error: restoreError } = await supabase
      .from("checklist_items")
      .update({ deleted_at: null })
      .in(
        "id",
        deletedSeedRows.map((row) => row.id),
      );

    if (restoreError) {
      throw restoreError;
    }
  }

  const removedSeedRows = ((existingRows ?? []) as CloudChecklistItemIdentityRow[])
    .filter(
      (row) =>
        row.client_item_id &&
        !activeSeedItemIdSet.has(row.client_item_id) &&
        !row.deleted_at,
    );

  if (removedSeedRows.length > 0) {
    const { error: removeError } = await supabase
      .from("checklist_items")
      .update({ deleted_at: new Date().toISOString() })
      .in(
        "id",
        removedSeedRows.map((row) => row.id),
      );

    if (removeError) {
      throw removeError;
    }
  }

  return getCloudSharedChecklist(supabase, tripId, seedItems);
};

export const updateCloudSharedChecklistItemChecked = async (
  supabase: SupabaseClient,
  tripId: string,
  itemId: string,
  isChecked: boolean,
): Promise<boolean> => {
  const { data: checklist, error: checklistError } = await supabase
    .from("checklists")
    .select("id")
    .eq("trip_id", tripId)
    .eq("scope", "shared")
    .maybeSingle();

  if (checklistError) {
    throw checklistError;
  }

  if (!checklist) {
    return false;
  }

  const { data, error: itemError } = await supabase
    .from("checklist_items")
    .update({ is_checked: isChecked })
    .eq("checklist_id", checklist.id)
    .eq("client_item_id", itemId)
    .select("id")
    .maybeSingle();

  if (itemError) {
    throw itemError;
  }

  return Boolean(data);
};
