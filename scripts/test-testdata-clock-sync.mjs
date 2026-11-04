import assert from "node:assert/strict";
import { classifyBaselineSync, createBaselineRecord } from "./lib/testdata-clock-sync.mjs";

const sum = (char) => char.repeat(64);
const old = { baselineAt: "2026-11-01T00:00:00.000Z", checksum: sum("a") };
const newer = { baselineAt: "2026-11-02T00:00:00.000Z", checksum: sum("b") };
const older = { baselineAt: "2026-10-31T00:00:00.000Z", checksum: sum("c") };

assert.deepEqual(classifyBaselineSync(old, newer), { action: "download", reason: "remote-baseline-newer" });
assert.deepEqual(classifyBaselineSync(newer, old), { action: "upload", reason: "local-baseline-newer" });
assert.deepEqual(classifyBaselineSync({ ...newer, baselineAt: "2026-11-03T00:00:00Z" }, old), { action: "upload", reason: "local-baseline-newer" });
assert.deepEqual(classifyBaselineSync(old, { ...old }), { action: "unchanged", reason: "same-time-same-checksum" });
assert.deepEqual(classifyBaselineSync(old, { ...old, checksum: sum("d") }), { action: "conflict", reason: "same-time-different-checksum" });
assert.deepEqual(classifyBaselineSync(null, newer), { action: "download", reason: "local-baseline-missing" });
assert.throws(() => classifyBaselineSync(old, { ...older, checksum: "bad" }));
const record = createBaselineRecord({
  fixtureId: "tc-test-clock-example",
  data: { trips: [{ id: "tc-test-clock-example" }] },
  sourceHost: "NODE-C",
  baselineAt: "2026-11-04T00:00:00.000Z",
});
assert.equal(record.baselineAt, "2026-11-04T00:00:00.000Z");
assert.equal(record.checksum.length, 64);
assert.throws(() => createBaselineRecord({ fixtureId: "trip-real-user", data: {}, sourceHost: "NODE-C" }));

console.log("three-peer baseline timestamp checks passed (download/upload/unchanged/conflict/bootstrap/validation)");
