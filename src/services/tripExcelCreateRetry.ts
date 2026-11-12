export const TRIP_EXCEL_CREATE_COOLDOWN_MS = 60_000;
export const TRIP_EXCEL_CREATE_MAX_MANUAL_RETRIES = 1;

export interface TripExcelPendingRequest {
  fingerprint: string;
  requestId: string;
  manualRetryCount: number;
  /** True once the first create attempt has returned an unconfirmed outcome. */
  resultUnconfirmed: boolean;
  cooldownStartedAt: number | null;
}

export type TripExcelRetryDecision =
  | { action: "LOOKUP"; reason: "COOLDOWN_ACTIVE" | "COOLDOWN_ELAPSED"; retryAt: number | null }
  | { action: "CREATE"; manualRetryCount: number; cooldownStartedAt: number }
  | { action: "BLOCKED"; reason: "RETRY_LIMIT_REACHED" };

export const createInitialTripExcelPendingRequest = (
  fingerprint: string,
  requestId: string,
): TripExcelPendingRequest => ({
  fingerprint,
  requestId,
  manualRetryCount: 0,
  resultUnconfirmed: false,
  cooldownStartedAt: null,
});

/**
 * Decide the next action for an unresolved create request.
 * The first user retry is allowed once and starts the one-minute cooldown.
 * Further clicks during cooldown perform lookup only; after cooldown, lookup
 * must happen before any further create request is considered.
 */
export const decideTripExcelRetry = (
  pending: TripExcelPendingRequest,
  now = Date.now(),
): TripExcelRetryDecision => {
  if (pending.manualRetryCount >= TRIP_EXCEL_CREATE_MAX_MANUAL_RETRIES) {
    const cooldownEndsAt = pending.cooldownStartedAt === null
      ? null
      : pending.cooldownStartedAt + TRIP_EXCEL_CREATE_COOLDOWN_MS;
    if (cooldownEndsAt === null || now < cooldownEndsAt) {
      return {
        action: "LOOKUP",
        reason: "COOLDOWN_ACTIVE",
        retryAt: cooldownEndsAt,
      };
    }
    return {
      action: "LOOKUP",
      reason: "COOLDOWN_ELAPSED",
      retryAt: null,
    };
  }

  return {
    action: "CREATE",
    manualRetryCount: pending.manualRetryCount + 1,
    cooldownStartedAt: now,
  };
};

export const isTripExcelPendingRequest = (
  value: unknown,
): value is TripExcelPendingRequest => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.fingerprint === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.manualRetryCount === "number" &&
    Number.isInteger(candidate.manualRetryCount) &&
    candidate.manualRetryCount >= 0 &&
    typeof candidate.resultUnconfirmed === "boolean" &&
    (candidate.cooldownStartedAt === null ||
      (typeof candidate.cooldownStartedAt === "number" &&
        Number.isFinite(candidate.cooldownStartedAt)))
  );
};
