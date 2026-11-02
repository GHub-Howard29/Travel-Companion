import assert from "node:assert/strict";

function classifyPeerState({ applied, incoming, localChanged, peerRevisionArrived }) {
  if (!applied) return localChanged
    ? { action: "reject", reason: "unknown-baseline" }
    : { action: "adopt", version: incoming.version };
  const current = applied.version === incoming.version && applied.checksum === incoming.checksum;
  const parent = applied.version === incoming.parentVersion && applied.checksum === incoming.parentChecksum;
  if (peerRevisionArrived) {
    if (!parent && !current) return { action: "reject", reason: "baseline-mismatch" };
    if (localChanged && parent) return { action: "reject", reason: "concurrent-peer-revision" };
    return { action: "receive", version: incoming.version };
  }
  if (!current) return { action: "reject", reason: "baseline-mismatch" };
  if (!localChanged) return { action: "unchanged", version: incoming.version };
  return { action: "create-next", version: incoming.version + 1 };
}

const v5 = { version: 5, checksum: "v5-hash" };
const v6 = { version: 6, checksum: "v6-hash", parentVersion: 5, parentChecksum: "v5-hash" };

// Both peers start from V5 and either side can originate V6.
assert.deepEqual(classifyPeerState({ applied: v5, incoming: v5, localChanged: false, incomingIsNew: false }), { action: "unchanged", version: 5 });
assert.deepEqual(classifyPeerState({ applied: v5, incoming: v5, localChanged: true, peerRevisionArrived: false }), { action: "create-next", version: 6 });
assert.deepEqual(classifyPeerState({ applied: v5, incoming: v6, localChanged: false, peerRevisionArrived: true }), { action: "receive", version: 6 });

// A node that has already recorded V6 never regenerates a duplicate V7.
assert.deepEqual(classifyPeerState({ applied: v6, incoming: v6, localChanged: false, peerRevisionArrived: false }), { action: "unchanged", version: 6 });

// A node with an unknown baseline cannot turn arbitrary local rows into V6.
assert.deepEqual(classifyPeerState({ applied: null, incoming: v5, localChanged: true, peerRevisionArrived: false }), { action: "reject", reason: "unknown-baseline" });

// Independent changes on both peers from V5 are a conflict, not last-write-wins.
const v6FromPeer = { version: 6, checksum: "other-v6", parentVersion: 5, parentChecksum: "v5-hash" };
assert.deepEqual(classifyPeerState({ applied: v5, incoming: v6FromPeer, localChanged: true, peerRevisionArrived: true }), { action: "reject", reason: "concurrent-peer-revision" });
const v5FromV4 = { version: 5, checksum: "v5-hash", parentVersion: 4, parentChecksum: "v4-hash" };
assert.deepEqual(classifyPeerState({ applied: { version: 4, checksum: "v4-hash" }, incoming: v5FromV4, localChanged: false, peerRevisionArrived: true }), { action: "receive", version: 5 });

console.log("peer sync checks passed (symmetric origin, receive, unchanged, unknown baseline, concurrent update guard)");
