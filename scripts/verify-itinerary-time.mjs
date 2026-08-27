import assert from "node:assert/strict";

import {
  getItineraryTimeValue,
  normalizeItineraryTime,
  sortItineraryItemsByTime,
} from "../src/utils/itineraryTime.ts";

assert.equal(getItineraryTimeValue("08:00"), 8 * 60);
assert.equal(getItineraryTimeValue("8:00"), 8 * 60);
assert.equal(getItineraryTimeValue("08：00"), 8 * 60);
assert.equal(getItineraryTimeValue("08 : 00"), null);
assert.equal(getItineraryTimeValue("08 ： 00"), null);
assert.equal(getItineraryTimeValue("24:00"), null);
assert.equal(getItineraryTimeValue("08:60"), null);
assert.equal(getItineraryTimeValue(""), null);

assert.equal(normalizeItineraryTime("8：00"), "08:00");
assert.equal(normalizeItineraryTime(" 08:00 "), "08:00");
assert.equal(normalizeItineraryTime("08 : 00"), "08 : 00");

const sortedItems = sortItineraryItemsByTime([
  { id: "afternoon", time: "15:00" },
  { id: "morning-fullwidth", time: "08：00" },
  { id: "spaced-invalid", time: "07 : 00" },
  { id: "empty", time: "" },
]);

assert.deepEqual(
  sortedItems.map((item) => item.id),
  ["morning-fullwidth", "afternoon", "spaced-invalid", "empty"],
);

console.log("行程時間格式與排序驗證通過。");
