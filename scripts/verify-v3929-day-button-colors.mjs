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

const twoDayTrip = getItineraryDayButtonClasses([1, 2], 1, {
  isActive: true,
  isToday: false,
});
assert.match(twoDayTrip, /bg-white/);
assert.match(twoDayTrip, /border-rose-500/);
assert.doesNotMatch(twoDayTrip, /bg-blue-50|bg-emerald-50/);

const threeDayTrip = getItineraryDayButtonClasses([1, 2, 3], 0, {
  isActive: true,
  isToday: false,
});
assert.match(threeDayTrip, /bg-blue-50/);
assert.match(threeDayTrip, /border-rose-500/);
assert.doesNotMatch(threeDayTrip, /bg-white/);

console.log("V3.9.29 日期按鈕三天分界與細紅框規則驗證通過");
