import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createTripId } from "../src/utils/tripIdentity.ts";
import { decideTripReconciliation } from "../src/services/tripReconciliation.ts";
import { isProtectedSeedTripId } from "../src/constants/appConstants.ts";
import { writeItinerarySyncState, readItinerarySyncState, clearItinerarySyncState } from "../src/storage/itinerarySyncStorage.ts";

const firstId = createTripId();
const secondId = createTripId();
assert.match(firstId, /^trip-[0-9a-f-]{36}$/i);
assert.notEqual(firstId, secondId, "每次建立必須產生不同 Trip ID");

const baseRecord = {
  meta: {
    id: "base",
    title: "相同日期旅程",
    departureDate: "2026-10-03",
    dayCount: 2,
    mode: "guided",
    participants: ["Howard"],
    participantEmailMap: {},
    currencyConfig: { code: "JPY", symbol: "￥" },
  },
  detail: {
    id: "base",
    title: "相同日期旅程",
    departureDate: "2026-10-03",
    isPublic: true,
    sidebarConfig: [],
    content: { mode: "guided", days: [1, 2], daysData: { "1": [], "2": [] }, checklistData: [] },
  },
  editorEmails: [],
  updatedAt: "2026-09-10T00:00:00.000Z",
};

const record = (id, cloudUpdatedAt) => ({
  ...baseRecord,
  meta: { ...baseRecord.meta, id },
  detail: { ...baseRecord.detail, id },
  ...(cloudUpdatedAt ? { cloudUpdatedAt } : {}),
});

const state = {
  schemaVersion: 0,
  lastDeletionRevision: 4,
  legacyRepairCompleted: false,
  pendingCleanupTripIds: ["pending-cleanup"],
};
let decision;
const originalLocalStorage = globalThis.localStorage;
const testStorage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => testStorage.get(key) ?? null,
    setItem: (key, value) => testStorage.set(key, value),
    removeItem: (key) => testStorage.delete(key),
  },
});
try {
  writeItinerarySyncState({
    tripId: "cloud-present",
    revision: "pending-test",
    status: "pending",
    updatedAt: "2026-09-10T02:00:00.000Z",
    baseCloudUpdatedAt: "2026-09-10T00:00:00.000Z",
    baseDaysData: { "1": [] },
    pendingDaysData: { "1": [{ id: "local-card", title: "local pending" }] },
  });
  writeItinerarySyncState({
    tripId: "already-confirmed",
    revision: "already-confirmed-test",
    status: "pending",
    updatedAt: "2026-09-10T02:00:00.000Z",
    baseCloudUpdatedAt: "2026-09-10T00:00:00.000Z",
    baseDaysData: { "1": [], "2": [] },
    pendingDaysData: { "1": [{ id: "confirmed-card", title: "confirmed in cloud" }], "2": [] },
  });
  writeItinerarySyncState({
    tripId: "tombstoned",
    revision: "deleted-pending-test",
    status: "pending",
    updatedAt: "2026-09-10T02:00:00.000Z",
    baseCloudUpdatedAt: "2026-09-10T00:00:00.000Z",
    baseDaysData: { "1": [] },
    pendingDaysData: { "1": [{ id: "deleted-local-card", title: "should be discarded after confirmed deletion" }] },
  });
  decision = decideTripReconciliation(
    [
      record("tombstoned", "2026-09-10T00:00:00.000Z"),
      record("cloud-list-missing-but-not-tombstoned", "2026-09-09T00:00:00.000Z"),
      record("local-only"),
      record("cloud-present", "2026-09-10T00:00:00.000Z"),
      record("already-confirmed", "2026-09-10T00:00:00.000Z"),
      record("free-travel-2026-01", "2026-09-01T00:00:00.000Z"),
    ],
    [
      record("cloud-present", "2026-09-10T03:00:00.000Z"),
      {
        ...record("already-confirmed", "2026-09-10T03:00:00.000Z"),
        detail: {
          ...record("already-confirmed").detail,
          content: {
            ...record("already-confirmed").detail.content,
            daysData: { "1": [{ id: "confirmed-card", title: "confirmed in cloud" }], "2": [] },
          },
        },
      },
    ],
    [{ tripId: "tombstoned", deletedAt: "2026-09-10T01:00:00.000Z", deletionRevision: 5 }],
    state,
  );

  assert.equal(readItinerarySyncState("tombstoned"), null, "confirmed tombstone removes stale itinerary pending state");
  assert.equal(readItinerarySyncState("already-confirmed")?.status, "synced", "cloud-confirmed pending itinerary becomes synced");
  const confirmedRecord = decision.storedRecords.find((item) => item.meta.id === "already-confirmed");
  assert.deepEqual(
    confirmedRecord.detail.content.daysData,
    { "1": [{ id: "confirmed-card", title: "confirmed in cloud" }], "2": [] },
    "cloud-confirmed data replaces stale local pending cache",
  );
  const protectedRecord = decision.storedRecords.find((item) => item.meta.id === "cloud-present");
  assert.deepEqual(
    protectedRecord.detail.content.daysData,
    { "1": [{ id: "local-card", title: "local pending" }], "2": [] },
    "pending cards must retain local daysData when cloud has not confirmed them",
  );
  assert.deepEqual(
    decision.cleanupTripIds,
    ["pending-cleanup", "tombstoned"],
    "only explicit pending cleanup and permanent tombstones may trigger full local Trip cleanup; cloud-list absence alone must not delete a Trip",
  );
  clearItinerarySyncState("cloud-present", "pending-test");
  assert.ok(protectedRecord);
} finally {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
}

