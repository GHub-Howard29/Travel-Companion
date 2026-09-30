import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync("src/components/OtherInfoCategoryManager.tsx", "utf8");
const page = fs.readFileSync("src/components/OtherInfoPage.tsx", "utf8");
const itinerary = fs.readFileSync("src/components/ItineraryPage.tsx", "utf8");
const viewportUtils = fs.readFileSync("src/utils/viewportUtils.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const tripTypes = fs.readFileSync("src/types/trip.ts", "utf8");
const folderTypes = fs.readFileSync("src/types/folder.ts", "utf8");
const defaults = fs.readFileSync("src/utils/folderDefaults.ts", "utf8");
const repo = fs.readFileSync("src/services/tripRepository.ts", "utf8");

assert.match(folderTypes, /isVisible\?: boolean/);
assert.match(tripTypes, /otherInfoFolders\?: Folder\[\]/);
assert.match(defaults, /other-info-attractions/);
assert.match(defaults, /other-info-visa/);
assert.match(defaults, /other-info-other/);

assert.match(manager, /EyeOff/);
assert.match(manager, /Eye/);
assert.match(manager, /"已隱藏"/);
assert.match(manager, /"已顯示"/);
assert.match(manager, /1000/);
assert.match(manager, /index \+= 3/);
assert.match(manager, /titleLength\(a\.title\) - titleLength\(b\.title\)/);
assert.match(manager, /aria-expanded=\{isRulesOpen\}/);
assert.match(manager, /自動排列規則/);
assert.match(manager, /恢復預設/);
assert.match(manager, /自訂分類與既有資料都會保留/);
assert.match(manager, /onCancel/);
assert.match(manager, /await onSave\(normalizeOrders\(draftFolders\)\)/);
assert.match(manager, /applyDraft/);
assert.match(manager, /新增子類別/);
assert.match(manager, /createFolder/);
assert.match(manager, /applyDraft\(\[\.\.\.draftFolders, folder\], "已新增"\)/);
assert.match(manager, /新增、改名、排序或隱藏子類別。/);
assert.match(manager, /restoredFolderIds/);
assert.match(manager, /setRestoredFolderIds\(new Set\(changedIds\)\)/);
assert.match(manager, /text-rose-600/);
assert.match(manager, /changedIds\.length > 0 \? "已恢復預設" : "目前已是預設"/);
assert.doesNotMatch(manager, /設定只影響目前行程/);

assert.match(page, /"其他資訊管理"/);
assert.doesNotMatch(page, />管理子類別</);
assert.match(page, /visibleFolderRows/);
assert.match(page, /folder\.isVisible !== false/);
assert.match(page, /OtherInfoCategoryManager/);
assert.match(page, />\s*新增\s*</);
assert.match(page, />\s*排列\s*</);
assert.match(page, /!isCategoryManagerOpen/);
assert.match(page, /!isFormOpen/);
assert.match(page, /scrollManagePanelToTop/);
assert.match(page, /revealElementTopWhenViewportStable\(panel, 8\)/);
assert.match(page, /openEditForm\(item\);\s*scrollManagePanelToTop\(\);/s);
assert.match(page, /bg-stone-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-stone-700/);

assert.match(itinerary, /revealElementTopWhenViewportStable\(editingCard, 8\)/);
assert.match(viewportUtils, /export const revealElementTopWhenViewportStable/);
assert.match(viewportUtils, /window\.visualViewport/);
assert.match(viewportUtils, /previousOffsetTop/);
assert.match(viewportUtils, /targetTop - viewportOffset - topGap/);

assert.match(app, /otherInfoFolders: folders/);
assert.match(app, /folder\.isVisible !== false/);
assert.match(app, /onSaveFolders=\{handleSaveOtherInfoFolders\}/);
assert.match(app, /!didSave && navigator\.onLine/);

assert.match(repo, /normalizeOtherInfoFolders/);
assert.match(repo, /createDefaultFoldersForTrip\(id\)/);
assert.match(repo, /otherInfoFolders: normalizeOtherInfoFolders/);

console.log("V3.9.20 其他資訊自訂子類別、顯示隱藏與自動排列契約驗證通過。");
