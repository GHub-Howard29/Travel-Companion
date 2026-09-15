import assert from "node:assert/strict";
import {
  classifyCommonsPrecisionLatency,
  createCommonsPrecisionUsageDelta,
  createEmptyCommonsPrecisionUsageDelta,
  mergeCommonsPrecisionUsageDelta,
} from "../supabase/functions/travel-route/commonsPrecisionUsage.ts";

assert.equal(classifyCommonsPrecisionLatency(1_999), "under-2s");
assert.equal(classifyCommonsPrecisionLatency(2_000), "2-to-5s");
assert.equal(classifyCommonsPrecisionLatency(4_999), "2-to-5s");
assert.equal(classifyCommonsPrecisionLatency(5_000), "5-to-20s");
assert.equal(classifyCommonsPrecisionLatency(20_000), "5-to-20s");
assert.throws(() => classifyCommonsPrecisionLatency(20_001), /20 秒/);

const success = createCommonsPrecisionUsageDelta({ state: "results", upstreamRequests: 2, durationMs: 1_000, entityCacheHit: true });
assert.deepEqual({ precisionSearches: success.precisionSearches, upstreamRequests: success.upstreamRequests, successfulSearches: success.successfulSearches, entityCacheHits: success.entityCacheHits, latencyUnder2s: success.latencyUnder2s }, { precisionSearches: 1, upstreamRequests: 2, successfulSearches: 1, entityCacheHits: 1, latencyUnder2s: 1 });
const stopped = createCommonsPrecisionUsageDelta({ state: "no-suitable-image", upstreamRequests: 9, durationMs: 5_000, allCandidatesRejected: true, noSuitableCacheHit: true });
assert.equal(stopped.noSuitableSearches, 1);
assert.equal(stopped.allFilteredSearches, 1);
assert.equal(stopped.noSuitableCacheHits, 1);
assert.equal(createCommonsPrecisionUsageDelta({ state: "project-quota-reached", upstreamRequests: 0, durationMs: 0 }).projectQuotaReached, 1);
assert.equal(createCommonsPrecisionUsageDelta({ state: "timeout", upstreamRequests: 1, durationMs: 20_000 }).timeoutCount, 1);
assert.equal(createCommonsPrecisionUsageDelta({ state: "rate-limited", upstreamRequests: 1, upstreamStatus: 429, durationMs: 2_000 }).rateLimited429, 1);
assert.equal(createCommonsPrecisionUsageDelta({ state: "upstream-error", upstreamRequests: 1, upstreamStatus: 503, durationMs: 5_000 }).upstreamError503, 1);
assert.throws(() => createCommonsPrecisionUsageDelta({ state: "rate-limited", upstreamRequests: 1, durationMs: 1_000 }), /429/);
assert.throws(() => createCommonsPrecisionUsageDelta({ state: "results", upstreamRequests: 1, upstreamStatus: 429, durationMs: 1_000 }), /非 rate-limited/);
const empty = createEmptyCommonsPrecisionUsageDelta();
const merged = mergeCommonsPrecisionUsageDelta(success, stopped);
assert.equal(merged.precisionSearches, 2);
assert.equal(success.precisionSearches, 1);
assert.equal(empty.upstreamRequests, 0);
assert.equal(Object.keys(merged).some((key) => /query|qid|trip|user|url/i.test(key)), false);
assert.throws(() => mergeCommonsPrecisionUsageDelta({ ...empty, timeoutCount: -1 }, empty), /非負/);
console.log("V3.9.1 Commons 用量 delta、終態與延遲分類純函式契約驗證通過。");
