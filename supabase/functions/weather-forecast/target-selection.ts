export interface WeatherCandidate {
  tripId: string;
  dayNumber: number;
  cardId: string;
  placeId: string;
  forecastDate: string;
  arrivalTime: string;
}

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
