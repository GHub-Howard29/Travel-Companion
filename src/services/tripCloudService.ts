import type { SupabaseClient } from "@supabase/supabase-js";
import type { SidebarItemConfig, TripDetail, TripMeta, TripMode } from "../types";
import type { StoredTripRecord } from "../storage/tripStorage";
import { ATTACHMENT_BUCKET } from "../constants/appConstants";
import { ITINERARY_COVER_BUCKET } from "../constants/appConstants";
import { isExpenseAttachmentPathForTrip } from "../utils/attachmentUtils";
import { removeExpiredTravelEstimates } from "../utils/itineraryTravel";
import { sanitizeItineraryCoverPhotos } from "../utils/itineraryCoverPhoto";
import { scheduleStorageDeletion } from "./deferredStorageDeletionService";

interface CloudTripRow {
  id: string;
  title: string;
  departure_date: string;
  is_public: boolean;
  participants: unknown;
  currency_config: unknown;
  sidebar_config: unknown;
  content: unknown;
  updated_at: string;
}

interface TripDeletionTombstoneRow {
  trip_id: string;
  deleted_at: string;
  deletion_revision: number | string;
}

export interface TripDeletionTombstone {
  tripId: string;
  deletedAt: string;
  deletionRevision: number;
}

const toCloudTripInsert = (record: StoredTripRecord) => ({
  id: record.meta.id,
  title: record.meta.title,
  departure_date: record.meta.departureDate,
  is_public: record.meta.isPublic ?? record.detail.isPublic,
  participants: record.meta.participants,
  currency_config: record.meta.currencyConfig,
  sidebar_config: record.detail.sidebarConfig,
  content: {
    ...Object.fromEntries(Object.entries(sanitizeItineraryCoverPhotos(removeExpiredTravelEstimates(record.detail.content)))
      .filter(([key]) => key !== "participantEmailMap" && key !== "otherInfoItems")),
    mode: record.meta.mode ?? "guided",
    ...(record.meta.participantEmailMap !== undefined || record.detail.content.participantEmailMap !== undefined
      ? { participantEmailMap: record.meta.participantEmailMap ?? record.detail.content.participantEmailMap }
      : {}),
  },
});

export class TripVersionConflictError extends Error {
  constructor() {
    super("Trip row changed after the current client loaded it");
    this.name = "TripVersionConflictError";
  }
}

const STORAGE_REMOVE_BATCH_SIZE = 1_000;

const getCloudPaths = async (
  supabase: SupabaseClient,
  bucket: string,
  folderPath: string,
): Promise<string[]> => {
  const entries: Array<{ id: string | null; name: string }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
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
      .map((entry) => getCloudPaths(supabase, bucket, `${folderPath}/${entry.name}`)),
  );

  return [...files, ...nestedPaths.flat()];
};

const scheduleCloudAttachmentsForTripDeletion = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> => {
  const paths = (await getCloudPaths(supabase, ATTACHMENT_BUCKET, tripId)).filter(
    (path) => isExpenseAttachmentPathForTrip(path, tripId),
  );

  await scheduleStorageDeletion(supabase, ATTACHMENT_BUCKET, paths);
};

