export const COMMONS_PRECISION_PROJECT_PER_MINUTE = 20;
export const COMMONS_PRECISION_PROJECT_PER_DAY = 900;
export const COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS = 25_000;
export const COMMONS_PRECISION_MINUTE_WINDOW_MS = 60_000;

export type CommonsPrecisionQuotaState = "allowed" | "project-quota-reached";
export type CommonsPrecisionQuotaReason = "minute" | "daily";

export interface CommonsPrecisionUsageSnapshot {
  minuteWindowStartedAtMs: number;
  minuteUpstreamRequests: number;
  taipeiDateKey: string;
  dailyUpstreamRequests: number;
}

export type CommonsPrecisionQuotaDecision =
  | { state: "allowed"; snapshot: CommonsPrecisionUsageSnapshot }
  | { state: "project-quota-reached"; reason: CommonsPrecisionQuotaReason; snapshot: CommonsPrecisionUsageSnapshot };

export interface CommonsPrecisionUpstreamLock {
  acquiredAtMs: number;
  expiresAtMs: number;
}

const validTimestamp = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export const getCommonsPrecisionTaipeiDateKey = (nowMs: number): string => {
  if (!validTimestamp(nowMs)) throw new RangeError("時間戳記不正確");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const createCommonsPrecisionUsageSnapshot = (nowMs: number): CommonsPrecisionUsageSnapshot => ({
  minuteWindowStartedAtMs: nowMs,
  minuteUpstreamRequests: 0,
  taipeiDateKey: getCommonsPrecisionTaipeiDateKey(nowMs),
  dailyUpstreamRequests: 0,
});

const normalizeUsageSnapshot = (
  snapshot: CommonsPrecisionUsageSnapshot,
  nowMs: number,
): CommonsPrecisionUsageSnapshot => {
  if (!validTimestamp(nowMs) || !validTimestamp(snapshot.minuteWindowStartedAtMs) ||
    !Number.isSafeInteger(snapshot.minuteUpstreamRequests) || snapshot.minuteUpstreamRequests < 0 ||
    !Number.isSafeInteger(snapshot.dailyUpstreamRequests) || snapshot.dailyUpstreamRequests < 0) {
    throw new RangeError("用量快照格式不正確");
  }
  const minuteReset = nowMs >= snapshot.minuteWindowStartedAtMs + COMMONS_PRECISION_MINUTE_WINDOW_MS;
  const currentDateKey = getCommonsPrecisionTaipeiDateKey(nowMs);
  return {
    minuteWindowStartedAtMs: minuteReset ? nowMs : snapshot.minuteWindowStartedAtMs,
    minuteUpstreamRequests: minuteReset ? 0 : snapshot.minuteUpstreamRequests,
    taipeiDateKey: currentDateKey,
    dailyUpstreamRequests: currentDateKey === snapshot.taipeiDateKey ? snapshot.dailyUpstreamRequests : 0,
  };
};

export const reserveCommonsPrecisionUpstreamRequest = (
  snapshot: CommonsPrecisionUsageSnapshot,
  nowMs: number,
): CommonsPrecisionQuotaDecision => {
  const normalized = normalizeUsageSnapshot(snapshot, nowMs);
  if (normalized.minuteUpstreamRequests >= COMMONS_PRECISION_PROJECT_PER_MINUTE) {
    return { state: "project-quota-reached", reason: "minute", snapshot: normalized };
  }
  if (normalized.dailyUpstreamRequests >= COMMONS_PRECISION_PROJECT_PER_DAY) {
    return { state: "project-quota-reached", reason: "daily", snapshot: normalized };
  }
  return {
    state: "allowed",
    snapshot: {
      ...normalized,
      minuteUpstreamRequests: normalized.minuteUpstreamRequests + 1,
      dailyUpstreamRequests: normalized.dailyUpstreamRequests + 1,
    },
  };
};

export type CommonsPrecisionLockDecision =
  | { state: "acquired"; lock: CommonsPrecisionUpstreamLock }
  | { state: "in-progress"; lock: CommonsPrecisionUpstreamLock };

export const acquireCommonsPrecisionUpstreamLock = (
  existing: CommonsPrecisionUpstreamLock | undefined,
  nowMs: number,
): CommonsPrecisionLockDecision => {
  if (!validTimestamp(nowMs)) throw new RangeError("鎖時間戳記不正確");
  if (existing && Number.isSafeInteger(existing.expiresAtMs) && existing.expiresAtMs > nowMs) {
    return { state: "in-progress", lock: { ...existing } };
  }
  return {
    state: "acquired",
    lock: {
      acquiredAtMs: nowMs,
      expiresAtMs: nowMs + COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS,
    },
  };
};

export const isCommonsPrecisionUpstreamLockActive = (
  lock: CommonsPrecisionUpstreamLock | undefined,
  nowMs: number,
): boolean => Boolean(lock && validTimestamp(nowMs) && lock.expiresAtMs > nowMs);
