import {
  TRIP_CACHE_SCHEMA_VERSION,
  type StoredTripRecord,
  type TripCacheState,
} from "../storage/tripStorage.ts";
import type { TripDeletionTombstone } from "./tripCloudService.ts";
import { isProtectedSeedTripId } from "../constants/appConstants.ts";

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
  const cloudIds = new Set(cloudRecords.map((record) => record.meta.id));
  const tombstoneIds = new Set(tombstones.map((tombstone) => tombstone.tripId));
  const newlyDeletedIds = tombstones
    .filter((tombstone) => tombstone.deletionRevision > state.lastDeletionRevision)
    .map((tombstone) => tombstone.tripId);
  // V3.9.26: when the authoritative online RLS result no longer includes a
  // cloud-backed Trip, revoke its cached access on EVERY reconciliation.
  // This also covers public -> private changes and editor revocation after
  // the one-time legacy cleanup has already completed.
  const inaccessibleTripIds = storedRecords
    .filter((record) =>
      Boolean(record.cloudUpdatedAt) &&
      !cloudIds.has(record.meta.id) &&
      !isProtectedSeedTripId(record.meta.id),
    )
    .map((record) => record.meta.id);
  const cleanupTripIds = [
    ...new Set([
      ...state.pendingCleanupTripIds,
      ...newlyDeletedIds,
      ...inaccessibleTripIds,
      ...storedRecords
        .filter((record) => tombstoneIds.has(record.meta.id))
        .map((record) => record.meta.id),
    ]),
  ];
  const removedIds = new Set([...cleanupTripIds, ...tombstoneIds]);
  const maxDeletionRevision = tombstones.reduce(
    (maximum, tombstone) => Math.max(maximum, tombstone.deletionRevision),
    state.lastDeletionRevision,
  );

  return {
    storedRecords: storedRecords.filter((record) => !removedIds.has(record.meta.id)),
    cleanupTripIds,
    nextState: {
      schemaVersion: TRIP_CACHE_SCHEMA_VERSION,
      lastDeletionRevision: maxDeletionRevision,
      legacyRepairCompleted: true,
      pendingCleanupTripIds: cleanupTripIds,
    },
  };
};
