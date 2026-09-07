import assert from "node:assert/strict";

import { getItineraryDayTone } from "../src/utils/itineraryDayStyle.ts";

assert.equal(getItineraryDayTone([1], 0), "last");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 0), "first");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 1), "middle");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 3), "middle");
assert.equal(getItineraryDayTone([1, 2, 3, 4, 5], 4), "last");

console.log("Day 切換按鈕語意配色驗證通過。");
