import type { TripDetail, TripMeta } from "../types";

export interface StoredTripRecord {
  meta: TripMeta;
  detail: TripDetail;
  editorEmails: string[];
  updatedAt: string;
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

export const readStoredTripRecords = (): StoredTripRecord[] => {
  const rawData = localStorage.getItem(TRIP_STORAGE_KEY);
  if (!rawData) return [];

  try {
    const parsedData = JSON.parse(rawData) as unknown;
    if (!Array.isArray(parsedData)) return [];

    return parsedData.filter(isStoredTripRecord);
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
