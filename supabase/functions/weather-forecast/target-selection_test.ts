import { getStoredWeatherCardTimes, getWeatherTimeHour, matchesStoredWeatherCardTimeSnapshot, preferSharedTargetCandidate, type WeatherCandidate } from "./target-selection.ts";

const assertSame = (actual: WeatherCandidate, expected: WeatherCandidate) => {
  if (actual !== expected) throw new Error(`Expected candidate ${expected.cardId}, got ${actual.cardId}`);
};

const candidate = (cardId: string, arrivalTime: string): WeatherCandidate => ({
  tripId: "test-trip",
  dayNumber: 1,
  cardId,
  placeId: "test-place",
  forecastDate: "2026-10-20",
  arrivalTime,
  departureTime: arrivalTime,
});

Deno.test("weather card time parser accepts valid HH:mm values and rejects invalid values", () => {
  if (getWeatherTimeHour("10:00") !== 10) throw new Error("Expected 10:00 to parse as hour 10");
  if (getWeatherTimeHour("23:59") !== 23) throw new Error("Expected 23:59 to parse as hour 23");
  if (getWeatherTimeHour("00:00") !== 0) throw new Error("Expected 00:00 to parse as hour 0");
  for (const value of ["24:00", "9:00", "10:60", "", null, undefined]) {
    if (getWeatherTimeHour(value) !== null) throw new Error(`Expected ${String(value)} to be rejected`);
  }
});

Deno.test("shared target uses the candidate without an arrival cutoff", () => {
  const timed = candidate("timed", "09:00");
  const untimed = candidate("untimed", "");
  assertSame(preferSharedTargetCandidate(timed, untimed), untimed);
  assertSame(preferSharedTargetCandidate(untimed, timed), untimed);
});

Deno.test("shared target uses the latest arrival time when all cards have a cutoff", () => {
  const early = candidate("early", "09:00");
  const late = candidate("late", "15:30");
  assertSame(preferSharedTargetCandidate(early, late), late);
  assertSame(preferSharedTargetCandidate(late, early), late);
});

Deno.test("shared target accepts the first candidate", () => {
  const first = candidate("first", "10:00");
  assertSame(preferSharedTargetCandidate(undefined, first), first);
});

Deno.test("stored card time snapshots preserve daily, arrival-hour, and interval modes", () => {
  const daily = getStoredWeatherCardTimes({ time: "", departureTime: "" });
  if (daily.arrivalTime !== "" || daily.departureTime !== "") throw new Error("Expected daily mode times");

  const arrivalHour = getStoredWeatherCardTimes({ time: "09:00", departureTime: "09:00" });
  if (arrivalHour.arrivalTime !== "09:00" || arrivalHour.departureTime !== "09:00") throw new Error("Expected single arrival hour");

  const interval = getStoredWeatherCardTimes({ time: "09:00", departureTime: "12:30" });
  if (interval.arrivalTime !== "09:00" || interval.departureTime !== "12:30") throw new Error("Expected interval range");
});

Deno.test("legacy card without departureTime falls back to its arrival time", () => {
  const legacy = getStoredWeatherCardTimes({ time: "10:15" });
  if (legacy.departureTime !== "10:15") throw new Error("Expected legacy departure fallback");
});

Deno.test("time snapshot accepts exact or legacy-omitted values and rejects client tampering", () => {
  const stored = getStoredWeatherCardTimes({ time: "09:00", departureTime: "12:00" });
  if (!matchesStoredWeatherCardTimeSnapshot(stored, "09:00", "12:00")) throw new Error("Expected exact snapshot match");
  if (!matchesStoredWeatherCardTimeSnapshot(stored, "09:00", undefined)) throw new Error("Expected legacy request compatibility");
  if (matchesStoredWeatherCardTimeSnapshot(stored, "09:00", "18:00")) throw new Error("Expected forged departure to be rejected");
  if (matchesStoredWeatherCardTimeSnapshot(stored, "10:00", "12:00")) throw new Error("Expected stale arrival snapshot to be rejected");
});
