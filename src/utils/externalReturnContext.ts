const STORAGE_KEY = "travel_companion_external_return_context";
const MAX_AGE_MS = 30 * 60 * 1000;

interface ExternalReturnContext {
  tripId: string;
  day: number;
  expiresAt: number;
}

const readContext = (): ExternalReturnContext | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const context = JSON.parse(raw) as Partial<ExternalReturnContext>;
    if (
      typeof context.tripId !== "string" || !context.tripId ||
      typeof context.day !== "number" || !Number.isSafeInteger(context.day) || context.day < 1 ||
      typeof context.expiresAt !== "number" || context.expiresAt < Date.now()
    ) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return context as ExternalReturnContext;
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    return null;
  }
};

export const rememberExternalReturnContext = (tripId: string, day: number): void => {
  if (!tripId || !Number.isSafeInteger(day) || day < 1) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tripId,
      day,
      expiresAt: Date.now() + MAX_AGE_MS,
    } satisfies ExternalReturnContext));
  } catch {
    // 隱私模式或儲存空間不可用時，保留既有啟動規則。
  }
};

export const getExternalReturnTripId = (validTripIds: readonly string[]): string | null => {
  const context = readContext();
  if (!context) return null;
  if (validTripIds.includes(context.tripId)) return context.tripId;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  return null;
};

export const consumeExternalReturnDay = (
  tripId: string,
  validDays: readonly number[],
): number | null => {
  const context = readContext();
  if (!context || context.tripId !== tripId) return null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  return validDays.includes(context.day) ? context.day : null;
};
