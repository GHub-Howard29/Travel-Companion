import type { CommonsPrecisionUsageDailyRow } from "./commonsPrecisionUsageDaily.ts";
import { assertCommonsPrecisionUsageDateKey, getCommonsPrecisionUsageMonthKey } from "./commonsPrecisionUsageDaily.ts";
import type { CommonsPrecisionUsageDelta } from "./commonsPrecisionUsage.ts";

export const COMMONS_PRECISION_USAGE_DAILY_CONTRACT_VERSION = "commons-precision-usage-daily-v1";

const counterKeys = [
  "precisionSearches", "upstreamRequests", "entityCacheHits", "candidateCacheHits", "noSuitableCacheHits",
  "successfulSearches", "allFilteredSearches", "noSuitableSearches", "projectQuotaReached", "timeoutCount",
  "rateLimited429", "upstreamError503", "latencyUnder2s", "latency2To5s", "latency5To20s",
] as const satisfies readonly (keyof CommonsPrecisionUsageDelta)[];

const forbiddenKeys = new Set(["query", "rawQuery", "qid", "fileTitle", "imageUrl", "tripId", "userId", "ip", "apiKey", "serviceKey", "error", "rawError", "token", "authorization", "cookie"]);

const assertCounter = (value: unknown, name: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RangeError(`用量欄位 ${name} 必須是非負安全整數`);
  return value as number;
};

export const createCommonsPrecisionUsageDailyPersistencePayload = (row: CommonsPrecisionUsageDailyRow) => {
  assertCommonsPrecisionUsageDateKey(row.dateKey);
  const counters = Object.fromEntries(counterKeys.map((key) => [key, assertCounter(row.counters[key], key)]));
  return {
    contractVersion: COMMONS_PRECISION_USAGE_DAILY_CONTRACT_VERSION,
    dateKey: row.dateKey,
    counters,
  };
};

export const createCommonsPrecisionUsageDailyAtomicUpdate = (input: {
  dateKey: string;
  currentDateKey: string;
  delta: CommonsPrecisionUsageDelta;
}) => {
  assertCommonsPrecisionUsageDateKey(input.dateKey);
  assertCommonsPrecisionUsageDateKey(input.currentDateKey);
  if (input.dateKey !== input.currentDateKey) throw new Error("日彙總原子更新只能寫入當日列");
  const payload = createCommonsPrecisionUsageDailyPersistencePayload({ dateKey: input.dateKey, counters: input.delta });
  return { ...payload, pruneMonthBefore: getCommonsPrecisionUsageMonthKey(input.currentDateKey) };
};

export const assertCommonsPrecisionUsagePersistenceShape = (value: unknown): void => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("日彙總資料必須是物件");
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key)) throw new Error(`日彙總禁止保存欄位：${key}`);
  }
  const record = value as Record<string, unknown>;
  if (record.contractVersion !== COMMONS_PRECISION_USAGE_DAILY_CONTRACT_VERSION) throw new Error("日彙總契約版本不符");
  if (typeof record.dateKey !== "string" || typeof record.counters !== "object" || !record.counters) throw new Error("日彙總欄位不完整");
  const counters = record.counters as Record<string, unknown>;
  const expected = new Set(counterKeys);
  for (const key of Object.keys(counters)) if (!expected.has(key as keyof CommonsPrecisionUsageDelta)) throw new Error(`日彙總禁止未知計數欄位：${key}`);
  for (const key of counterKeys) assertCounter(counters[key], key);
};
