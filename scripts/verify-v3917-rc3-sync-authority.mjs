import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const checklistHook = read("src/hooks/useChecklistState.ts");
const privateChecklistHook = read("src/hooks/usePrivateChecklistState.ts");
const app = read("src/App.tsx");
const otherInfoSyncStorage = read("src/storage/otherInfoSyncStorage.ts");

assert.doesNotMatch(
  checklistHook,
  /reloadSharedChecklistFromCloud[\s\S]*readPendingSharedChecklistOrder/,
  "共同清單 Realtime reload 不應被舊 pending order 永久擋住",
);
assert.doesNotMatch(
  checklistHook,
  /reloadSharedChecklistFromCloud[\s\S]*readPendingSharedChecklistProgress/,
  "共同清單 Realtime reload 不應被舊 pending progress 永久擋住",
);
assert.doesNotMatch(
  privateChecklistHook,
  /reloadPrivateChecklistFromCloud[\s\S]*readPrivateChecklistPendingRevision/,
  "私人清單 Realtime reload 不應因 pending revision 完全跳過遠端狀態",
);

assert.match(
  otherInfoSyncStorage,
  /itemIds:\s*string\[\]/,
  "Other Info pending state 必須追蹤實際變更項目",
);
assert.match(
  app,
  /markOtherInfoSyncPending\(selectedTripId, changedItemIds\)/,
  "Other Info 儲存時必須只標記實際變更 item IDs",
);
assert.match(
  app,
  /pendingItems\.filter\(\(item\) => !item\.isDeleted\)/,
  "Other Info pending sync 只能 upsert 本次變更的 active rows",
);
assert.match(
  app,
  /pendingItems\.filter\(\(item\) => item\.isDeleted\)\.map\(\(item\) => item\.id\)/,
  "Other Info pending sync 只能 soft-delete 本次變更的 rows",
);
assert.match(
  app,
  /await applyCloudOtherInfoSnapshot\(\)/,
  "Other Info 本機 mutation 完成後必須回讀 authoritative cloud snapshot",
);
assert.match(
  app,
  /if \(readOtherInfoSyncState\(selectedTripId\)\)[\s\S]*syncPendingOtherInfo\(\)[\s\S]*applyCloudOtherInfoSnapshot\(\)/,
  "Other Info Realtime/focus refresh 必須在 pending 完成後套用 cloud snapshot",
);

console.log("V3.9.17 RC3 同步 authoritative refresh 與 pending item scope 契約驗證通過。");
