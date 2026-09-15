import assert from "node:assert/strict";

import {
  COMMONS_PRECISION_CACHE_MAX_CANDIDATE_BYTES,
  COMMONS_PRECISION_CACHE_MAX_EVIDENCE_BYTES,
  COMMONS_PRECISION_CACHE_MAX_ROWS,
  COMMONS_PRECISION_CACHE_MAX_SINGLE_BYTES,
  COMMONS_PRECISION_CACHE_MAX_TOTAL_BYTES,
  COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS,
  COMMONS_PRECISION_ENTITY_CACHE_TTL_MS,
  admitCommonsPrecisionCacheRecord,
  createCommonsPrecisionCacheRecord,
  createCommonsPrecisionCandidateCacheKey,
  createCommonsPrecisionEntityCacheKey,
  createCommonsPrecisionNoSuitableCacheKey,
  isCommonsPrecisionCacheRecordReadable,
} from "../supabase/functions/travel-route/commonsPrecisionCache.ts";

const now = Date.UTC(2026, 0, 1, 0, 0, 0);
const entityKey = createCommonsPrecisionEntityCacheKey("Q100");
const queryHash = "a".repeat(64);
const candidateKey = createCommonsPrecisionCandidateCacheKey({ queryHash, language: "zh-Hant" });
const noSuitableKey = createCommonsPrecisionNoSuitableCacheKey({ queryHash, language: "zh-Hant" });
assert.match(entityKey, /^entity:commons-precision-v1:Q100$/);
assert.match(candidateKey, /^candidate:commons-precision-v1:zh-hant:a{64}$/);
assert.match(noSuitableKey, /^no-suitable:commons-precision-v1:zh-hant:a{64}$/);
assert.throws(() => createCommonsPrecisionEntityCacheKey("Q0"), /QID/);
assert.throws(() => createCommonsPrecisionCandidateCacheKey({ queryHash: "raw-query", language: "en" }), /key/);

const entity = createCommonsPrecisionCacheRecord({ kind: "entity-evidence", key: entityKey, payload: { qid: "Q100", p18: ["File:One.jpg"] }, createdAtMs: now });
assert.equal(entity.expiresAtMs - now, COMMONS_PRECISION_ENTITY_CACHE_TTL_MS);
assert.equal(entity.payloadBytes > 0, true);
assert.equal(isCommonsPrecisionCacheRecordReadable(entity, now + COMMONS_PRECISION_ENTITY_CACHE_TTL_MS - 1), true);
assert.equal(isCommonsPrecisionCacheRecordReadable(entity, now + COMMONS_PRECISION_ENTITY_CACHE_TTL_MS), false);
const candidate = createCommonsPrecisionCacheRecord({ kind: "candidate-results", key: candidateKey, payload: { candidates: [{ fileTitle: "File:One.jpg" }] }, createdAtMs: now });
assert.equal(candidate.expiresAtMs - now, COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS);
const noSuitable = createCommonsPrecisionCacheRecord({ kind: "no-suitable-image", key: noSuitableKey, payload: { state: "no-suitable-image" }, createdAtMs: now });

const admitted = admitCommonsPrecisionCacheRecord([entity], candidate, now + 1);
assert.equal(admitted.accepted, true);
assert.equal(admitted.activeRecords.length, 1);
const replaced = admitCommonsPrecisionCacheRecord([candidate], { ...candidate, payload: { candidates: [] }, payloadBytes: 16 }, now + 1);
assert.equal(replaced.accepted, true);
assert.equal(replaced.activeRecords.length, 0, "同 key 更新前應移除舊列");
assert.equal(admitCommonsPrecisionCacheRecord([candidate], noSuitable, now + 1).accepted, true);

const forbiddenPayloads = [
  { tripId: "trip" },
  { userId: "user" },
  { ip: "127.0.0.1" },
  { searchTerm: "第一航廈" },
  { continuation: "opaque" },
  { imageBinary: "base64" },
];
for (const payload of forbiddenPayloads) {
  assert.throws(() => createCommonsPrecisionCacheRecord({ kind: "candidate-results", key: candidateKey, payload, createdAtMs: now }), /禁止保存/);
}
assert.throws(() => createCommonsPrecisionCacheRecord({ kind: "candidate-results", key: candidateKey, payload: "x".repeat(COMMONS_PRECISION_CACHE_MAX_SINGLE_BYTES), createdAtMs: now }), /64 KiB/);

const tooManyRows = Array.from({ length: COMMONS_PRECISION_CACHE_MAX_ROWS }, (_, index) => ({ ...candidate, key: `candidate:${index}` }));
const rowLimit = admitCommonsPrecisionCacheRecord(tooManyRows, { ...candidate, key: "candidate:new" }, now + 1);
assert.deepEqual({ accepted: rowLimit.accepted, reason: rowLimit.reason }, { accepted: false, reason: "row-limit" });
const candidateLimit = admitCommonsPrecisionCacheRecord([{ ...candidate, payloadBytes: COMMONS_PRECISION_CACHE_MAX_CANDIDATE_BYTES }], { ...candidate, key: "candidate:other", payloadBytes: 1 }, now + 1);
assert.deepEqual({ accepted: candidateLimit.accepted, reason: candidateLimit.reason }, { accepted: false, reason: "candidate-limit" });
const evidenceLimit = admitCommonsPrecisionCacheRecord([{ ...entity, payloadBytes: COMMONS_PRECISION_CACHE_MAX_EVIDENCE_BYTES }], { ...entity, key: "entity:other", payloadBytes: 1 }, now + 1);
assert.deepEqual({ accepted: evidenceLimit.accepted, reason: evidenceLimit.reason }, { accepted: false, reason: "evidence-limit" });
const totalLimit = admitCommonsPrecisionCacheRecord([
  { ...candidate, payloadBytes: COMMONS_PRECISION_CACHE_MAX_CANDIDATE_BYTES },
  { ...entity, key: "entity:full", payloadBytes: COMMONS_PRECISION_CACHE_MAX_EVIDENCE_BYTES },
], { ...noSuitable, kind: "in-progress-lock", key: "lock:other", payloadBytes: 1 }, now + 1);
assert.deepEqual({ accepted: totalLimit.accepted, reason: totalLimit.reason }, { accepted: false, reason: "total-limit" });

assert.equal(COMMONS_PRECISION_CACHE_MAX_TOTAL_BYTES, 10 * 1024 * 1024);
assert.equal(COMMONS_PRECISION_CACHE_MAX_SINGLE_BYTES, 64 * 1024);

console.log("V3.9.1 Commons 共享快取 key、TTL、容量與敏感欄位排除契約驗證通過。");
