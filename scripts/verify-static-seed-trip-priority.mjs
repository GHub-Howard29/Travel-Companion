import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isStaticSeedTripId, STATIC_SEED_TRIP_IDS } from "../src/constants/appConstants.ts";

const expectedSeedIds = [
  "free-travel-2026-01",
  "group-tour-2026-10",
];
assert.deepEqual(STATIC_SEED_TRIP_IDS, expectedSeedIds);
assert.equal(isStaticSeedTripId("free-travel-2026-01"), true);
assert.equal(isStaticSeedTripId("group-tour-2026-10"), true);
assert.equal(isStaticSeedTripId("trip-shikoku-1"), false);

const tombstoneFilter = (tripId, excludedTripIds) =>
  isStaticSeedTripId(tripId) || !excludedTripIds.has(tripId);
const deletedIds = new Set(["group-tour-2026-10", "trip-deleted-dynamic"]);
assert.equal(
  tombstoneFilter("group-tour-2026-10", deletedIds),
  true,
  "Static SEED must remain visible even if a legacy tombstone exists",
);
assert.equal(
  tombstoneFilter("trip-deleted-dynamic", deletedIds),
  false,
  "Dynamic trips must remain excluded when a tombstone exists",
);
assert.equal(
  tombstoneFilter("trip-active-dynamic", deletedIds),
  true,
  "Dynamic trips without tombstones must remain visible",
);

const repository = await readFile(
  new URL("../src/services/tripRepository.ts", import.meta.url),
  "utf8",
);
assert.match(
  repository,
  /\)\)\.filter\(\(trip\) =>\s*isStaticSeedTripId\(trip\.id\) \|\| !excludedTripIds\.has\(trip\.id\),/,
  "Static SEED manifest records must bypass tombstone filtering",
);
assert.match(
  repository,
  /\.filter\(\(record\) =>\s*isStaticSeedTripId\(record\.meta\.id\) \|\| !excludedTripIds\.has\(record\.meta\.id\),\s*\);/,
  "Cloud and cache tombstone filtering must preserve static SEED rows for their authoritative merge handling",
);

assert.match(
  repository,
  /if \(isStaticSeedTripId\(record\.meta\.id\)\) continue;/,
  "Cloud/local records must not replace a static SEED's manifest metadata",
);
assert.match(
  repository,
  /currentStoredRecords\.filter\(\(record\) => !isStaticSeedTripId\(record\.meta\.id\)\)/,
  "Static SEED rows must not be retained in the normalized local dynamic-trip cache when cloud records are empty",
);
assert.match(
  repository,
  /currentStoredRecords\.forEach\(\(record\) => \{\s*if \(isStaticSeedTripId\(record\.meta\.id\)\) return;/,
  "Static SEED rows must not be reinserted into local cache when cloud records are present",
);
const staticDetailStart = repository.indexOf("if (isStaticSeedTripId(tripId)) {");
const staticDetailEnd = repository.indexOf("\n  const storedTrip =", staticDetailStart);
assert.ok(staticDetailStart >= 0 && staticDetailEnd > staticDetailStart);
const staticDetailBranch = repository.slice(staticDetailStart, staticDetailEnd);
assert.ok(staticDetailBranch.indexOf("fetchJson<TripDetail>(url)") < staticDetailBranch.indexOf("getCloudOtherInfoItems(supabase, tripId)"));
assert.match(staticDetailBranch, /return normalizeTripDetail\(/);

const workspace = await readFile(
  new URL("../src/hooks/useTripWorkspace.ts", import.meta.url),
  "utf8",
);
assert.match(
  workspace,
  /const isStaticSeed = isStaticSeedTripId\(selectedTripId\);\s*const shouldPreferCloud = preferCloud && !isStaticSeed;\s*const cloudSnapshot = shouldPreferCloud\s*\? await getCloudTripRecord\(supabase, selectedTripId\)/,
  "Static SEED refresh must bypass the dynamic trips table lookup while dynamic Trips prefer cloud",
);
assert.match(
  workspace,
  /if \(shouldPreferCloud && !cloudSnapshot\)/,
  "Only dynamic Trips should require a cloud snapshot before editing",
);
assert.match(
  workspace,
  /cloudSnapshot \? \[cloudSnapshot\] : undefined,\s*shouldPreferCloud,/,
  "Static SEED must not pass cloud-preferred mode to Trip detail loading",
);
assert.match(
  repository,
  /if \(isStaticSeedTripId\(record\.meta\.id\)\) \{\s*throw new Error\("靜態 SEED 行程由 JSON 管理，不可寫入動態 TRIP 資料庫"\);/,
  "Static SEED must not be written to the dynamic Trip table",
);

const list = JSON.parse(
  await readFile(new URL("../public/trips/list.json", import.meta.url), "utf8"),
);
assert.deepEqual(
  list.map((trip) => trip.id).filter(isStaticSeedTripId).sort(),
  [...expectedSeedIds].sort(),
  "Both static SEED IDs must remain present in the JSON manifest",
);

for (const tripId of expectedSeedIds) {
  const detail = JSON.parse(
    await readFile(new URL(`../public/trips/${tripId}.json`, import.meta.url), "utf8"),
  );
  assert.equal(detail.id, tripId, `Static JSON detail ID must match ${tripId}`);
}

console.log("Static SEED priority regression passed: JSON manifest/detail is authoritative; DB/cache rows cannot override or be written.");
