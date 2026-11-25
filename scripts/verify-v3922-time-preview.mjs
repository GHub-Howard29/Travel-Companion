import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const itineraryPage = readFileSync(resolve(root, "src/components/ItineraryPage.tsx"), "utf8");
const travel = readFileSync(resolve(root, "src/utils/itineraryTravel.ts"), "utf8");
const timeAdjustment = readFileSync(resolve(root, "src/utils/itineraryTimeAdjustment.ts"), "utf8");
const tripTypes = readFileSync(resolve(root, "src/types/trip.ts"), "utf8");
const workspace = readFileSync(resolve(root, "src/hooks/useTripWorkspace.ts"), "utf8");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const saveGate = readFileSync(resolve(root, "src/utils/itinerarySaveGate.ts"), "utf8");
const saveItemBlock = itineraryPage.slice(
  itineraryPage.indexOf("const saveItem = async"),
  itineraryPage.indexOf("const deleteItem = async"),
);
const saveFunctionBlock = workspace.slice(
  workspace.indexOf("const saveItineraryTripDetail"),
  workspace.indexOf("const recordItineraryResolutionChoice"),
);
const resetTimeAdjustmentBlock = itineraryPage.slice(
  itineraryPage.indexOf("const resetTimeAdjustment ="),
  itineraryPage.indexOf("const resetOrder ="),
);

assert.match(tripTypes, /includeInTravelCalculation\?: boolean/);
assert.match(travel, /isIncludedInTravelCalculation/);
assert.match(travel, /item\.type === "餐飲"/);
assert.match(travel, /item\.type === "其他"/);
assert.match(travel, /getTravelNodeIndexes/);
assert.match(travel, /getTravelSegmentsNeedingEstimate/);
assert.match(timeAdjustment, /getTravelNodeIndexes\(items\)/);
assert.match(timeAdjustment, /adjustTimePreviewArrival/);
assert.match(timeAdjustment, /earliestFeasibleArrival/);
assert.match(timeAdjustment, /sourceItems\.map/);
assert.match(timeAdjustment, /materializeTimeAdjustmentEstimates/);
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
assert.match(itineraryPage, /timeAdjustmentSourceItems/);
assert.match(itineraryPage, /acceptedTimeAdjustmentIndexes\.has\(index\)/);
assert.match(itineraryPage, /unacceptedIndexes\.length/);
assert.match(itineraryPage, /key=\{event\.id \?\? `legacy-/);
assert.match(itineraryPage, /placeInputDraft/);
assert.match(itineraryPage, /materializeTimeAdjustmentEstimates\(timeAdjustmentResult\)/);
assert.match(itineraryPage, /saveResult\.localSaved/);
assert.match(itineraryPage, /saveResult\.cloudSynced/);
assert.doesNotMatch(itineraryPage, /接著調整時間/);
assert.doesNotMatch(itineraryPage, /卡片原地編輯/);
assert.match(workspace, /Promise<\{ localSaved: boolean; cloudSynced: boolean \}>/);
assert.match(workspace, /return \{ localSaved: true, cloudSynced: false \}/);
assert.match(workspace, /error instanceof TripVersionConflictError/);
assert.match(app, /saveItineraryWithRevisionNotice\(trip, \{/);
assert.match(app, /save: saveItineraryTripDetail/);
assert.match(saveGate, /await dependencies\.checkForRemoteTripChange\(\)/);
assert.doesNotMatch(saveGate, /if \(await dependencies\.checkForRemoteTripChange\(\)\)/);
assert.match(saveGate, /return await dependencies\.save\(trip\)/);
assert.match(saveGate, /dependencies\.showVersionConflict\(\)/);
assert.match(resetTimeAdjustmentBlock, /setTimeAdjustmentSourceItems\(\[\]\)/);
assert.match(resetTimeAdjustmentBlock, /setTimeAdjustmentResult\(null\)/);
assert.match(resetTimeAdjustmentBlock, /setAcceptedTimeAdjustmentIndexes\(new Set\(\)\)/);
assert.match(saveItemBlock, /location: draft\.location\.trim\(\)/);
assert.doesNotMatch(saveItemBlock, /placeInputDraft/);
assert.match(itineraryPage, /setPlaceInputDraft\(event\.location \|\| \(!isConfirmedPlace\(event\.place\) \? event\.title : ""\)\)/);
assert.ok(
  saveFunctionBlock.indexOf("saveTripRecord({") < saveFunctionBlock.indexOf("writeItinerarySyncState(pendingState)"),
  "本機正式資料必須先保存，再寫入待同步狀態",
);
assert.match(saveFunctionBlock, /saveTripRecord\(storedRecord\)/);
assert.match(saveFunctionBlock, /return \{ localSaved: true, cloudSynced: false \}/);
assert.match(saveFunctionBlock, /return \{ localSaved: false, cloudSynced: false \}/);
assert.match(saveFunctionBlock, /return \{ localSaved: true, cloudSynced: true \}/);

console.log("V3.11.4 T01–T08 核心資料生命週期與保存契約自動驗證通過。");
