export type DestinationWeatherEligibility = "eligible" | "date_passed" | "long_range" | "arrival_passed";

const dateAtTimezone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const timeAtTimezone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
};

const dateDistance = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * The itinerary date and arrival time are always interpreted in the destination's IANA timezone.
 * Call only with a timezone returned by Open-Meteo or persisted from a successful forecast.
 */
export const getDestinationLocalEligibility = (
  now: Date,
  forecastDate: string,
  arrivalTime: string,
  timezone: string,
): DestinationWeatherEligibility => {
  const daysAhead = dateDistance(dateAtTimezone(now, timezone), forecastDate);
  if (daysAhead < 0) return "date_passed";
  if (daysAhead > 10) return "long_range";
  if (daysAhead === 0 && arrivalTime && timeAtTimezone(now, timezone) >= arrivalTime) return "arrival_passed";
  return "eligible";
};
