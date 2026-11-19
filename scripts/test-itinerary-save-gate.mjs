import assert from "node:assert/strict";
import { saveItineraryWithRevisionNotice } from "../src/utils/itinerarySaveGate.ts";

const trip = { id: "trip-current", content: { daysData: { 1: [{ id: "card-1" }] } } };
let saveCalls = 0;
let revisionChecks = 0;
let conflictNotices = 0;

const savedResult = await saveItineraryWithRevisionNotice(trip, {
  canEdit: true,
  checkForRemoteTripChange: async () => {
    revisionChecks += 1;
    return true;
  },
  save: async (value) => {
    saveCalls += 1;
    assert.equal(value, trip);
    return { localSaved: true, cloudSynced: true };
  },
  showVersionConflict: () => {
    conflictNotices += 1;
  },
  isVersionConflict: () => false,
});
assert.deepEqual(savedResult, { localSaved: true, cloudSynced: true });
assert.equal(revisionChecks, 1, "revision notification refresh must still run");
assert.equal(saveCalls, 1, "revision notification must not block valid save");
assert.equal(conflictNotices, 0);

let forbiddenSaveCalls = 0;
const forbiddenResult = await saveItineraryWithRevisionNotice(trip, {
  canEdit: false,
  checkForRemoteTripChange: async () => {
    throw new Error("must not check revision when edit permission is absent");
  },
  save: async () => {
    forbiddenSaveCalls += 1;
  },
  showVersionConflict: () => undefined,
  isVersionConflict: () => false,
});
assert.deepEqual(forbiddenResult, { localSaved: false, cloudSynced: false });
assert.equal(forbiddenSaveCalls, 0, "missing edit permission must still block save");

const versionConflict = new Error("TripVersionConflictError");
let conflictSaveCalls = 0;
await assert.rejects(
  saveItineraryWithRevisionNotice(trip, {
    canEdit: true,
    checkForRemoteTripChange: async () => false,
    save: async () => {
      conflictSaveCalls += 1;
      throw versionConflict;
    },
    showVersionConflict: () => {
      conflictNotices += 1;
    },
    isVersionConflict: (error) => error === versionConflict,
  }),
  (error) => error === versionConflict,
);
assert.equal(conflictSaveCalls, 1, "real save conflict must reach persistence CAS");
assert.equal(conflictNotices, 1, "real save conflict must still notify the user");

console.log("Itinerary save gate passed: revision notice does not block save, permission gate remains, and real version conflicts remain protected.");
