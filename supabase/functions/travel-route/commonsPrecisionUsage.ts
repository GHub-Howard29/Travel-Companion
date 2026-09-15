import type { CommonsPrecisionState } from "./commonsPrecision.ts";

export const COMMONS_PRECISION_USAGE_MAX_DURATION_MS = 20_000;

export const COMMONS_PRECISION_LATENCY_BUCKETS = ["under-2s", "2-to-5s", "5-to-20s"] as const;
export type CommonsPrecisionLatencyBucket = (typeof COMMONS_PRECISION_LATENCY_BUCKETS)[number];

export interface CommonsPrecisionUsageDelta {
  precisionSearches: number;
  upstreamRequests: number;
  entityCacheHits: number;
  candidateCacheHits: number;
  noSuitableCacheHits: number;
  successfulSearches: number;
  allFilteredSearches: number;
  noSuitableSearches: number;
  projectQuotaReached: number;
  timeoutCount: number;
  rateLimited429: number;
  upstreamError503: number;
  latencyUnder2s: number;
  latency2To5s: number;
  latency5To20s: number;
}

export interface CommonsPrecisionUsageInput {
  state: CommonsPrecisionState;
  upstreamRequests: number;
  durationMs: number;
  entityCacheHit?: boolean;
  candidateCacheHit?: boolean;
  noSuitableCacheHit?: boolean;
  allCandidatesRejected?: boolean;
  upstreamStatus?: 429 | 503;
}

export const createEmptyCommonsPrecisionUsageDelta = (): CommonsPrecisionUsageDelta => ({
  precisionSearches: 0,
  upstreamRequests: 0,
  entityCacheHits: 0,
  candidateCacheHits: 0,
  noSuitableCacheHits: 0,
  successfulSearches: 0,
  allFilteredSearches: 0,
  noSuitableSearches: 0,
  projectQuotaReached: 0,
  timeoutCount: 0,
  rateLimited429: 0,
  upstreamError503: 0,
  latencyUnder2s: 0,
  latency2To5s: 0,
  latency5To20s: 0,
});

const isSafeCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export const classifyCommonsPrecisionLatency = (durationMs: number): CommonsPrecisionLatencyBucket => {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > COMMONS_PRECISION_USAGE_MAX_DURATION_MS) {
    throw new RangeError("精準搜尋延遲必須是 0 至 20 秒的整數毫秒");
  }
  if (durationMs < 2_000) return "under-2s";
  if (durationMs < 5_000) return "2-to-5s";
  return "5-to-20s";
};

export const createCommonsPrecisionUsageDelta = (input: CommonsPrecisionUsageInput): CommonsPrecisionUsageDelta => {
  if (!isSafeCount(input.upstreamRequests)) throw new RangeError("上游請求數必須是非負安全整數");
  const bucket = classifyCommonsPrecisionLatency(input.durationMs);
  if (input.state === "rate-limited" && input.upstreamStatus !== 429) throw new Error("429 分類必須帶有 429 上游狀態");
  if (input.state === "upstream-error" && input.upstreamStatus !== 503) throw new Error("503 分類必須帶有 503 上游狀態");
  if (input.state !== "rate-limited" && input.upstreamStatus === 429) throw new Error("非 rate-limited 狀態不得帶有 429");
  if (input.state !== "upstream-error" && input.upstreamStatus === 503) throw new Error("非 upstream-error 狀態不得帶有 503");
  const delta = createEmptyCommonsPrecisionUsageDelta();
  delta.precisionSearches = 1;
  delta.upstreamRequests = input.upstreamRequests;
  if (input.entityCacheHit) delta.entityCacheHits = 1;
  if (input.candidateCacheHit) delta.candidateCacheHits = 1;
  if (input.noSuitableCacheHit) delta.noSuitableCacheHits = 1;
  if (input.state === "results") delta.successfulSearches = 1;
  if (input.state === "no-suitable-image") {
    delta.noSuitableSearches = 1;
    if (input.allCandidatesRejected) delta.allFilteredSearches = 1;
  }
  if (input.state === "project-quota-reached") delta.projectQuotaReached = 1;
  if (input.state === "timeout") delta.timeoutCount = 1;
  if (input.state === "rate-limited") delta.rateLimited429 = 1;
  if (input.state === "upstream-error") delta.upstreamError503 = 1;
  if (bucket === "under-2s") delta.latencyUnder2s = 1;
  if (bucket === "2-to-5s") delta.latency2To5s = 1;
  if (bucket === "5-to-20s") delta.latency5To20s = 1;
  return delta;
};

export const mergeCommonsPrecisionUsageDelta = (
  left: CommonsPrecisionUsageDelta,
  right: CommonsPrecisionUsageDelta,
): CommonsPrecisionUsageDelta => {
  const keys = Object.keys(createEmptyCommonsPrecisionUsageDelta()) as (keyof CommonsPrecisionUsageDelta)[];
  for (const value of [...keys].map((key) => left[key]).concat([...keys].map((key) => right[key]))) {
    if (!isSafeCount(value)) throw new RangeError("用量 delta 必須只含非負安全整數");
  }
  return Object.fromEntries(keys.map((key) => [key, left[key] + right[key]])) as CommonsPrecisionUsageDelta;
};
