import assert from "node:assert/strict";

import {
  getItineraryDayButtonClasses,
  getItineraryDayTone,
} from "../src/utils/itineraryDayStyle.ts";

assert.equal(getItineraryDayTone([1], 0), "last");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 0), "first");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 1), "middle");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 3), "middle");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 4), "last");

const activeTodayClasses = getItineraryDayButtonClasses([1, 2, 3], 0, {
  isActive: true,
  isToday: true,
});
assert.match(activeTodayClasses, /!border-2/);
assert.match(activeTodayClasses, /!border-rose-700/);
assert.doesNotMatch(activeTodayClasses, /border-\[3px\]|ring-1/);

const todayButNotSelectedClasses = getItineraryDayButtonClasses([1, 2, 3], 0, {
  isActive: false,
  isToday: true,
});
assert.match(todayButNotSelectedClasses, /ring-1 ring-slate-300/);
assert.doesNotMatch(todayButNotSelectedClasses, /border-rose-700/);

const selectedButNotTodayClasses = getItineraryDayButtonClasses([1, 2, 3], 1, {
  isActive: true,
  isToday: false,
});
assert.match(selectedButNotTodayClasses, /!border-rose-700/);
assert.doesNotMatch(selectedButNotTodayClasses, /ring-1/);

console.log("Day 切換按鈕配色與選取狀態驗證通過。");
