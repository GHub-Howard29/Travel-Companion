import assert from "node:assert/strict";

import {
  getItineraryTimeValue,
  isDepartureBeforeArrival,
  normalizeItineraryTime,
  sortItineraryItemsByTime,
  validateItineraryTime,
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
assert.equal(isDepartureBeforeArrival("08:00", "06:00"), true);
assert.equal(isDepartureBeforeArrival("08：00", "06：00"), true);
assert.equal(isDepartureBeforeArrival("08:00", "08:00"), false);
assert.equal(isDepartureBeforeArrival("08:00", "09:00"), false);
assert.equal(isDepartureBeforeArrival("", "06:00"), false);
assert.equal(isDepartureBeforeArrival("08:00", ""), false);
assert.equal(isDepartureBeforeArrival("格式錯誤", "06:00"), false);
assert.deepEqual(validateItineraryTime(""), { isValid: true, normalized: "" });
assert.deepEqual(validateItineraryTime("  "), { isValid: true, normalized: "" });
assert.deepEqual(validateItineraryTime("8：00"), { isValid: true, normalized: "08:00" });
assert.deepEqual(validateItineraryTime("08 : 00"), {
  isValid: false,
  normalized: "08 : 00",
});
for (const invalidTime of ["08-00", "上午八點", "24:00", "08:60", "8:", ":00"]) {
  assert.equal(validateItineraryTime(invalidTime).isValid, false, invalidTime);
}

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
