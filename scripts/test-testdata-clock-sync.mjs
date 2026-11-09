import assert from "node:assert/strict";
import {
  classifyThreeWaySync, createBaselineRecord, createSyncedManifest, resolveBaseChecksum,
} from "./lib/testdata-clock-sync.mjs";

const sum = (char) => char.repeat(64);
const base = sum("a");
const localOnly = sum("b");
const remoteOnly = sum("c");
const converged = sum("d");
const fixtureId = "tc-test-clock-example";

assert.deepEqual(classifyThreeWaySync({ localChecksum: base, remoteChecksum: remoteOnly, baseChecksum: base }),
  { action: "download", reason: "git-only-change" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: localOnly, remoteChecksum: base, baseChecksum: base }),
  { action: "upload", reason: "local-only-change" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: base, remoteChecksum: base, baseChecksum: base }),
  { action: "unchanged", reason: "same-content" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: localOnly, remoteChecksum: remoteOnly, baseChecksum: base }),
  { action: "conflict", reason: "both-sides-changed" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: converged, remoteChecksum: converged, baseChecksum: base }),
  { action: "unchanged", reason: "same-content" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: null, remoteChecksum: remoteOnly, baseChecksum: null, localExists: false }),
  { action: "download", reason: "local-fixture-missing" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: localOnly, remoteChecksum: localOnly, baseChecksum: null }),
  { action: "unchanged", reason: "same-content" }, "converged contents can safely bootstrap without an old Base");
assert.deepEqual(classifyThreeWaySync({ localChecksum: localOnly, remoteChecksum: localOnly, baseChecksum: null, localExists: true }),
  { action: "unchanged", reason: "same-content" });
assert.deepEqual(classifyThreeWaySync({ localChecksum: localOnly, remoteChecksum: localOnly, baseChecksum: sum("z") }),
  { action: "unchanged", reason: "same-content" }, "identical content repairs a missing or stale Base");
assert.deepEqual(classifyThreeWaySync({ localChecksum: localOnly, remoteChecksum: remoteOnly, baseChecksum: "bad" }),
  { action: "conflict", reason: "invalid-common-baseline" }, "invalid Base is treated as unknown, never trusted");
assert.deepEqual(resolveBaseChecksum({
  state: { schemaVersion: 1, fixtures: {} }, fixtureId, manifest: { syncBaseChecksum: base },
  localChecksum: localOnly, remoteChecksum: localOnly, localExists: true,
}), { checksum: localOnly, source: "matching-content-bootstrap", bootstrap: true },
"matching contents establish Base regardless of stale manifest metadata");
assert.deepEqual(resolveBaseChecksum({
  state: { schemaVersion: 1, fixtures: {} }, fixtureId, manifest: { syncBaseChecksum: base },
  localChecksum: localOnly, remoteChecksum: remoteOnly, localExists: false,
}), { checksum: null, source: "missing-baseline" },
"Git manifest must never replace a missing per-machine Base");
assert.throws(() => classifyThreeWaySync({ localChecksum: "bad", remoteChecksum: remoteOnly, baseChecksum: base }));
assert.deepEqual(resolveBaseChecksum({
  state: { schemaVersion: 1, fixtures: { [fixtureId]: { checksum: "invalid" } } }, fixtureId, manifest: {},
  localChecksum: localOnly, remoteChecksum: localOnly, localExists: true,
}), { checksum: localOnly, source: "matching-content-bootstrap", bootstrap: true },
"an invalid local Base is repaired only after matching content");

const data = {
  trips: [{ id: fixtureId, created_at: "2026-11-04T00:00:00.000Z", updated_at: "2026-11-04T00:00:00.000Z" }],
  checklists: [], checklist_items: [], expenses: [], exchange_purchases: [], other_info_items: [],
};
const record = createBaselineRecord({ fixtureId, data, sourceHost: "NODE-C" });
assert.equal(Object.hasOwn(record, "baselineAt"), false,
  "baseline creation must not require or store data timestamps as sync metadata");
assert.equal(record.checksum.length, 64);
assert.throws(() => createBaselineRecord({ fixtureId: "trip-real-user", data: {}, sourceHost: "NODE-C" }));

const manifest = createSyncedManifest({ fixtureId, status: "active" }, base);
assert.equal(manifest.syncBaseChecksum, base);
assert.deepEqual(resolveBaseChecksum({
  state: { schemaVersion: 1, fixtures: {} }, fixtureId, manifest: {},
  localChecksum: base, remoteChecksum: base, localExists: true,
}), { checksum: base, source: "matching-content-bootstrap", bootstrap: true });
assert.deepEqual(resolveBaseChecksum({
  state: { schemaVersion: 1, fixtures: {} }, fixtureId, manifest: {},
  localChecksum: localOnly, remoteChecksum: remoteOnly, localExists: true,
}), { checksum: null, source: "missing-baseline" });

console.log("three-way testdata sync checks passed (upload/download/unchanged/converged/conflict/first-use/bootstrap/manifest)");