assert.deepEqual(
  decision.storedRecords.map((item) => item.meta.id),
  ["cloud-list-missing-but-not-tombstoned", "local-only", "cloud-present", "already-confirmed", "free-travel-2026-01"],
  "cloud list absence without a permanent tombstone must preserve cached Trips",
);
assert.deepEqual(
  new Set(decision.cleanupTripIds),
  new Set(["pending-cleanup", "tombstoned"]),
);
assert.equal(decision.nextState.lastDeletionRevision, 5);
assert.equal(decision.nextState.legacyRepairCompleted, true);
assert.equal(isProtectedSeedTripId("free-travel-2026-01"), true);
assert.equal(isProtectedSeedTripId("group-tour-2026-10"), true);
assert.equal(isProtectedSeedTripId("trip-new"), false);

const migration = await readFile(
  new URL("../supabase/migrations/20260910140949_v381_trip_deletion_tombstones.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /create table public\.trip_deletion_tombstones/);
assert.match(migration, /grant select on table public\.trip_deletion_tombstones to anon, authenticated/);
assert.match(migration, /revoke all on function public\.tc_delete_trip\(text\)/);
assert.match(migration, /grant execute on function public\.tc_delete_trip\(text\) to authenticated/);
assert.match(migration, /revoke delete on table public\.trips from authenticated/);
assert.match(migration, /trips_reject_tombstoned_id_insert/);
assert.match(migration, /trips_reject_protected_seed_delete/);
assert.match(migration, /delete from public\.checklists\s+where trip_id = target_trip_id and scope = 'shared'/s);

const cloudService = await readFile(
  new URL("../src/services/tripCloudService.ts", import.meta.url),
  "utf8",
);
assert.match(cloudService, /\.rpc\("tc_delete_trip"/);
assert.match(cloudService, /trip_deletion_tombstones/);

const baseline = await readFile(
  new URL("../supabase/tests/v381_ci_base_schema.sql", import.meta.url),
  "utf8",
);
assert.match(baseline, /CI\/local-only direct dependency fixture/);
assert.match(baseline, /v381-sql-super@example\.invalid/);

const validation = await readFile(
  new URL("../docs/sql/025_v381_trip_deletion_tombstones_validation.sql", import.meta.url),
  "utf8",
);
assert.match(validation, /duplicate tombstone rolls back Trip and relation deletion/);
assert.match(validation, /Guest reads tombstones but cannot write or call deletion RPC/);

const workflow = await readFile(
  new URL("../.github/workflows/v381-supabase-validation.yml", import.meta.url),
  "utf8",
);
assert.match(workflow, /workflow_dispatch/);
assert.match(workflow, /v381_ci_base_schema\.sql/);
assert.match(workflow, /verify-v381-supabase-deletion\.mjs/);

const revisionNotice = await readFile(
  new URL("../src/components/TripDataRevisionNotice.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(revisionNotice, /此行程已被刪除/);

console.log("Trip UUID、永久墓碑、種子保護與本機校正驗證通過。");
