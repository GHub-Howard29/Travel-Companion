import {
  assertEquals,
  assertRejects,
} from "jsr:@std/assert@1.0.14";
import {
  destinationDayUtcWindow,
  localMidnightUtcEpoch,
} from "./timezone-utc.ts";

Deno.test("resolves UTC and fractional-offset local midnights", () => {
  assertEquals(
    new Date(localMidnightUtcEpoch("1970-01-01", "UTC")).toISOString(),
    "1970-01-01T00:00:00.000Z",
  );
  assertEquals(
    new Date(localMidnightUtcEpoch("2026-11-20", "Asia/Kathmandu")).toISOString(),
    "2026-11-19T18:15:00.000Z",
  );
});

Deno.test("returns 23-hour spring-forward local day", () => {
  const window = destinationDayUtcWindow("2026-03-08", "America/Los_Angeles");
  assertEquals(new Date(window.startEpoch * 1000).toISOString(), "2026-03-08T08:00:00.000Z");
  assertEquals(new Date(window.endEpoch * 1000).toISOString(), "2026-03-09T07:00:00.000Z");
  assertEquals(window.endEpoch - window.startEpoch, 23 * 3600);
});

Deno.test("returns 25-hour fall-back local day", () => {
  const window = destinationDayUtcWindow("2026-11-01", "America/Los_Angeles");
  assertEquals(new Date(window.startEpoch * 1000).toISOString(), "2026-11-01T07:00:00.000Z");
  assertEquals(new Date(window.endEpoch * 1000).toISOString(), "2026-11-02T08:00:00.000Z");
  assertEquals(window.endEpoch - window.startEpoch, 25 * 3600);
});

Deno.test("returns 24-hour ordinary local day", () => {
  const window = destinationDayUtcWindow("2026-11-20", "Asia/Tokyo");
  assertEquals(new Date(window.startEpoch * 1000).toISOString(), "2026-11-19T15:00:00.000Z");
  assertEquals(new Date(window.endEpoch * 1000).toISOString(), "2026-11-20T15:00:00.000Z");
  assertEquals(window.endEpoch - window.startEpoch, 24 * 3600);
});

Deno.test("rejects invalid dates and IANA time zones", async () => {
  await assertRejects(
    () => Promise.resolve().then(() => localMidnightUtcEpoch("0000-01-01", "UTC")),
    RangeError,
    "INVALID_LOCAL_DATE",
  );
  await assertRejects(
    () => Promise.resolve().then(() => localMidnightUtcEpoch("10000-01-01", "UTC")),
    RangeError,
    "INVALID_LOCAL_DATE",
  );
  await assertRejects(
    () => Promise.resolve().then(() => localMidnightUtcEpoch("2026-02-30", "UTC")),
    RangeError,
    "INVALID_LOCAL_DATE",
  );
  await assertRejects(
    () => Promise.resolve().then(() => localMidnightUtcEpoch("2026-1-02", "UTC")),
    RangeError,
    "INVALID_LOCAL_DATE",
  );
  await assertRejects(
    () => Promise.resolve().then(() => localMidnightUtcEpoch("2026-11-20", "Not/A_Real_Zone")),
    RangeError,
    "INVALID_TIME_ZONE",
  );
});
