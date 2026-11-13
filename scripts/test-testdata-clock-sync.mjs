import assert from "node:assert/strict";
import {
  classifyTimestampSync,
  sqlTimestampLiteral,
  validateSyncTimestamp,
} from "./lib/testdata-clock-sync.mjs";

const base = "2026-11-12T00:00:00.000000Z";
const localOne = "2026-11-12T01:00:00.000000Z";
const gitOne = "2026-11-12T02:00:00.000000Z";

assert.deepEqual(classifyTimestampSync({
  localLastChangedAt: base,
  lastSyncedAt: base,
  gitLastChangedAt: base,
}), { action: "unchanged", localChanged: false, gitChanged: false });

assert.deepEqual(classifyTimestampSync({
  localLastChangedAt: localOne,
  lastSyncedAt: base,
  gitLastChangedAt: base,
}), { action: "upload", localChanged: true, gitChanged: false });

assert.deepEqual(classifyTimestampSync({
  localLastChangedAt: base,
  lastSyncedAt: base,
  gitLastChangedAt: gitOne,
}), { action: "download", localChanged: false, gitChanged: true });

assert.deepEqual(classifyTimestampSync({
  localLastChangedAt: localOne,
  lastSyncedAt: base,
  gitLastChangedAt: gitOne,
}), { action: "conflict", localChanged: true, gitChanged: true });

assert.deepEqual(classifyTimestampSync({
  localLastChangedAt: localOne,
  lastSyncedAt: null,
  gitLastChangedAt: null,
}), {
  action: "initial-upload-required",
  localChanged: true,
  gitChanged: false,
});

assert.deepEqual(classifyTimestampSync({
  localLastChangedAt: base,
  lastSyncedAt: null,
  gitLastChangedAt: gitOne,
}), {
  action: "initial-download-required",
  localChanged: true,
  gitChanged: true,
});

assert.equal(validateSyncTimestamp("2026-11-12T00:00:00.123456Z", "test"), "2026-11-12T00:00:00.123456Z");
assert.equal(sqlTimestampLiteral(base), "'2026-11-12T00:00:00.000000Z'::timestamptz");
assert.throws(() => validateSyncTimestamp("2026-11-12T00:00:00Z", "test"));
assert.throws(() => validateSyncTimestamp("2026-11-12T00:00:00.000Z", "test"));
assert.throws(() => validateSyncTimestamp("2026-11-12T00:00:00.000000+08:00", "test"));
assert.throws(() => classifyTimestampSync({
  localLastChangedAt: base,
  lastSyncedAt: base,
  gitLastChangedAt: null,
}));

console.log("test-testdata-clock-sync: all assertions passed");
