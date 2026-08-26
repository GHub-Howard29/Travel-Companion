import type { SupabaseClient } from "@supabase/supabase-js";
import type { SidebarItemConfig, TripDetail, TripMeta, TripMode } from "../types";
import type { StoredTripRecord } from "../storage/tripStorage";
import { ATTACHMENT_BUCKET } from "../constants/appConstants";
import { isExpenseAttachmentPathForTrip } from "../utils/attachmentUtils";

interface CloudTripRow {
  id: string;
  title: string;
  departure_date: string;
  participants: unknown;
  currency_config: unknown;
  sidebar_config: unknown;
  content: unknown;
  updated_at: string;
}

const toCloudTripInsert = (record: StoredTripRecord) => ({
  id: record.meta.id,
  title: record.meta.title,
  departure_date: record.meta.departureDate,
  participants: record.meta.participants,
  currency_config: record.meta.currencyConfig,
  sidebar_config: record.detail.sidebarConfig,
  content: {
    ...record.detail.content,
    mode: record.meta.mode ?? "guided",
    participantEmailMap:
      record.meta.participantEmailMap ??
      record.detail.content.participantEmailMap ??
      {},
  },
});

const STORAGE_REMOVE_BATCH_SIZE = 1_000;

const getCloudAttachmentPaths = async (
  supabase: SupabaseClient,
  folderPath: string,
): Promise<string[]> => {
  const entries: Array<{ id: string | null; name: string }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .list(folderPath, { limit: STORAGE_REMOVE_BATCH_SIZE, offset });
    if (error) throw error;

    const page = data ?? [];
    entries.push(...page);
    if (page.length < STORAGE_REMOVE_BATCH_SIZE) break;
    offset += page.length;
  }

  const files = entries
    .filter((entry) => entry.id !== null)
    .map((entry) => `${folderPath}/${entry.name}`);
  const nestedPaths = await Promise.all(
    entries
      .filter((entry) => entry.id === null)
      .map((entry) => getCloudAttachmentPaths(supabase, `${folderPath}/${entry.name}`)),
  );

  return [...files, ...nestedPaths.flat()];
};

const removeCloudAttachmentsForTrip = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> => {
  const paths = (await getCloudAttachmentPaths(supabase, tripId)).filter(
    (path) => isExpenseAttachmentPathForTrip(path, tripId),
  );

  for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove(paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE));
    if (error) throw error;
  }
};

const isCurrencyConfig = (
  value: unknown,
): value is TripMeta["currencyConfig"] => {
  if (!value || typeof value !== "object") return false;
  const config = value as TripMeta["currencyConfig"];

  return typeof config.code === "string" && typeof config.symbol === "string";
};

const isSidebarConfig = (value: unknown): value is SidebarItemConfig[] => {
  return Array.isArray(value);
};

const isTripContent = (value: unknown): value is TripDetail["content"] => {
  if (!value || typeof value !== "object") return false;
  const content = value as TripDetail["content"];

  return (
    Array.isArray(content.days) &&
    Boolean(content.daysData) &&
    typeof content.daysData === "object"
  );
};

const toParticipantEmailMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      )
      .map(([participant, email]) => [
        participant.trim(),
        email.trim().toLowerCase(),
      ])
      .filter(([participant, email]) => participant && email.includes("@")),
  );
};

const inferTripMode = (
  sidebarConfig: SidebarItemConfig[],
  content: TripDetail["content"],
): TripMode => {
  const rawMode = (content as { mode?: unknown }).mode;

  if (rawMode === "guided" || rawMode === "selfGuided") {
    return rawMode;
  }

  const specialTitle = sidebarConfig.find(
    (item) => item.id === "trip_special_info" || item.type === "otherInfo",
  )?.title;

  if (specialTitle?.includes("自駕") || specialTitle?.includes("租車")) {
    return "selfGuided";
  }

  return "guided";
};

