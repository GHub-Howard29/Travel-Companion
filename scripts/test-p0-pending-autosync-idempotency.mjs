import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createPendingItinerarySyncState,
  isStaleQueuedItinerarySave,
  reconcilePendingItinerarySyncState,
  shouldSkipDuplicateItinerarySave,
} from "../src/services/itinerarySync.ts";

const baseline = { "1": [{ id: "card-a", title: "A" }] };
const changed = { "1": [{ id: "card-a", title: "A edited" }] };
const state = (status, pendingDaysData) => ({
  tripId: "trip-a", revision: "rev-a", status, updatedAt: "2026-11-19T00:00:00Z",
  baseCloudUpdatedAt: "cloud-v1", baseDaysData: baseline, pendingDaysData,
  conflicts: [], resolutionChoices: [],
});

assert.equal(shouldSkipDuplicateItinerarySave(null, baseline, true), false);
assert.equal(shouldSkipDuplicateItinerarySave(state("synced", baseline), baseline, false), true);
assert.equal(shouldSkipDuplicateItinerarySave(state("synced", baseline), changed, false), false);
assert.equal(shouldSkipDuplicateItinerarySave(state("pending", baseline), baseline, false), false, "initial pending recovery must still run");
assert.equal(shouldSkipDuplicateItinerarySave(state("pending", baseline), baseline, true), true, "identical queued re-entry must skip");
assert.equal(shouldSkipDuplicateItinerarySave(state("pending", baseline), changed, true), false, "new local content must not be skipped");
assert.equal(shouldSkipDuplicateItinerarySave(state("conflict", baseline), baseline, true), false, "conflict remains handled by existing conflict guard");

const baseDaysData = {
  "1": [
    { id: "card-a", title: "A" },
    { id: "card-b", title: "B" },
  ],
};
const firstSnapshot = {
  "1": [
    { id: "card-a", title: "A edited" },
    { id: "card-b", title: "B" },
  ],
};
const latestSnapshot = {
  "1": [
    { id: "card-a", title: "A edited" },
    { id: "card-b", title: "B edited later" },
  ],
};
const firstPending = createPendingItinerarySyncState(
  "trip-a", "cloud-v1", baseDaysData, firstSnapshot, null, 1,
);
const latestPending = createPendingItinerarySyncState(
  "trip-a", "cloud-v1", baseDaysData, latestSnapshot, firstPending, 1,
);
assert.equal(isStaleQueuedItinerarySave(latestPending, firstSnapshot), true,
  "older queued snapshot must be rejected after a newer Pending revision replaces it");
assert.equal(isStaleQueuedItinerarySave(latestPending, latestSnapshot), false,
  "queued snapshot matching the latest Pending state must still proceed");
assert.equal(isStaleQueuedItinerarySave(state("synced", baseDaysData), firstSnapshot), false,
  "a settled state must not be treated as a newer Pending write");
const staleRetry = createPendingItinerarySyncState(
  "trip-a", "cloud-v1", baseDaysData, firstSnapshot, latestPending, 1,
);
const staleMerge = reconcilePendingItinerarySyncState(
  staleRetry, baseDaysData, "cloud-v1", 1,
);
assert.equal(staleMerge.status, "pending");
assert.equal(staleMerge.state.pendingDaysData["1"][1].title, "B",
  "regression setup must demonstrate that replaying the old snapshot loses the newer card edit");

const hook = readFileSync(new URL("../src/hooks/useTripWorkspace.ts", import.meta.url), "utf8");
assert.match(hook, /shouldSkipDuplicateItinerarySave\(currentState, nextTrip\.content\.daysData, Boolean\(existingSave\)\)/);
assert.match(hook, /if \(currentState\?\.status === "conflict"\)/);
assert.match(hook, /TripVersionConflictError/);
assert.match(hook, /reconcilePendingItinerarySyncState/);
assert.match(hook, /isStaleQueuedItinerarySave\(latestState, nextTrip\.content\.daysData\)/,
  "queued saves must re-read Pending after waiting and reject stale snapshots");

const saveStart = hook.indexOf("const saveItineraryTripDetail = useCallback(");
const saveEnd = hook.indexOf("const recordItineraryResolutionChoice", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "Itinerary save flow must exist");
const saveFlow = hook.slice(saveStart, saveEnd);
const claimPosition = saveFlow.indexOf('claimItineraryCardEditLease(supabase, tripId, "__trip__")');
const sharedWritePosition = saveFlow.indexOf("saveTripRecord({");
assert.ok(claimPosition >= 0 && claimPosition < sharedWritePosition, "Temporary Lease claim must precede shared local writes");
assert.match(saveFlow, /isManagedItineraryTripLeaseActive\(tripId\)[\s\S]*?isLocallyHeldTripEditorLease\(tripId\)/);
assert.match(saveFlow, /if \(!leaseAcquired\)[\s\S]*?if \(currentState\?\.status === "pending"\)[\s\S]*?return \{ localSaved: true, cloudSynced: false \}/);
assert.match(saveFlow, /!isManagedItineraryTripLeaseActive\(tripId\)[\s\S]*?!isLocallyHeldTripEditorLease\(tripId\)/);
console.log("P0 pending auto-sync idempotency regression tests passed.");