const scheduleCloudItineraryCoversForTripDeletion = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> => {
  const folderPath = `s_${Array.from(new TextEncoder().encode(tripId), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const paths = await getCloudPaths(supabase, ITINERARY_COVER_BUCKET, folderPath);
  await scheduleStorageDeletion(supabase, ITINERARY_COVER_BUCKET, paths);
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
    isPublic: row.is_public,
    participants,
    participantEmailMap,
    currencyConfig: row.currency_config,
  };
  const detail: TripDetail = {
    id: row.id,
    title: row.title,
    departureDate: row.departure_date,
    isPublic: row.is_public,
    sidebarConfig: row.sidebar_config,
    content: {
      ...sanitizeItineraryCoverPhotos(removeExpiredTravelEstimates(row.content)),
      mode,
      participantEmailMap,
    },
  };

  return {
    meta,
    detail,
    editorEmails: [],
    updatedAt: row.updated_at,
    cloudUpdatedAt: row.updated_at,
  };
};

/** A private RPC supplies participant email mappings only to authorized Trip editors.
 * Guest/public Trip rows never contain this map in their content JSON.
 */
const hydratePrivateParticipantEmails = async (
  supabase: SupabaseClient,
  record: StoredTripRecord | null,
): Promise<StoredTripRecord | null> => {
  if (!record) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return record;
  const { data, error } = await supabase.rpc("tc_read_trip_participant_email_map", {
    target_trip_id: record.meta.id,
  });
  if (error) throw error;
  if (data === null) return record;
  const mapping = toParticipantEmailMap(data);
  return {
    ...record,
    meta: { ...record.meta, participantEmailMap: mapping },
    detail: {
      ...record.detail,
      content: { ...record.detail.content, participantEmailMap: mapping },
    },
  };
};

export const getCloudTripRecords = async (
  supabase: SupabaseClient,
): Promise<StoredTripRecord[]> => {
  if (!navigator.onLine) return [];

  try {
    return await getCloudTripRecordsStrict(supabase);
  } catch (error) {
    console.warn("Failed to load cloud trips", error);
    return [];
  }
};

export const getCloudTripRecordsStrict = async (
  supabase: SupabaseClient,
): Promise<StoredTripRecord[]> => {
  if (!navigator.onLine) throw new Error("Trip cloud reconciliation requires a network connection");

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, title, departure_date, is_public, participants, currency_config, sidebar_config, content, updated_at",
    )
    .order("departure_date", { ascending: false });

  if (error) throw error;

  const hydrated = await Promise.all(((data ?? []) as CloudTripRow[])
    .map(toTripRecord)
    .map((record) => hydratePrivateParticipantEmails(supabase, record)));
  return hydrated.filter((record): record is StoredTripRecord => Boolean(record));
};

export const getCloudTripRecord = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<StoredTripRecord | null> => {
  if (!navigator.onLine) return null;

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, title, departure_date, is_public, participants, currency_config, sidebar_config, content, updated_at",
    )
    .eq("id", tripId)
    .maybeSingle();

  if (error) throw error;
  return hydratePrivateParticipantEmails(supabase, data ? toTripRecord(data as CloudTripRow) : null);
};

export const getTripDeletionTombstones = async (
  supabase: SupabaseClient,
): Promise<TripDeletionTombstone[]> => {
  if (!navigator.onLine) throw new Error("Trip tombstone reconciliation requires a network connection");

  const { data, error } = await supabase
    .from("trip_deletion_tombstones")
    .select("trip_id, deleted_at, deletion_revision")
    .order("deletion_revision", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as TripDeletionTombstoneRow[]).map((row) => {
    const deletionRevision = Number(row.deletion_revision);
    if (!Number.isSafeInteger(deletionRevision) || deletionRevision < 0) {
      throw new Error(`Invalid Trip tombstone revision for ${row.trip_id}`);
    }
    return {
      tripId: row.trip_id,
      deletedAt: row.deleted_at,
      deletionRevision,
    };
  });
};

export const cloudTripTombstoneExists = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("trip_deletion_tombstones")
    .select("trip_id")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
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
      "id, title, departure_date, is_public, participants, currency_config, sidebar_config, content, updated_at",
    )
    .single();

  if (error) {
    console.warn("Failed to sync cloud trip", error);
    return null;
  }

  return hydratePrivateParticipantEmails(supabase, toTripRecord(data as CloudTripRow));
};

export const updateCloudTripRecord = async (
  supabase: SupabaseClient,
  record: StoredTripRecord,
  expectedUpdatedAt: string,
): Promise<StoredTripRecord> => {
  const { data, error } = await supabase
    .from("trips")
    .update(toCloudTripInsert(record))
    .eq("id", record.meta.id)
    .eq("updated_at", expectedUpdatedAt)
    .select(
      "id, title, departure_date, is_public, participants, currency_config, sidebar_config, content, updated_at",
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new TripVersionConflictError();

  const updatedRecord = await hydratePrivateParticipantEmails(supabase, toTripRecord(data as CloudTripRow));
  if (!updatedRecord) {
    throw new Error("雲端回傳的旅程資料格式不正確");
  }
  return updatedRecord;
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
      "id, title, departure_date, is_public, participants, currency_config, sidebar_config, content, updated_at",
    )
    .single();

  if (error) throw error;

  const insertedRecord = await hydratePrivateParticipantEmails(supabase, toTripRecord(data as CloudTripRow));
  if (!insertedRecord) {
    throw new Error("雲端回傳的旅程資料格式不正確");
  }

  return insertedRecord;
};

export type TripDeletionStage = "attachments" | "rpc" | "result";

export class TripDeletionError extends Error {
  readonly stage: TripDeletionStage;
  readonly cause: unknown;

  constructor(stage: TripDeletionStage, message: string, cause?: unknown) {
    super(message);
    this.name = "TripDeletionError";
    this.stage = stage;
    this.cause = cause;
  }
}

export const deleteCloudTripRecord = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<boolean> => {
  if (!navigator.onLine) return false;

  // Retrying an already committed deletion is safe: the tombstone is the
  // durable proof that the Trip was removed and must never be recreated.
  if (await cloudTripTombstoneExists(supabase, tripId)) return true;

  try {
    // Keep editor permission until all files have been queued. The RPC checks
    // the path scope before placing the eight-day deferred-cleanup request.
    await scheduleCloudAttachmentsForTripDeletion(supabase, tripId);
    await scheduleCloudItineraryCoversForTripDeletion(supabase, tripId);
  } catch (error) {
    throw new TripDeletionError(
      "attachments",
      "Trip attachments could not be queued for deletion",
      error,
    );
  }

  const { data, error } = await supabase.rpc("tc_delete_trip", {
    target_trip_id: tripId,
  });
  if (error) {
    // The request may have committed on the server even if the client received
    // an error or retried after losing the response. Only the error path needs
    // a recovery lookup; successful RPCs are already authoritative.
    try {
      if (await cloudTripTombstoneExists(supabase, tripId)) return true;
    } catch (verificationError) {
      console.warn(
        "Trip deletion RPC failed and tombstone recovery could not be checked",
        verificationError,
      );
    }
    throw new TripDeletionError("rpc", "Trip deletion RPC failed", error);
  }

  const result = Array.isArray(data) ? data[0] as {
    deleted_trip_id?: unknown;
    deletion_revision?: unknown;
  } | undefined : undefined;
  const deletionRevision = Number(result?.deletion_revision);
  if (
    result?.deleted_trip_id !== tripId ||
    !Number.isSafeInteger(deletionRevision) ||
    deletionRevision < 0
  ) {
    throw new TripDeletionError(
      "result",
      "Trip deletion RPC did not return a valid tombstone",
    );
  }

  // tc_delete_trip creates the tombstone and returns its revision in the same
  // database transaction. Do not turn a committed deletion into a false
  // failure by requiring another network round-trip here.
  return true;
};
