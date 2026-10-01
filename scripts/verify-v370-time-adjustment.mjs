import assert from "node:assert/strict";

import {
  adjustTimePreviewArrival,
  calculateTimeAdjustment,
  materializeTimeAdjustmentEstimates,
} from "../src/utils/itineraryTimeAdjustment.ts";
import { getItineraryDayDate, getLunarDateLabel } from "../src/utils/itineraryDate.ts";

const estimate = (minutes) => ({
  mode: "drive",
  durationSeconds: minutes * 60,
  distanceMeters: 1_000,
  originKey: "place:a",
  destinationKey: "place:b",
  queriedAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2026-09-09T00:00:00.000Z",
});
const item = (title, time, departureTime) => ({ time, departureTime, title, type: "景點", typeColor: "", desc: "", location: title });
const route = async () => estimate(21);

const adjusted = await calculateTimeAdjustment([
  item("A", "09:00", "10:15"),
  item("B", "11:00", "12:30"),
  item("C", "13:00", "13:00"),
], 0, "09:30", "10:30", route);
assert.equal(adjusted.blocker, null);
assert.deepEqual(adjusted.items.map(({ time, departureTime }) => [time, departureTime]), [
  ["09:30", "10:30"], ["11:00", "12:30"], ["13:00", "13:00"],
]);

const boundary = await calculateTimeAdjustment([item("A", "09:00", "10:00"), item("B", "10:00", "10:00")], 0, "09:00", "10:00", async () => estimate(30));
assert.equal(boundary.items[1].time, "10:30");
const midnight = await calculateTimeAdjustment([item("A", "20:00", "23:50"), item("B", "23:00", "23:30")], 0, "20:00", "23:50", async () => estimate(20));
assert.match(midnight.blocker.message, /跨越午夜/);
const missing = await calculateTimeAdjustment([item("A", "09:00", "10:00"), item("B", "", "11:00")], 0, "09:00", "10:00", route);
assert.match(missing.blocker.message, /到達時間/);

let invalidRangeRouteCalls = 0;
const invalidRange = await calculateTimeAdjustment(
  [item("A", "09:50", "10:30"), item("B", "11:30", "12:30")],
  0,
  "09:50",
  "08:30",
  async () => {
    invalidRangeRouteCalls += 1;
    return estimate(21);
  },
);
assert.match(invalidRange.blocker.message, /不可早於/);
assert.equal(invalidRangeRouteCalls, 0);

const skipped = await calculateTimeAdjustment([
  item("A", "09:00", "10:00"),
  { ...item("B", "", ""), type: "其他", includeInTravelCalculation: false },
  item("C", "11:30", "12:00"),
], 0, "09:00", "10:00", route);
assert.equal(skipped.blocker, null);
assert.equal(skipped.segments.length, 1);
assert.equal(skipped.segments[0].originIndex, 0);
assert.equal(skipped.segments[0].destinationIndex, 2);
assert.equal(skipped.items[1].time, "");
assert.equal(skipped.items[2].time, "10:30");

const manuallyDelayed = adjustTimePreviewArrival(
  [
    item("A", "09:00", "10:00"),
    item("B", "11:00", "12:00"),
    item("C", "13:00", "13:30"),
  ],
  await calculateTimeAdjustment(
    [
      item("A", "09:00", "10:00"),
      item("B", "11:00", "12:00"),
      item("C", "13:00", "13:30"),
    ],
    0,
    "09:00",
    "10:00",
    route,
  ),
  1,
  "12:00",
);
assert.equal(manuallyDelayed.blocker, null);
assert.equal(manuallyDelayed.items[1].time, "12:00");
assert.equal(manuallyDelayed.items[1].departureTime, "13:00");
assert.equal(manuallyDelayed.items[2].time, "13:30");

const validDriveEstimate = {
  mode: "drive",
  durationSeconds: 1_200,
  distanceMeters: 5_000,
  originKey: "place:place-origin-123",
  destinationKey: "place:place-destination-456",
  queriedAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2099-10-02T00:00:00.000Z",
};
const routeItems = [
  {
    ...item("A", "09:00", "10:00"),
    place: { placeId: "place-origin-123" },
  },
  {
    ...item("B", "10:30", "11:30"),
    place: { placeId: "place-destination-456" },
  },
];
let driveRefreshCalls = 0;
const committedDrive = await materializeTimeAdjustmentEstimates(
  {
    items: routeItems,
    segments: [{ originIndex: 0, destinationIndex: 1, estimate: validDriveEstimate }],
    blocker: null,
  },
  async () => {
    driveRefreshCalls += 1;
    return null;
  },
);
assert.equal(driveRefreshCalls, 0);
assert.deepEqual(committedDrive[0].travelToNext, validDriveEstimate);
assert.equal(committedDrive[0].travelModeToNext, "drive");

const staleTransitEstimate = {
  ...validDriveEstimate,
  mode: "transit",
  departureTimeBasis: "09:30",
};
const refreshedTransitEstimate = {
  ...staleTransitEstimate,
  departureTimeBasis: "10:00",
  queriedAt: "2026-10-01T00:01:00.000Z",
};
let transitRefreshCalls = 0;
const committedTransit = await materializeTimeAdjustmentEstimates(
  {
    items: routeItems,
    segments: [{ originIndex: 0, destinationIndex: 1, estimate: staleTransitEstimate }],
    blocker: null,
  },
  async () => {
    transitRefreshCalls += 1;
    return refreshedTransitEstimate;
  },
);
assert.equal(transitRefreshCalls, 1);
assert.deepEqual(committedTransit[0].travelToNext, refreshedTransitEstimate);
assert.equal(committedTransit[0].travelModeToNext, "transit");

assert.equal(getItineraryDayDate("2026-09-08", 1), "2026-09-08");
assert.equal(getItineraryDayDate("2026-09-08", 2), "2026-09-09");
assert.equal(getItineraryDayDate("2026-12-31", 2), "2027-01-01");
assert.equal(getItineraryDayDate("2024-02-28", 2), "2024-02-29");
assert.equal(getItineraryDayDate("2026-02-29", 1), null);
assert.equal(getLunarDateLabel("2026-09-08"), "七月廿七");
assert.equal(getLunarDateLabel("2026-09-09"), "七月廿八");
assert.equal(getLunarDateLabel("2026-02-29"), null);
assert.equal(getLunarDateLabel("invalid"), null);

console.log("V3.7.0 時間連動計算驗證通過。");
