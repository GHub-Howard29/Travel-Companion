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
const withPlace = (entry, id) => ({ ...entry, place: { placeId: `place-${id.padEnd(10, "0")}` } });
const route = async () => estimate(21);

const adjusted = await calculateTimeAdjustment([
  withPlace(item("A", "09:00", "10:15"), "a"),
  withPlace(item("B", "11:00", "12:30"), "b"),
  withPlace(item("C", "13:00", "13:00"), "c"),
], 0, "09:30", "10:30", route);
assert.equal(adjusted.blocker, null);
assert.deepEqual(adjusted.items.map(({ time, departureTime }) => [time, departureTime]), [
  ["09:30", "10:30"], ["11:00", "12:30"], ["13:00", "13:00"],
]);

const boundary = await calculateTimeAdjustment([withPlace(item("A", "09:00", "10:00"), "boundary-a"), withPlace(item("B", "10:00", "10:00"), "boundary-b")], 0, "09:00", "10:00", async () => estimate(30));
assert.equal(boundary.items[1].time, "10:30");
const midnight = await calculateTimeAdjustment([withPlace(item("A", "20:00", "23:50"), "midnight-a"), withPlace(item("B", "23:00", "23:30"), "midnight-b")], 0, "20:00", "23:50", async () => estimate(20));
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

const estimateCallsWithMissingPlace = [];
const missingPlaceSource = [
  { ...item("A", "08:00", "09:00"), place: { placeId: "place-aaaaaaaaaa" } },
  { ...item("B", "10:00", "10:30"), place: undefined },
  { ...item("C", "11:00", "11:30"), place: { placeId: "place-cccccccccc" } },
];
const inferredMissingPlace = await calculateTimeAdjustment(
  missingPlaceSource,
  0,
  "08:00",
  "10:00",
  async (originIndex, origin, destination) => {
    estimateCallsWithMissingPlace.push([originIndex, origin.title, destination.title]);
    return estimate(20);
  },
);
assert.equal(inferredMissingPlace.blocker, null);
assert.deepEqual(
  inferredMissingPlace.items.map(({ time, departureTime }) => [time, departureTime]),
  [["08:00", "10:00"], ["11:00", "11:30"], ["12:00", "12:30"]],
);
assert.deepEqual(estimateCallsWithMissingPlace, []);
assert.equal(inferredMissingPlace.segments.length, 0);

const skipped = await calculateTimeAdjustment([
  withPlace(item("A", "09:00", "10:00"), "skip-a"),
  { ...item("B", "", ""), type: "其他", includeInTravelCalculation: false },
  withPlace(item("C", "11:30", "12:00"), "skip-c"),
], 0, "09:00", "10:00", route);
assert.equal(skipped.blocker, null);
assert.equal(skipped.segments.length, 1);
assert.equal(skipped.segments[0].originIndex, 0);
assert.equal(skipped.segments[0].destinationIndex, 2);
assert.equal(skipped.items[1].time, "");
assert.equal(skipped.items[2].time, "10:30");

const manuallyDelayed = adjustTimePreviewArrival(
  [
    withPlace(item("A", "09:00", "10:00"), "delay-a"),
    withPlace(item("B", "11:00", "12:00"), "delay-b"),
    withPlace(item("C", "13:00", "13:30"), "delay-c"),
  ],
  await calculateTimeAdjustment(
    [
      withPlace(item("A", "09:00", "10:00"), "delay-a"),
      withPlace(item("B", "11:00", "12:00"), "delay-b"),
      withPlace(item("C", "13:00", "13:30"), "delay-c"),
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

const missingPlaceManual = adjustTimePreviewArrival(
  missingPlaceSource,
  inferredMissingPlace,
  1,
  "11:30",
);
assert.equal(missingPlaceManual.blocker, null);
assert.deepEqual(
  missingPlaceManual.items.map(({ time, departureTime }) => [time, departureTime]),
  [["08:00", "09:00"], ["11:30", "12:00"], ["12:30", "13:00"]],
);

const minuteSource = [
  withPlace(item("A", "14:00", "14:00"), "minute-a"),
  withPlace(item("B", "14:30", "15:00"), "minute-b"),
];
const minutePreview = await calculateTimeAdjustment(
  minuteSource,
  0,
  "14:00",
  "14:00",
  async () => estimate(10),
);
for (const requested of ["14:10", "14:11", "14:30", "14:31"]) {
  const minuteAdjusted = adjustTimePreviewArrival(minuteSource, minutePreview, 1, requested);
  assert.equal(minuteAdjusted.blocker, null, `可行的手動分鐘應接受：${requested}`);
  assert.equal(minuteAdjusted.items[1].time, requested);
}
const impossibleMinute = adjustTimePreviewArrival(minuteSource, minutePreview, 1, "14:09");
assert.match(impossibleMinute.blocker.message, /交通時間/);

const repeatSource = [
  withPlace(item("A", "09:00", "10:00"), "repeat-a"),
  withPlace(item("B", "10:30", "11:30"), "repeat-b"),
  withPlace(item("C", "12:00", "13:00"), "repeat-c"),
];
const repeatPreview = await calculateTimeAdjustment(
  repeatSource,
  0,
  "09:00",
  "10:00",
  async () => estimate(10),
);
const firstManual = adjustTimePreviewArrival(repeatSource, repeatPreview, 1, "11:00");
assert.equal(firstManual.blocker, null);
assert.deepEqual(
  [firstManual.items[1].time, firstManual.items[1].departureTime, firstManual.items[2].time, firstManual.items[2].departureTime],
  ["11:00", "12:00", "12:30", "13:30"],
);
const secondManual = adjustTimePreviewArrival(repeatSource, firstManual, 1, "10:30");
assert.equal(secondManual.blocker, null);
assert.deepEqual(
  [secondManual.items[1].time, secondManual.items[1].departureTime, secondManual.items[2].time, secondManual.items[2].departureTime],
  ["10:30", "11:30", "12:00", "13:00"],
);

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
const committedDrive = materializeTimeAdjustmentEstimates({
  items: routeItems,
  segments: [{ originIndex: 0, destinationIndex: 1, estimate: validDriveEstimate }],
  blocker: null,
});
assert.deepEqual(committedDrive[0].travelToNext, validDriveEstimate);
assert.equal(committedDrive[0].travelModeToNext, "drive");
assert.throws(
  () => materializeTimeAdjustmentEstimates({
    items: routeItems,
    segments: [{
      originIndex: 0,
      destinationIndex: 1,
      estimate: { ...validDriveEstimate, destinationKey: "place:unexpected" },
    }],
    blocker: null,
  }),
  /交通區段已失效/,
);

const staleTransitEstimate = {
  ...validDriveEstimate,
  mode: "transit",
  departureTimeBasis: "09:30",
  expiresAt: "2020-01-01T00:00:00.000Z",
};
const committedTransit = materializeTimeAdjustmentEstimates({
  items: routeItems,
  segments: [{ originIndex: 0, destinationIndex: 1, estimate: staleTransitEstimate }],
  blocker: null,
});
assert.deepEqual(committedTransit[0].travelToNext, staleTransitEstimate);
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

console.log("V3.11.4 批次時間連動與交通估算沿用驗證通過。");
