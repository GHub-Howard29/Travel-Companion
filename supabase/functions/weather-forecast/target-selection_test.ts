import { preferSharedTargetCandidate, type WeatherCandidate } from "./target-selection.ts";

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
