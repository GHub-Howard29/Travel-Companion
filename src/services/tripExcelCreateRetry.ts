export const TRIP_EXCEL_CREATE_RECOVERY_DELAY_MS = 30_000;

export interface TripExcelPendingRequest {
  userId: string;
  fingerprint: string;
  requestId: string;
  /** Timestamp of the first create attempt, saved before calling the create RPC. */
  startedAt: number;
  /** Timestamp when the create result first became unconfirmed. */
  resultUnconfirmedAt: number | null;
  /** True once the single delayed lookup has started; prevents duplicate lookups after reload. */
  lookupAttempted: boolean;
}

export const createInitialTripExcelPendingRequest = (
  userId: string,
  fingerprint: string,
  requestId: string,
  now = Date.now(),
): TripExcelPendingRequest => ({
  userId,
  fingerprint,
  requestId,
  startedAt: now,
  resultUnconfirmedAt: null,
  lookupAttempted: false,
});

export const isTripExcelPendingRequest = (
  value: unknown,
): value is TripExcelPendingRequest => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    typeof candidate.fingerprint === "string" &&
    candidate.fingerprint.length > 0 &&
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0 &&
    typeof candidate.startedAt === "number" &&
    Number.isFinite(candidate.startedAt) &&
    (candidate.resultUnconfirmedAt === null ||
      (typeof candidate.resultUnconfirmedAt === "number" &&
        Number.isFinite(candidate.resultUnconfirmedAt))) &&
    typeof candidate.lookupAttempted === "boolean"
  );
};

export const getTripExcelRecoveryDelay = (
  pending: TripExcelPendingRequest,
  now = Date.now(),
): number => {
  const recoveryStartedAt = pending.resultUnconfirmedAt ?? pending.startedAt;
  return Math.max(0, recoveryStartedAt + TRIP_EXCEL_CREATE_RECOVERY_DELAY_MS - now);
};
