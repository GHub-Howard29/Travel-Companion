import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateAppUpdatePolicy } from "../src/utils/appVersionPolicy.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const app = readSource("src/App.tsx");
const appVersion = readSource("src/config/appVersion.ts");
const versionHistory = readSource("src/config/versionHistory.ts");
const versionInfoModal = readSource("src/components/VersionInfoModal.tsx");
const tripEditor = readSource("src/components/TripEditorModal.tsx");
const itinerary = readSource("src/components/ItineraryPage.tsx");
const materialIcons = readSource("src/components/MaterialTravelModeIcon.tsx");

assert.match(app, /isMandatoryRelease=\{IS_MANDATORY_RELEASE\}/);
assert.match(app, /isMandatoryUpdate=\{isMandatoryForCurrentClient\}/);
assert.match(versionInfoModal, /isMandatoryRelease \? "必要更新" : "一般更新"/);
assert.match(versionInfoModal, /item\.isMandatoryRelease \? "必要更新" : "一般更新"/);
assert.doesNotMatch(versionHistory, /forceUpdate:/);
assert.match(
  versionHistory,
  /version: "3\.6\.2",[\s\S]*?isMandatoryRelease: true/,
);
assert.match(
  versionHistory,
  /version: "3\.6\.3",[\s\S]*?isMandatoryRelease: false/,
);

const v363Metadata = {
  version: "3.6.3",
  releaseDate: "2026-09-03",
  releaseNotes: ["V3.6.3 一般更新"],
  forceUpdate: false,
  minimumSupportedVersion: "3.6.2",
};
assert.deepEqual(evaluateAppUpdatePolicy("3.6.2", v363Metadata), {
  hasUpdate: true,
  isMandatoryForCurrentClient: false,
});
assert.deepEqual(evaluateAppUpdatePolicy("3.6.1", v363Metadata), {
  hasUpdate: true,
  isMandatoryForCurrentClient: true,
});
assert.deepEqual(evaluateAppUpdatePolicy("3.6.3", v363Metadata), {
  hasUpdate: false,
  isMandatoryForCurrentClient: false,
});

for (const symbol of ["directions_car", "directions_walk", "directions_transit"]) {
  assert.match(materialIcons, new RegExp(`name: "${symbol}"`));
}
assert.match(itinerary, /MaterialTravelModeIcon/);
assert.doesNotMatch(itinerary, /CarFront|Footprints|BusFront|TrainFront/);

assert.match(tripEditor, /確認縮短行程影響/);
assert.match(tripEditor, /最後確認永久刪除/);
assert.match(tripEditor, /繼續確認/);
assert.match(tripEditor, /shrinkConfirmationStep === 1/);
assert.match(tripEditor, /historicalTripEndDate/);
assert.match(app, /isSharedDataManageMode/);
assert.match(app, /onManageModeChange=\{handleSharedDataManageModeChange\}/);

console.log("V3.6.3 前端修正驗證通過。");
