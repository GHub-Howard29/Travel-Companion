import assert from "node:assert/strict";

const { getItineraryDayButtonClasses } = await import(
  "../src/utils/itineraryDayStyle.ts"
);

const longTrip = [1, 2, 3, 4, 5];
const firstSelected = getItineraryDayButtonClasses(longTrip, 0, {
  isActive: true,
  isToday: false,
});
assert.match(firstSelected, /bg-blue-50/);
assert.match(firstSelected, /border-rose-500/);
assert.doesNotMatch(firstSelected, /bg-white/);

const middleToday = getItineraryDayButtonClasses(longTrip, 2, {
  isActive: false,
  isToday: true,
});
assert.match(middleToday, /bg-emerald-50/);
assert.match(middleToday, /border-rose-500/);
assert.doesNotMatch(middleToday, /bg-white/);

const lastSelected = getItineraryDayButtonClasses(longTrip, 4, {
  isActive: true,
  isToday: false,
});
assert.match(lastSelected, /bg-white/);
assert.match(lastSelected, /border-rose-500/);

const shortTrip = [1, 2];
const shortTripSelected = getItineraryDayButtonClasses(shortTrip, 1, {
  isActive: true,
  isToday: false,
});
assert.match(shortTripSelected, /bg-white/);
assert.match(shortTripSelected, /border-rose-500/);
assert.doesNotMatch(shortTripSelected, /bg-blue-50|bg-emerald-50/);

const threeDayTrip = getItineraryDayButtonClasses([1, 2, 3], 0, {
  isActive: false,
  isToday: false,
});
assert.match(threeDayTrip, /bg-white/);

console.log("V3.9.28 日期按鈕配色與細紅框規則驗證通過");
