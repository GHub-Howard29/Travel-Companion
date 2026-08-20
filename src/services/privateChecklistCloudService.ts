import type { SupabaseClient } from "@supabase/supabase-js";

import type { PrivateChecklist, PrivateChecklistItem } from "../types";
import {
  clearPrivateChecklistPending,
  readPrivateChecklistPending,
  readPrivateChecklistPendingRevision,
  readStoredPrivateChecklist,
  writeStoredPrivateChecklist,
} from "../storage/privateChecklistStorage";

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
  deleted_at: string | null;
}

interface CloudPrivateChecklistCopyRow {
  trip_id: string;
  checklist_items: CloudChecklistItemRow[];
}

const PRIVATE_CHECKLIST_TITLE = "私人確認清單";
const privateChecklistPushQueues = new Map<string, Promise<void>>();
const privateChecklistSyncQueues = new Map<
  string,
  Promise<PrivateChecklist>
>();

const mergePendingPrivateChecklist = (
  localChecklist: PrivateChecklist,
  cloudChecklist: PrivateChecklist | null,
  baseItems: PrivateChecklistItem[] | null,
): PrivateChecklist => {
  if (!cloudChecklist) return localChecklist;

  const localItemsById = new Map(localChecklist.items.map((item) => [item.id, item]));
  const cloudItemsById = new Map(cloudChecklist.items.map((item) => [item.id, item]));
  const baseItemsById = new Map((baseItems ?? []).map((item) => [item.id, item]));
  const hasChanged = (
    item: PrivateChecklistItem,
    baseItem: PrivateChecklistItem,
  ) => item.label !== baseItem.label || item.isChecked !== baseItem.isChecked;
  const mergedItems: PrivateChecklistItem[] = [];

  for (const localItem of localChecklist.items) {
    const cloudItem = cloudItemsById.get(localItem.id);
    const baseItem = baseItemsById.get(localItem.id);

    if (cloudItem) {
      if (!baseItem) {
        mergedItems.push(
          cloudItem.updatedAt > localItem.updatedAt ? cloudItem : localItem,
        );
        continue;
      }

      const localChanged = hasChanged(localItem, baseItem);
      const cloudChanged = hasChanged(cloudItem, baseItem);
      if (localChanged && !cloudChanged) {
        mergedItems.push(localItem);
      } else if (cloudChanged && !localChanged) {
        mergedItems.push(cloudItem);
      } else if (localChanged && cloudChanged) {
        // 跨裝置時鐘不可可靠比較；雙方皆修改時以已同步雲端版本為準。
        mergedItems.push(cloudItem);
      } else {
        mergedItems.push(
          cloudItem.updatedAt > localItem.updatedAt ? cloudItem : localItem,
        );
      }
      continue;
    }

    // 雲端刪除、本機仍存在：本機有修改時保留；雙方無法判定時採資料保留。
    if (!baseItem || hasChanged(localItem, baseItem)) {
      mergedItems.push(localItem);
    }
  }

  for (const cloudItem of cloudChecklist.items) {
    if (localItemsById.has(cloudItem.id)) continue;
    const baseItem = baseItemsById.get(cloudItem.id);

    // 本機刪除、雲端仍存在：雲端有修改時保留；真正未修改才接受刪除。
    if (!baseItem || hasChanged(cloudItem, baseItem)) {
      mergedItems.push(cloudItem);
    }
  }

  return {
    ...localChecklist,
    items: mergedItems,
    updatedAt:
      localChecklist.updatedAt > cloudChecklist.updatedAt
        ? localChecklist.updatedAt
        : cloudChecklist.updatedAt,
  };
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
    .select("id, client_item_id, label, is_checked, sort_order, created_at, updated_at, deleted_at")
    .eq("checklist_id", checklist.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const cloudItems = (rows ?? []) as CloudChecklistItemRow[];
  const items = cloudItems
    .filter((item) => !item.deleted_at)
    .map((item): PrivateChecklistItem => ({
      id: item.client_item_id ?? `cloud_${item.id}`,
      tripId,
      userEmail,
      label: item.label,
      isChecked: item.is_checked,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

  const latestCloudUpdatedAt = cloudItems.reduce(
    (latest, item) => {
      const itemLatestAt = item.deleted_at && item.deleted_at > item.updated_at
        ? item.deleted_at
        : item.updated_at;
      return itemLatestAt > latest ? itemLatestAt : latest;
    },
    checklist.updated_at,
  );

  return {
    tripId,
    userEmail,
    items,
    updatedAt: latestCloudUpdatedAt,
  };
};

const pushPrivateChecklistSnapshotToCloud = async (
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

  if (deletedCloudItemIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("checklist_items")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", deletedCloudItemIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error: touchError } = await supabase
    .from("checklists")
    .update({ title: PRIVATE_CHECKLIST_TITLE })
    .eq("id", cloudChecklist.id);

  if (touchError) {
    throw touchError;
  }
};

export const pushPrivateChecklistToCloud = async (
  supabase: SupabaseClient,
  checklist: PrivateChecklist,
): Promise<void> => {
  const scopeKey = `${checklist.tripId}:${checklist.userEmail}`;
  const previousPush = privateChecklistPushQueues.get(scopeKey) ??
    Promise.resolve();
  const currentPush = previousPush
    .catch(() => undefined)
    .then(() => pushPrivateChecklistSnapshotToCloud(supabase, checklist));

  privateChecklistPushQueues.set(scopeKey, currentPush);
  try {
    await currentPush;
  } finally {
    if (privateChecklistPushQueues.get(scopeKey) === currentPush) {
      privateChecklistPushQueues.delete(scopeKey);
    }
  }
};

const runPrivateChecklistSync = async (
  supabase: SupabaseClient,
  tripId: string,
  userEmail: string,
): Promise<PrivateChecklist> => {
  const initialLocalChecklist = readStoredPrivateChecklist(tripId, userEmail);
  const initialPending = readPrivateChecklistPending(
    tripId,
    userEmail,
  );

  if (initialPending) {
    const cloudChecklist = await getCloudPrivateChecklist(
      supabase,
      tripId,
      userEmail,
    );
    const latestLocalChecklist = readStoredPrivateChecklist(tripId, userEmail);
    const latestPending = readPrivateChecklistPending(tripId, userEmail) ??
      initialPending;
    const mergedChecklist = mergePendingPrivateChecklist(
      latestLocalChecklist,
      cloudChecklist,
      latestPending.baseItems,
    );
    writeStoredPrivateChecklist(mergedChecklist);
    await pushPrivateChecklistToCloud(supabase, mergedChecklist);
    clearPrivateChecklistPending(tripId, userEmail, latestPending.revision);
    return readStoredPrivateChecklist(tripId, userEmail);
  }

  const cloudChecklist = await getCloudPrivateChecklist(
    supabase,
    tripId,
    userEmail,
  );

  if (!cloudChecklist) {
    const latestLocalChecklist = readStoredPrivateChecklist(tripId, userEmail);
    if (latestLocalChecklist.updatedAt) {
      await pushPrivateChecklistToCloud(supabase, latestLocalChecklist);
    }
    return readStoredPrivateChecklist(tripId, userEmail);
  }

  const latestLocalChecklist = readStoredPrivateChecklist(tripId, userEmail);
  const latestPendingRevision = readPrivateChecklistPendingRevision(
    tripId,
    userEmail,
  );

  if (
    latestPendingRevision ||
    latestLocalChecklist.updatedAt !== initialLocalChecklist.updatedAt
  ) {
    await pushPrivateChecklistToCloud(supabase, latestLocalChecklist);
    if (latestPendingRevision) {
      clearPrivateChecklistPending(tripId, userEmail, latestPendingRevision);
    }
    return readStoredPrivateChecklist(tripId, userEmail);
  }

  if (
    latestLocalChecklist.updatedAt &&
    latestLocalChecklist.updatedAt > cloudChecklist.updatedAt
  ) {
    await pushPrivateChecklistToCloud(supabase, latestLocalChecklist);
    return readStoredPrivateChecklist(tripId, userEmail);
  }

  const finalPendingRevision = readPrivateChecklistPendingRevision(
    tripId,
    userEmail,
  );
  if (finalPendingRevision) {
    const newestLocalChecklist = readStoredPrivateChecklist(tripId, userEmail);
    await pushPrivateChecklistToCloud(supabase, newestLocalChecklist);
    clearPrivateChecklistPending(tripId, userEmail, finalPendingRevision);
    return readStoredPrivateChecklist(tripId, userEmail);
  }
  writeStoredPrivateChecklist(cloudChecklist);
  return cloudChecklist;
};

export const syncPrivateChecklistWithCloud = (
  supabase: SupabaseClient,
  tripId: string,
  userEmail: string,
): Promise<PrivateChecklist> => {
  const scopeKey = `${tripId}:${userEmail}`;
  const previousSync = privateChecklistSyncQueues.get(scopeKey) ??
    Promise.resolve(readStoredPrivateChecklist(tripId, userEmail));
  const currentSync = previousSync
    .catch(() => readStoredPrivateChecklist(tripId, userEmail))
    .then(() => runPrivateChecklistSync(supabase, tripId, userEmail));

  privateChecklistSyncQueues.set(scopeKey, currentSync);
  const clearQueue = () => {
    if (privateChecklistSyncQueues.get(scopeKey) === currentSync) {
      privateChecklistSyncQueues.delete(scopeKey);
    }
  };
  void currentSync.then(clearQueue, clearQueue);

  return currentSync;
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
