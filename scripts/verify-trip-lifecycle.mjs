import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createTripId } from "../src/utils/tripIdentity.ts";
import { decideTripReconciliation } from "../src/services/tripReconciliation.ts";
import { isProtectedSeedTripId } from "../src/constants/appConstants.ts";

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
const decision = decideTripReconciliation(
  [
    record("tombstoned", "2026-09-10T00:00:00.000Z"),
    record("legacy-cloud-residual", "2026-09-09T00:00:00.000Z"),
    record("local-only"),
    record("cloud-present", "2026-09-10T00:00:00.000Z"),
    record("free-travel-2026-01", "2026-09-01T00:00:00.000Z"),
  ],
  [record("cloud-present", "2026-09-10T00:00:00.000Z")],
  [{ tripId: "tombstoned", deletedAt: "2026-09-10T01:00:00.000Z", deletionRevision: 5 }],
  state,
);

assert.deepEqual(
  decision.storedRecords.map((item) => item.meta.id),
  ["local-only", "cloud-present", "free-travel-2026-01"],
  "只移除墓碑及可確認的舊雲端殘留",
);
assert.deepEqual(
  new Set(decision.cleanupTripIds),
  new Set(["pending-cleanup", "tombstoned", "legacy-cloud-residual"]),
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
