export interface WeatherCandidate {
  tripId: string;
  dayNumber: number;
  cardId: string;
  placeId: string;
  forecastDate: string;
  arrivalTime: string;
  departureTime: string;
}

const isValidTime = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Parse a validated HH:mm card time into its hour component. */
export const getWeatherTimeHour = (value: unknown): number | null =>
  isValidTime(value) ? Number(value.slice(0, 2)) : null;

/** Read normalized time snapshots only from the saved card; legacy cards fall back to arrival time. */
export const getStoredWeatherCardTimes = (card: Record<string, unknown>) => {
  const arrivalTime = isValidTime(card.time) ? card.time : "";
  const departureTime = isValidTime(card.departureTime) ? card.departureTime : arrivalTime;
  return { arrivalTime, departureTime };
};

/** Optional client snapshots are compatibility hints, never the source of truth. */
export const matchesStoredWeatherCardTimeSnapshot = (
  stored: { arrivalTime: string; departureTime: string },
  arrivalSnapshot: unknown,
  departureSnapshot: unknown,
): boolean =>
  (arrivalSnapshot === undefined || arrivalSnapshot === stored.arrivalTime) &&
  (departureSnapshot === undefined || departureSnapshot === stored.departureTime);

// A shared place/date needs one request. Keep it eligible if any saved card has
// no arrival cutoff, or use the latest arrival time among cards that do.
export const preferSharedTargetCandidate = (
  current: WeatherCandidate | undefined,
  next: WeatherCandidate,
): WeatherCandidate => {
  if (!current || !current.arrivalTime) return current ?? next;
  if (!next.arrivalTime) return next;
  return next.arrivalTime > current.arrivalTime ? next : current;
};
