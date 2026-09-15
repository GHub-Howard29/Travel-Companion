import { COMMONS_PRECISION_CONTRACT_VERSION } from "./commonsPrecision.ts";

export const COMMONS_PRECISION_ENTITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1_000;
export const COMMONS_PRECISION_CACHE_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const COMMONS_PRECISION_CACHE_MAX_CANDIDATE_BYTES = 8 * 1024 * 1024;
export const COMMONS_PRECISION_CACHE_MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
export const COMMONS_PRECISION_CACHE_MAX_ROWS = 5_000;
export const COMMONS_PRECISION_CACHE_MAX_SINGLE_BYTES = 64 * 1024;

export type CommonsPrecisionCacheKind =
  | "entity-evidence"
  | "candidate-results"
  | "no-suitable-image"
  | "in-progress-lock";

export interface CommonsPrecisionCacheRecord {
  kind: CommonsPrecisionCacheKind;
  key: string;
  createdAtMs: number;
  expiresAtMs: number;
  payloadBytes: number;
  payload: unknown;
}

export type CommonsPrecisionCacheAdmissionReason =
  | "accepted"
  | "row-limit"
  | "total-limit"
  | "candidate-limit"
  | "evidence-limit";

export interface CommonsPrecisionCacheAdmission {
  accepted: boolean;
  reason: CommonsPrecisionCacheAdmissionReason;
  activeRecords: CommonsPrecisionCacheRecord[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const QID = /^Q[1-9][0-9]*$/;
const LANGUAGE = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;
const forbiddenKeys = new Set([
  "tripid", "userid", "ip", "address", "latitude", "longitude", "apikey", "servicekey",
  "rawquery", "searchterm", "originalquery", "imagebinary", "binary", "filebytes", "continuation",
  "nextpagetoken", "authorization", "cookie",
]);

const assertTimestamp = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("快取時間戳記不正確");
};

const assertSafePayload = (value: unknown, seen = new Set<object>()): void => {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new RangeError("快取內容不可循環參照");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafePayload(item, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key.toLowerCase())) throw new RangeError("快取內容含禁止保存欄位");
      assertSafePayload(child, seen);
    }
  }
  seen.delete(value);
};

const measurePayload = (payload: unknown): number => {
  assertSafePayload(payload);
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new RangeError("快取內容無法序列化");
  }
  if (serialized === undefined) throw new RangeError("快取內容必須為 JSON 值");
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > COMMONS_PRECISION_CACHE_MAX_SINGLE_BYTES) throw new RangeError("單筆快取超過 64 KiB");
  return bytes;
};

export const createCommonsPrecisionEntityCacheKey = (qid: string): string => {
  if (!QID.test(qid)) throw new RangeError("QID 格式不正確");
  return `entity:${COMMONS_PRECISION_CONTRACT_VERSION}:${qid}`;
};

export const createCommonsPrecisionCandidateCacheKey = (input: { queryHash: string; language: string }): string => {
  if (!SHA256.test(input.queryHash) || !LANGUAGE.test(input.language.toLowerCase())) throw new RangeError("候選快取 key 不正確");
  return `candidate:${COMMONS_PRECISION_CONTRACT_VERSION}:${input.language.toLowerCase()}:${input.queryHash}`;
};

export const createCommonsPrecisionNoSuitableCacheKey = (input: { queryHash: string; language: string }): string =>
  createCommonsPrecisionCandidateCacheKey(input).replace(/^candidate:/, "no-suitable:");

export const createCommonsPrecisionCacheRecord = (input: {
  kind: CommonsPrecisionCacheKind;
  key: string;
  payload: unknown;
  createdAtMs: number;
}): CommonsPrecisionCacheRecord => {
  assertTimestamp(input.createdAtMs);
  if (!input.key || input.key.length > 300) throw new RangeError("快取 key 不正確");
  const payloadBytes = measurePayload(input.payload);
  const ttl = input.kind === "entity-evidence"
    ? COMMONS_PRECISION_ENTITY_CACHE_TTL_MS
    : COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS;
  return {
    kind: input.kind,
    key: input.key,
    createdAtMs: input.createdAtMs,
    expiresAtMs: input.createdAtMs + ttl,
    payloadBytes,
    payload: input.payload,
  };
};

export const isCommonsPrecisionCacheRecordReadable = (record: CommonsPrecisionCacheRecord, nowMs: number): boolean => {
  assertTimestamp(nowMs);
  return record.expiresAtMs > nowMs && record.createdAtMs <= nowMs;
};

export const admitCommonsPrecisionCacheRecord = (
  records: readonly CommonsPrecisionCacheRecord[],
  incoming: CommonsPrecisionCacheRecord,
  nowMs: number,
): CommonsPrecisionCacheAdmission => {
  assertTimestamp(nowMs);
  const activeRecords = records.filter((record) => isCommonsPrecisionCacheRecordReadable(record, nowMs) && record.key !== incoming.key);
  const nextRecords = [...activeRecords, incoming];
  if (nextRecords.length > COMMONS_PRECISION_CACHE_MAX_ROWS) return { accepted: false, reason: "row-limit", activeRecords };
  const candidateBytes = nextRecords.filter((record) => record.kind === "candidate-results" || record.kind === "no-suitable-image")
    .reduce((total, record) => total + record.payloadBytes, 0);
  if (candidateBytes > COMMONS_PRECISION_CACHE_MAX_CANDIDATE_BYTES) return { accepted: false, reason: "candidate-limit", activeRecords };
  const evidenceBytes = nextRecords.filter((record) => record.kind === "entity-evidence")
    .reduce((total, record) => total + record.payloadBytes, 0);
  if (evidenceBytes > COMMONS_PRECISION_CACHE_MAX_EVIDENCE_BYTES) return { accepted: false, reason: "evidence-limit", activeRecords };
  const totalBytes = nextRecords.reduce((total, record) => total + record.payloadBytes, 0);
  if (totalBytes > COMMONS_PRECISION_CACHE_MAX_TOTAL_BYTES) return { accepted: false, reason: "total-limit", activeRecords };
  return { accepted: true, reason: "accepted", activeRecords };
};
