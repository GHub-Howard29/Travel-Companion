import assert from "node:assert/strict";
import { classifyFixtureRevision, formatFixtureRevision } from "./lib/testdata-revision.mjs";

const v9 = { version: 9, checksum: "a".repeat(64) };
const v10 = { version: 10, checksum: "b".repeat(64), parentVersion: 9, parentChecksum: v9.checksum };

assert.deepEqual(classifyFixtureRevision(null, v9), { action: "bootstrap" });
assert.deepEqual(classifyFixtureRevision(v9, v10), { action: "apply" });
// A new revision may intentionally contain identical data: version advancement
// still applies, and the importer must advance applied-state without rewriting rows.
const v10SameData = { ...v10, checksum: v9.checksum, parentChecksum: v9.checksum };
assert.deepEqual(classifyFixtureRevision(v9, v10SameData), { action: "apply" });
assert.deepEqual(classifyFixtureRevision(v10, v10), { action: "skip" });
assert.deepEqual(classifyFixtureRevision(v10, { ...v10, checksum: "other" }), { action: "reject", reason: "same-version-checksum-mismatch" });
assert.deepEqual(classifyFixtureRevision(v10, v9), { action: "reject", reason: "rollback" });
assert.deepEqual(classifyFixtureRevision(v9, { ...v10, version: 11 }), { action: "reject", reason: "revision-gap" });
assert.deepEqual(classifyFixtureRevision(v9, { ...v10, parentChecksum: "wrong" }), { action: "reject", reason: "parent-mismatch" });
assert.equal(formatFixtureRevision(9), "V0.09");
assert.equal(formatFixtureRevision(10), "V0.10");
assert.equal(formatFixtureRevision(11), "V0.11");
assert.throws(() => formatFixtureRevision(0), /positive integer/);

console.log("testdata revision checks passed (bootstrap/apply/skip/rollback/checksum/gap/parent/format)");
