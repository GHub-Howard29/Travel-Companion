import type { TripDetail, TripMeta } from "../types";
import { removeExpiredTravelEstimates } from "../utils/itineraryTravel.ts";
import { sanitizeItineraryCoverPhotos } from "../utils/itineraryCoverPhoto.ts";

export interface StoredTripRecord {
  meta: TripMeta;
  detail: TripDetail;
  editorEmails: string[];
  updatedAt: string;
  /** 最後一次確認成功的雲端版本；離線修改時維持不變。 */
  cloudUpdatedAt?: string;
}

const TRIP_STORAGE_KEY = "travel_companion_custom_trips";
const TRIP_CACHE_STATE_KEY = "travel_companion_trip_cache_state";
export const TRIP_CACHE_SCHEMA_VERSION = 1;

export interface TripCacheState {
  schemaVersion: number;
  lastDeletionRevision: number;
  legacyRepairCompleted: boolean;
  pendingCleanupTripIds: string[];
}

const EMPTY_TRIP_CACHE_STATE: TripCacheState = {
  schemaVersion: TRIP_CACHE_SCHEMA_VERSION,
  lastDeletionRevision: 0,
  legacyRepairCompleted: false,
  pendingCleanupTripIds: [],
};

export const readTripCacheState = (): TripCacheState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIP_CACHE_STATE_KEY) ?? "null") as
      Partial<TripCacheState> | null;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_TRIP_CACHE_STATE };
    return {
      schemaVersion: Number.isSafeInteger(parsed.schemaVersion) && Number(parsed.schemaVersion) >= 0
        ? Number(parsed.schemaVersion)
        : 0,
      lastDeletionRevision:
        Number.isSafeInteger(parsed.lastDeletionRevision) && Number(parsed.lastDeletionRevision) >= 0
          ? Number(parsed.lastDeletionRevision)
          : 0,
      legacyRepairCompleted: parsed.legacyRepairCompleted === true,
      pendingCleanupTripIds: Array.isArray(parsed.pendingCleanupTripIds)
        ? [...new Set(parsed.pendingCleanupTripIds.filter((value): value is string => typeof value === "string" && Boolean(value)))]
        : [],
    };
  } catch {
    return { ...EMPTY_TRIP_CACHE_STATE };
  }
};

export const writeTripCacheState = (state: TripCacheState): void => {
  localStorage.setItem(TRIP_CACHE_STATE_KEY, JSON.stringify(state));
};

const isStoredTripRecord = (value: unknown): value is StoredTripRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as StoredTripRecord;

  return (
    Boolean(record.meta) &&
    typeof record.meta.id === "string" &&
    Boolean(record.detail) &&
    typeof record.detail.id === "string" &&
    Array.isArray(record.editorEmails)
  );
};

export const sanitizeStoredTripRecord = (
  record: StoredTripRecord,
): StoredTripRecord => {
  if (!record.detail.content?.daysData) return record;
  const content = sanitizeItineraryCoverPhotos(
    removeExpiredTravelEstimates(record.detail.content),
  );
  return content === record.detail.content
    ? record
    : {
        ...record,
        detail: { ...record.detail, content },
      };
};

export const readStoredTripRecords = (): StoredTripRecord[] => {
  const rawData = localStorage.getItem(TRIP_STORAGE_KEY);
  if (!rawData) return [];

  try {
    const parsedData = JSON.parse(rawData) as unknown;
    if (!Array.isArray(parsedData)) return [];

    const records = parsedData.filter(isStoredTripRecord);
    let changed = false;
    const sanitizedRecords = records.map((record) => {
      const sanitizedRecord = sanitizeStoredTripRecord(record);
      if (sanitizedRecord !== record) changed = true;
      return sanitizedRecord;
    });
    if (changed) localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(sanitizedRecords));
    return sanitizedRecords;
  } catch {
    return [];
  }
};

export const writeStoredTripRecords = (records: StoredTripRecord[]): void => {
  localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(records));
};

export const upsertStoredTripRecord = (record: StoredTripRecord): StoredTripRecord[] => {
  const records = readStoredTripRecords();
  const nextRecords = [
    record,
    ...records.filter((item) => item.meta.id !== record.meta.id),
  ];

  writeStoredTripRecords(nextRecords);
  return nextRecords;
};

export const deleteStoredTripRecord = (tripId: string): StoredTripRecord[] => {
  const nextRecords = readStoredTripRecords().filter(
    (record) => record.meta.id !== tripId,
  );

  writeStoredTripRecords(nextRecords);
  return nextRecords;
};

export const replaceStoredTripRecords = (
  records: StoredTripRecord[],
): StoredTripRecord[] => {
  writeStoredTripRecords(records);
  return records;
};

/** 未授權帳號成功載入後，清除行程快取中的敏感其他資訊卡片。 */
export const removeRestrictedOtherInfoFromStoredTrip = (
  tripId: string,
): StoredTripRecord | null => {
  const records = readStoredTripRecords();
  let changed = false;
  let updatedRecord: StoredTripRecord | null = null;

  const nextRecords = records.map((record) => {
    if (
      record.meta.id !== tripId ||
      !record.detail.content.otherInfoItems
    ) {
      return record;
    }

    const nextItems = record.detail.content.otherInfoItems.filter(
      (item) => !item.allowedRoles || item.allowedRoles.length === 0,
    );
    if (nextItems.length === record.detail.content.otherInfoItems.length) {
      return record;
    }

    changed = true;
    const nextRecord: StoredTripRecord = {
      ...record,
      detail: {
        ...record.detail,
        content: {
          ...record.detail.content,
          otherInfoItems: nextItems,
        },
      },
    };
    updatedRecord = nextRecord;
    return nextRecord;
  });

  if (changed) writeStoredTripRecords(nextRecords);
  return updatedRecord;
};
