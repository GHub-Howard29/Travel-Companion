import type { StoredTripRecord } from "../storage/tripStorage.ts";
import type { TripDetail } from "../types";

export type NonItineraryTripContentPatch = Partial<
  Pick<TripDetail["content"], "checklistData" | "otherInfoFolders">
>;

export interface NonItineraryTripCloudAdapter {
  readLatest: (tripId: string) => Promise<StoredTripRecord | null>;
  compareAndSwap: (
    record: StoredTripRecord,
    expectedUpdatedAt: string,
  ) => Promise<StoredTripRecord>;
}

const ALLOWED_PATCH_KEYS = new Set(["checklistData", "otherInfoFolders"]);

export const createNonItineraryTripCloudRecord = (
  currentCloudRecord: StoredTripRecord,
  contentPatch: NonItineraryTripContentPatch,
): StoredTripRecord => {
  const patchKeys = Object.keys(contentPatch);
  if (
    patchKeys.length === 0 ||
    patchKeys.some((key) => !ALLOWED_PATCH_KEYS.has(key))
  ) {
    throw new Error("非行程卡片更新只允許 Checklist／Other Info folders 欄位");
  }

  return {
    ...currentCloudRecord,
    detail: {
      ...currentCloudRecord.detail,
      content: {
        ...currentCloudRecord.detail.content,
        ...contentPatch,
        // Never accept caller-provided daysData on a non-itinerary path.
        daysData: currentCloudRecord.detail.content.daysData,
      },
    },
    updatedAt: new Date().toISOString(),
    cloudUpdatedAt: currentCloudRecord.updatedAt,
  };
};

export const saveNonItineraryTripCloudFields = async (
  tripId: string,
  contentPatch: NonItineraryTripContentPatch,
  adapter: NonItineraryTripCloudAdapter,
): Promise<StoredTripRecord> => {
  const currentCloudRecord = await adapter.readLatest(tripId);
  if (!currentCloudRecord) {
    throw new Error("找不到雲端旅程，非行程卡片更新已停止");
  }

  const nextRecord = createNonItineraryTripCloudRecord(
    currentCloudRecord,
    contentPatch,
  );
  // A concurrent itinerary save updates the same Trip row timestamp, so CAS
  // fails safely instead of sending a stale daysData snapshot over the new one.
  return adapter.compareAndSwap(nextRecord, currentCloudRecord.updatedAt);
};
