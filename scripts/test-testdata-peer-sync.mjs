import assert from "node:assert/strict";
import { classifyPeerHandoff } from "./lib/testdata-revision.mjs";

const checksum = (char) => char.repeat(64);
const v4 = { version: 4, checksum: checksum("4") };
const v5 = { version: 5, checksum: checksum("5"), parentVersion: 4, parentChecksum: v4.checksum };
const v6 = { version: 6, checksum: checksum("6"), parentVersion: 5, parentChecksum: v5.checksum };
const v6FromOtherPeer = { ...v6, checksum: checksum("a") };

// Current revision unchanged: no new revision or upload.
assert.deepEqual(classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, null, true,
), { action: "unchanged", version: 5 });

// Current revision with local business changes: create exactly current + 1.
assert.deepEqual(classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, null, false,
), {
  action: "export-next",
  version: 6,
  parentVersion: 5,
  parentChecksum: v5.checksum,
});

// Peer V6 is based on V5: a clean V5 local database may receive it.
assert.deepEqual(classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, v6, true,
), { action: "receive", version: 6 });

// A local independent DB edit from V5 blocks V6; never overwrite it.
assert.deepEqual(classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, v6, false,
), { action: "reject", reason: "local-database-diverged-from-parent" });

// Already applied V6 with no edits remains unchanged at V6.
assert.deepEqual(classifyPeerHandoff(
  { version: 6, checksum: v6.checksum }, v6, null, true,
), { action: "unchanged", version: 6 });

// Applied revision equal to Git HEAD must compare against HEAD, not its parent.
assert.deepEqual(classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, null, true,
), { action: "unchanged", version: 5 });

// Only the immediately preceding applied revision may receive the Git HEAD revision.
assert.deepEqual(classifyPeerHandoff(
  { version: 4, checksum: v4.checksum }, v4, v5, true,
), { action: "receive", version: 5 });

// Applied V6 plus local edits creates V7 from V6.
assert.deepEqual(classifyPeerHandoff(
  { version: 6, checksum: v6.checksum }, v6, null, false,
), {
  action: "export-next",
  version: 7,
  parentVersion: 6,
  parentChecksum: v6.checksum,
});

// Unknown or unrelated applied baselines are rejected.
assert.deepEqual(classifyPeerHandoff(null, v5, null, false), {
  action: "reject",
  reason: "unknown-baseline",
});
assert.deepEqual(classifyPeerHandoff(
  { version: 3, checksum: checksum("3") }, v5, null, false,
), { action: "reject", reason: "baseline-mismatch" });

// Concurrent V6 from a different checksum must be rejected, not selected.
assert.deepEqual(classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, v6FromOtherPeer, false,
), { action: "reject", reason: "local-database-diverged-from-parent" });

// Parent chain mismatch and invalid gaps fail closed.
assert.throws(() => classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, { ...v6, parentChecksum: checksum("b") }, true,
));
assert.throws(() => classifyPeerHandoff(
  { version: 5, checksum: v5.checksum }, v5, { ...v6, version: 7 }, true,
));

console.log("peer handoff checks passed (production classifier: receive/unchanged/export-next/unknown-baseline/branch-conflict/parent-validation)");
