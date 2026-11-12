import {
  TRIP_CACHE_SCHEMA_VERSION,
  type StoredTripRecord,
  type TripCacheState,
} from "../storage/tripStorage.ts";
import type { TripDeletionTombstone } from "./tripCloudService.ts";

import { clearItinerarySyncState, readItinerarySyncState, writeItinerarySyncState } from "../storage/itinerarySyncStorage.ts";
import { reconcilePendingItinerarySyncState } from "./itinerarySync.ts";

export interface TripReconciliationDecision {
  storedRecords: StoredTripRecord[];
  cleanupTripIds: string[];
  nextState: TripCacheState;
}

export const decideTripReconciliation = (
  storedRecords: StoredTripRecord[],
  cloudRecords: StoredTripRecord[],
  tombstones: TripDeletionTombstone[],
  state: TripCacheState,
): TripReconciliationDecision => {
  const tombstoneIds = new Set(tombstones.map((tombstone) => tombstone.tripId));
  const newlyDeletedIds = tombstones
    .filter((tombstone) => tombstone.deletionRevision > state.lastDeletionRevision)
    .map((tombstone) => tombstone.tripId);
  // A missing row in an RLS-filtered cloud list is not proof of deletion.
  // Only a permanent tombstone authorizes full local Trip removal. This is
  // intentionally conservative: transient/incomplete visibility must never
  // wipe an otherwise recoverable local Trip or its associated offline data.
  const tombstonedStoredIds = storedRecords
    .filter((record) => tombstoneIds.has(record.meta.id))
    .map((record) => record.meta.id);
  const cleanupTripIds = [
    ...new Set([
      ...state.pendingCleanupTripIds,
      ...newlyDeletedIds,
      ...tombstonedStoredIds,
    ]),
  ];
  const removedIds = new Set([...cleanupTripIds, ...tombstoneIds]);
  const maxDeletionRevision = tombstones.reduce(
    (maximum, tombstone) => Math.max(maximum, tombstone.deletionRevision),
    state.lastDeletionRevision,
  );

  const cloudRecordsById = new Map(cloudRecords.map((record) => [record.meta.id, record]));
  const reconciledRecords = storedRecords.flatMap((record) => {
    const cloudRecord = cloudRecordsById.get(record.meta.id);
    // Confirmed deletion or revoked cloud access always wins over local pending data.
    if (tombstoneIds.has(record.meta.id) || (!cloudRecord && removedIds.has(record.meta.id))) {
      clearItinerarySyncState(record.meta.id);
      return [];
    }
    if (!cloudRecord) return [record];

    const itineraryState = readItinerarySyncState(record.meta.id);
    if (!itineraryState || (itineraryState.status !== "pending" && itineraryState.status !== "conflict")) {
      return [cloudRecord];
    }

    const reconciliation = itineraryState.status === "conflict"
      ? { status: "conflict" as const, state: itineraryState }
      : reconcilePendingItinerarySyncState(
          itineraryState,
          cloudRecord.detail.content.daysData,
          cloudRecord.updatedAt,
        );
    if (itineraryState.revision === readItinerarySyncState(record.meta.id)?.revision) {
      writeItinerarySyncState(reconciliation.state);
    }

    return [{
      ...cloudRecord,
      detail: {
        ...cloudRecord.detail,
        content: {
          ...cloudRecord.detail.content,
          ...record.detail.content,
          daysData: reconciliation.status === "already-synced"
            ? cloudRecord.detail.content.daysData
            : reconciliation.state.pendingDaysData,
        },
      },
      updatedAt: reconciliation.state.status === "synced" ? cloudRecord.updatedAt : record.updatedAt,
      cloudUpdatedAt: cloudRecord.updatedAt,
    }];
  });
  const recordsById = new Map(reconciledRecords.map((record) => [record.meta.id, record]));
  cloudRecords.forEach((record) => {
    if (!recordsById.has(record.meta.id) && !removedIds.has(record.meta.id)) {
      recordsById.set(record.meta.id, record);
    }
  });

  return {
    storedRecords: Array.from(recordsById.values()),
    cleanupTripIds,
    nextState: {
      schemaVersion: TRIP_CACHE_SCHEMA_VERSION,
      lastDeletionRevision: maxDeletionRevision,
      legacyRepairCompleted: true,
      pendingCleanupTripIds: cleanupTripIds,
    },
  };
};
