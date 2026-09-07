import assert from "node:assert/strict";

import { calculateTimeAdjustment } from "../src/utils/itineraryTimeAdjustment.ts";

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
], 0, "10:30", route);
assert.equal(adjusted.blocker, null);
assert.deepEqual(adjusted.items.map(({ time, departureTime }) => [time, departureTime]), [
  ["09:00", "10:30"], ["11:00", "12:30"], ["13:00", "13:00"],
]);

const boundary = await calculateTimeAdjustment([item("A", "09:00", "10:00"), item("B", "10:00", "10:00")], 0, "10:00", async () => estimate(30));
assert.equal(boundary.items[1].time, "10:30");
const midnight = await calculateTimeAdjustment([item("A", "20:00", "23:50"), item("B", "23:00", "23:30")], 0, "23:50", async () => estimate(20));
assert.match(midnight.blocker.message, /跨越午夜/);
const missing = await calculateTimeAdjustment([item("A", "09:00", "10:00"), item("B", "", "11:00")], 0, "10:00", route);
assert.match(missing.blocker.message, /到達時間/);

console.log("V3.7.0 時間連動計算驗證通過。");
