import type { SupabaseClient } from "@supabase/supabase-js";

import type { OtherInfoItem } from "../types";
import type { Role } from "../permissions/roles";

interface CloudOtherInfoItemRow {
  id: string;
  client_item_id: string | null;
  trip_id: string;
  folder_id: string;
  title: string;
  content: string;
  allowed_roles: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const VALID_ROLES = new Set<Role>([
  "guest",
  "user",
  "trip_editor",
  "super_admin",
]);

const toAllowedRoles = (value: unknown): Role[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const roles = value.filter((item): item is Role =>
    typeof item === "string" && VALID_ROLES.has(item as Role),
  );

  return roles.length > 0 ? roles : undefined;
};

const toCloudAllowedRoles = (
  roles: OtherInfoItem["allowedRoles"],
): Role[] | null => {
  if (!roles || roles.length === 0) {
    return null;
  }

  const normalizedRoles = roles.filter((role) => VALID_ROLES.has(role));

  return normalizedRoles.length > 0 ? normalizedRoles : null;
};

const toOtherInfoItem = (row: CloudOtherInfoItemRow): OtherInfoItem => {
  return {
    id: row.client_item_id ?? `cloud_${row.id}`,
    tripId: row.trip_id,
    folderId: row.folder_id,
    title: row.title,
    content: row.content,
    allowedRoles: toAllowedRoles(row.allowed_roles),
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toCloudRow = (tripId: string, item: OtherInfoItem) => {
  return {
    trip_id: tripId,
    client_item_id: item.id,
    folder_id: item.folderId,
    title: item.title,
    content: item.content,
    allowed_roles: toCloudAllowedRoles(item.allowedRoles),
    sort_order: item.order,
    deleted_at: null,
  };
};

export const getCloudOtherInfoItems = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<OtherInfoItem[] | null> => {
  if (!navigator.onLine) {
    return null;
  }

  const { data, error } = await supabase
    .from("other_info_items")
    .select(
      "id, client_item_id, trip_id, folder_id, title, content, allowed_roles, sort_order, created_at, updated_at",
    )
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Failed to load cloud other info", error);
    return null;
  }

  return ((data ?? []) as CloudOtherInfoItemRow[]).map(toOtherInfoItem);
};

export const upsertCloudOtherInfoItems = async (
  supabase: SupabaseClient,
  tripId: string,
  items: OtherInfoItem[],
): Promise<boolean> => {
  const activeRows = items
    .filter((item) => item.tripId === tripId && !item.isDeleted)
    .map((item) => toCloudRow(tripId, item));

  if (!navigator.onLine || activeRows.length === 0) {
    return false;
  }

  for (const row of activeRows) {
    const { data: existingRow, error: selectError } = await supabase
      .from("other_info_items")
      .select("id")
      .eq("trip_id", row.trip_id)
      .eq("client_item_id", row.client_item_id)
      .maybeSingle();

    if (selectError) {
      console.warn("Failed to find cloud other info before sync", selectError);
      return false;
    }

    const request = existingRow
      ? supabase.from("other_info_items").update(row).eq("id", existingRow.id)
      : supabase.from("other_info_items").insert(row);
    const { error } = await request;

    if (error) {
      console.warn("Failed to sync cloud other info", error);
      return false;
    }
  }

  return true;
};

export const deleteCloudOtherInfoItems = async (
  supabase: SupabaseClient,
  tripId: string,
  itemIds: string[],
): Promise<boolean> => {
  const activeItemIds = itemIds.filter(Boolean);

  if (!navigator.onLine || activeItemIds.length === 0) {
    return false;
  }

  // Older rows were created before client_item_id existed.  They are exposed to
  // the UI as `cloud_<database id>`, so support both identifier formats here.
  const cloudRowIds = activeItemIds
    .filter((itemId) => itemId.startsWith("cloud_"))
    .map((itemId) => itemId.slice("cloud_".length));
  const clientItemIds = activeItemIds.filter(
    (itemId) => !itemId.startsWith("cloud_"),
  );
  const deletedAt = new Date().toISOString();
  const requests: Array<PromiseLike<{ error: unknown }>> = [];

  if (clientItemIds.length > 0) {
    requests.push(
      supabase
        .from("other_info_items")
        .update({ deleted_at: deletedAt })
        .eq("trip_id", tripId)
        .in("client_item_id", clientItemIds),
    );
  }

  if (cloudRowIds.length > 0) {
    requests.push(
      supabase
        .from("other_info_items")
        .update({ deleted_at: deletedAt })
        .eq("trip_id", tripId)
        .in("id", cloudRowIds),
    );
  }

  const results = await Promise.all(requests);
  const error = results.find((result) => result.error)?.error;

  if (error) {
    console.warn("Failed to delete cloud other info", error);
    return false;
  }

  return true;
};

export const syncCloudOtherInfoItems = async (
  supabase: SupabaseClient,
  tripId: string,
  items: OtherInfoItem[],
  removedItemIds: string[],
): Promise<void> => {
  await upsertCloudOtherInfoItems(supabase, tripId, items);
  await deleteCloudOtherInfoItems(supabase, tripId, removedItemIds);
};
