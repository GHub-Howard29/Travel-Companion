import type { SupabaseClient } from "@supabase/supabase-js";

import type { PrivateChecklist, PrivateChecklistItem } from "../types";

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
  deleted_at?: string | null;
}

interface CloudPrivateChecklistCopyRow {
  trip_id: string;
  checklist_items: CloudChecklistItemRow[];
}

const PRIVATE_CHECKLIST_TITLE = "私人確認清單";

const getCurrentUserId = async (
  supabase: SupabaseClient,
): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user?.id ?? null;
};

const ensureCloudPrivateChecklist = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<CloudChecklistRow | null> => {
  const userId = await getCurrentUserId(supabase);

  if (!userId) {
    return null;
  }

  const { data: existingChecklist, error: selectError } = await supabase
    .from("checklists")
    .select("id, updated_at")
    .eq("trip_id", tripId)
    .eq("scope", "private")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingChecklist) {
    return existingChecklist as CloudChecklistRow;
  }

  const { data: createdChecklist, error: insertError } = await supabase
    .from("checklists")
    .insert({
      trip_id: tripId,
      scope: "private",
      owner_user_id: userId,
      created_by: userId,
      title: PRIVATE_CHECKLIST_TITLE,
    })
    .select("id, updated_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: checklistAfterConflict, error: conflictSelectError } =
        await supabase
          .from("checklists")
          .select("id, updated_at")
          .eq("trip_id", tripId)
          .eq("scope", "private")
          .eq("owner_user_id", userId)
          .maybeSingle();

      if (conflictSelectError) {
        throw conflictSelectError;
      }

      return (checklistAfterConflict as CloudChecklistRow | null) ?? null;
    }

    throw insertError;
  }

  return createdChecklist as CloudChecklistRow;
};

export const getCloudPrivateChecklist = async (
  supabase: SupabaseClient,
  tripId: string,
  userEmail: string,
): Promise<PrivateChecklist | null> => {
  const checklist = await ensureCloudPrivateChecklist(supabase, tripId);

  if (!checklist) {
    return null;
  }

  const { data: rows, error } = await supabase
    .from("checklist_items")
    .select("id, client_item_id, label, is_checked, sort_order, created_at, updated_at")
    .eq("checklist_id", checklist.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const items = ((rows ?? []) as CloudChecklistItemRow[]).map(
    (item): PrivateChecklistItem => ({
      id: item.client_item_id ?? `cloud_${item.id}`,
      tripId,
      userEmail,
      label: item.label,
      isChecked: item.is_checked,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  );

  const latestItemUpdatedAt = items.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    checklist.updated_at,
  );

  return {
    tripId,
    userEmail,
    items,
    updatedAt: latestItemUpdatedAt,
  };
};

export const pushPrivateChecklistToCloud = async (
  supabase: SupabaseClient,
  checklist: PrivateChecklist,
): Promise<void> => {
  const cloudChecklist = await ensureCloudPrivateChecklist(
    supabase,
    checklist.tripId,
  );
  const userId = await getCurrentUserId(supabase);

  if (!cloudChecklist || !userId) {
    return;
  }

  const { data: existingRows, error: selectError } = await supabase
    .from("checklist_items")
    .select("id, client_item_id")
    .eq("checklist_id", cloudChecklist.id);

  if (selectError) {
    throw selectError;
  }

  const existingItemsByClientId = new Map<string, { id: string }>();
  const localItemIds = new Set(checklist.items.map((item) => item.id));

  for (const row of (existingRows ?? []) as Array<{
    id: string;
    client_item_id: string | null;
  }>) {
    if (row.client_item_id) {
      existingItemsByClientId.set(row.client_item_id, { id: row.id });
    }
  }

  for (const [sortOrder, item] of checklist.items.entries()) {
    const existingItem = existingItemsByClientId.get(item.id);
    const payload = {
      label: item.label,
      is_checked: item.isChecked,
      sort_order: sortOrder,
      deleted_at: null,
    };

    if (existingItem) {
      const { error } = await supabase
        .from("checklist_items")
        .update(payload)
        .eq("id", existingItem.id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from("checklist_items").insert({
        checklist_id: cloudChecklist.id,
        client_item_id: item.id,
        created_by: userId,
        ...payload,
      });

      if (error) {
        throw error;
      }
    }
  }

  const deletedCloudItemIds = ((existingRows ?? []) as Array<{
    id: string;
    client_item_id: string | null;
  }>)
    .filter((row) => row.client_item_id && !localItemIds.has(row.client_item_id))
    .map((row) => row.id);

  if (deletedCloudItemIds.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("checklist_items")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", deletedCloudItemIds);

  if (deleteError) {
    throw deleteError;
  }
};

export const listCloudPrivateChecklistCopies = async (
  supabase: SupabaseClient,
  userEmail: string,
): Promise<PrivateChecklist[]> => {
  const userId = await getCurrentUserId(supabase);

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("checklists")
    .select(
      "trip_id, checklist_items(id, client_item_id, label, is_checked, sort_order, created_at, updated_at, deleted_at)",
    )
    .eq("scope", "private")
    .eq("owner_user_id", userId)
    .order("trip_id", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as CloudPrivateChecklistCopyRow[])
    .map((row): PrivateChecklist => {
      const items = (row.checklist_items ?? [])
        .filter((item) => Boolean(item.client_item_id) && !item.deleted_at)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((item): PrivateChecklistItem => ({
          id: item.client_item_id ?? `cloud_${item.id}`,
          tripId: row.trip_id,
          userEmail,
          label: item.label,
          isChecked: item.is_checked,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }));

      return {
        tripId: row.trip_id,
        userEmail,
        items,
        updatedAt:
          items.reduce(
            (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
            "",
          ) || "",
      };
    })
    .filter((checklist) => checklist.items.length > 0);
};