const toTripRecord = (row: CloudTripRow): StoredTripRecord | null => {
  const participants = Array.isArray(row.participants)
    ? row.participants.filter((item): item is string => typeof item === "string")
    : [];

  if (
    !isCurrencyConfig(row.currency_config) ||
    !isSidebarConfig(row.sidebar_config) ||
    !isTripContent(row.content)
  ) {
    return null;
  }

  const mode = inferTripMode(row.sidebar_config, row.content);
  const participantEmailMap = toParticipantEmailMap(
    row.content.participantEmailMap,
  );
  const meta: TripMeta = {
    id: row.id,
    title: row.title,
    departureDate: row.departure_date,
    dayCount: row.content.days.length,
    mode,
    participants,
    participantEmailMap,
    currencyConfig: row.currency_config,
  };
  const detail: TripDetail = {
    id: row.id,
    title: row.title,
    departureDate: row.departure_date,
    isPublic: true,
    sidebarConfig: row.sidebar_config,
    content: {
      ...row.content,
      mode,
      participantEmailMap,
    },
  };

  return {
    meta,
    detail,
    editorEmails: [],
    updatedAt: row.updated_at,
  };
};

export const getCloudTripRecords = async (
  supabase: SupabaseClient,
): Promise<StoredTripRecord[]> => {
  if (!navigator.onLine) return [];

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, title, departure_date, participants, currency_config, sidebar_config, content, updated_at",
    )
    .order("departure_date", { ascending: false });

  if (error) {
    console.warn("Failed to load cloud trips", error);
    return [];
  }

  return ((data ?? []) as CloudTripRow[])
    .map(toTripRecord)
    .filter((record): record is StoredTripRecord => Boolean(record));
};

export const upsertCloudTripRecord = async (
  supabase: SupabaseClient,
  record: StoredTripRecord,
): Promise<StoredTripRecord | null> => {
  if (!navigator.onLine) return null;

  const { data, error } = await supabase
    .from("trips")
    .upsert(toCloudTripInsert(record), { onConflict: "id" })
    .select(
      "id, title, departure_date, participants, currency_config, sidebar_config, content, updated_at",
    )
    .single();

  if (error) {
    console.warn("Failed to sync cloud trip", error);
    return null;
  }

  return toTripRecord(data as CloudTripRow);
};

export const cloudTripExists = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<boolean> => {
  if (!navigator.onLine) {
    throw new Error("新增旅程需要網路連線");
  }

  const { data, error } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
};

export const insertCloudTripRecord = async (
  supabase: SupabaseClient,
  record: StoredTripRecord,
): Promise<StoredTripRecord> => {
  if (!navigator.onLine) {
    throw new Error("新增旅程需要網路連線");
  }

  const { data, error } = await supabase
    .from("trips")
    .insert(toCloudTripInsert(record))
    .select(
      "id, title, departure_date, participants, currency_config, sidebar_config, content, updated_at",
    )
    .single();

  if (error) throw error;

  const insertedRecord = toTripRecord(data as CloudTripRow);
  if (!insertedRecord) {
    throw new Error("雲端回傳的旅程資料格式不正確");
  }

  return insertedRecord;
};

export const deleteCloudTripRecord = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<boolean> => {
  if (!navigator.onLine) return false;

  try {
    // Keep the trip editor permission intact until Storage is cleaned. The
    // storage delete policy checks the trip id from the attachment path.
    await removeCloudAttachmentsForTrip(supabase, tripId);
  } catch (error) {
    console.warn("Failed to remove trip attachments", error);
    return false;
  }

  const cleanupRequests = [
    supabase.from("checklists").delete().eq("trip_id", tripId),
    supabase.from("other_info_items").delete().eq("trip_id", tripId),
    supabase.from("exchange_purchases").delete().eq("trip_id", tripId),
    supabase
      .from("admin_users")
      .delete()
      .eq("role", "trip_editor")
      .eq("trip_id", tripId),
    supabase.from("expenses").delete().eq("trip_id", tripId),
  ];

  for (const request of cleanupRequests) {
    const { error } = await request;
    if (error) {
      console.warn("Failed to clean related trip data", error);
    }
  }

  const { error } = await supabase.from("trips").delete().eq("id", tripId);

  if (error) {
    console.warn("Failed to delete cloud trip", error);
    return false;
  }

  return true;
};
