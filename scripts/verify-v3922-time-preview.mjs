import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const itineraryPage = readFileSync(resolve(root, "src/components/ItineraryPage.tsx"), "utf8");
const travel = readFileSync(resolve(root, "src/utils/itineraryTravel.ts"), "utf8");
const timeAdjustment = readFileSync(resolve(root, "src/utils/itineraryTimeAdjustment.ts"), "utf8");
const tripTypes = readFileSync(resolve(root, "src/types/trip.ts"), "utf8");

assert.match(tripTypes, /includeInTravelCalculation\?: boolean/);
assert.match(travel, /isIncludedInTravelCalculation/);
assert.match(travel, /item\.type === "餐飲"/);
assert.match(travel, /item\.type === "其他"/);
assert.match(travel, /getTravelNodeIndexes/);
assert.match(travel, /getTravelSegmentsNeedingEstimate/);
assert.match(timeAdjustment, /getTravelNodeIndexes\(items\)/);
assert.match(timeAdjustment, /adjustTimePreviewArrival/);
assert.match(timeAdjustment, /validateRequiredItineraryTimeRange/);
assert.match(timeAdjustment, /新的離開時間不可早於新的到達時間/);
assert.match(itineraryPage, /新的到達時間/);
assert.match(itineraryPage, /新的離開時間/);
assert.match(itineraryPage, /time-adjustment-arrival/);
assert.match(itineraryPage, /納入交通計算/);
assert.match(itineraryPage, /預覽新時間/);
assert.match(itineraryPage, /原本時間尚未變更，可先預覽依新順序計算的時間/);
assert.match(itineraryPage, /尚未修改正式行程，可逐項接受或調整建議時間/);
assert.match(itineraryPage, /調整到達時間/);
assert.match(itineraryPage, /取消預覽/);
assert.match(itineraryPage, /套用新時間/);
assert.doesNotMatch(itineraryPage, /接著調整時間/);

console.log("V3.9.22 排序後時間預覽、交通節點略過與人工調整契約驗證通過。");
