import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260927193000_v3917_rc2_sync_boundaries.sql",
  "utf8",
);
const sharedService = fs.readFileSync(
  "src/services/sharedChecklistCloudService.ts",
  "utf8",
);
const sharedPage = fs.readFileSync("src/components/ChecklistPage.tsx", "utf8");
const sharedHook = fs.readFileSync("src/hooks/useChecklistState.ts", "utf8");
const privateHook = fs.readFileSync(
  "src/hooks/usePrivateChecklistState.ts",
  "utf8",
);
const privateService = fs.readFileSync(
  "src/services/privateChecklistCloudService.ts",
  "utf8",
);
const tripRepository = fs.readFileSync("src/services/tripRepository.ts", "utf8");
const tripWorkspace = fs.readFileSync("src/hooks/useTripWorkspace.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");

assert.match(
  migration,
  /alter table public\.checklist_items[\s\S]*add column if not exists category text null/,
);
assert.match(
  migration,
  /update public\.checklist_items as checklist_item[\s\S]*trip\.content -> 'checklistData'[\s\S]*checklist\.scope = 'shared'/,
);
assert.match(migration, /drop function if exists private\.tc_record_checklist_summary\(\)/);
assert.match(migration, /drop function if exists private\.tc_record_expense_summary\(\)/);

assert.match(
  sharedService,
  /select\("id, client_item_id, category, label, is_checked, sort_order, created_at, updated_at"\)/,
);
assert.match(sharedService, /category: item\.category/);
assert.match(sharedService, /category: item\.category \?\? seedItem\?\.category/);

assert.match(sharedPage, /const NEW_CATEGORY_VALUE = "__new_category__"/);
assert.match(sharedPage, /<select[\s\S]*aria-label="共同檢查清單分類"/);
assert.match(sharedPage, /新增分類…/);
assert.match(sharedPage, /placeholder="輸入新分類名稱"/);
assert.doesNotMatch(sharedPage, /<datalist/);
assert.match(sharedPage, /setCloudChecklistData\([\s\S]*items\.map/);
assert.match(
  sharedHook,
  /canSyncToCloud && pendingProgress[\s\S]*cloudChecklist\.items\.map/,
);
assert.doesNotMatch(
  sharedHook,
  /canSyncToCloud\s*\?\s*await syncCloudSharedChecklistSeedItems\([\s\S]*seedItems/,
);

assert.match(privateService, /export const getCloudPrivateChecklistId/);
assert.match(privateHook, /travel-companion-private-checklist-items-/);
assert.match(privateHook, /table: "checklist_items"/);
assert.match(
  privateHook,
  /scheduleRealtimeRefresh[\s\S]*syncLatestChecklist\(\)/,
);
assert.doesNotMatch(privateHook, /reloadPrivateChecklistFromCloud/);

assert.match(
  tripRepository,
  /if \(cloudOtherInfoItems !== null\)[\s\S]*mergeOtherInfoItems\(cloudOtherInfoItems\)/,
);
assert.match(
  tripRepository,
  /soft[\s\S]*deletes disappear on other devices/,
);

const setCurrentTripIndex = tripWorkspace.indexOf("setCurrentTrip(record.detail);");
const cleanupIndex = tripWorkspace.indexOf("void scheduleItineraryCoverDeletion(");
assert.ok(setCurrentTripIndex >= 0 && cleanupIndex > setCurrentTripIndex);
assert.match(tripWorkspace, /scheduleItineraryCoverDeletion\([\s\S]*\)\.catch/);

assert.match(app, /table: "other_info_items"/);
assert.match(app, /applyCloudOtherInfoSnapshot/);

console.log(
  "V3.9.17 RC2 獨立同步邊界、跨裝置清單、Other Info 刪除與手機分類 UI 契約驗證通過。",
);
