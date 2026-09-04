import type { TripDetail, TripMeta } from "../types";
import { removeExpiredTravelEstimates } from "../utils/itineraryTravel.ts";

export interface StoredTripRecord {
  meta: TripMeta;
  detail: TripDetail;
  editorEmails: string[];
  updatedAt: string;
  /** 最後一次確認成功的雲端版本；離線修改時維持不變。 */
  cloudUpdatedAt?: string;
}

const TRIP_STORAGE_KEY = "travel_companion_custom_trips";

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
  const content = removeExpiredTravelEstimates(record.detail.content);
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
