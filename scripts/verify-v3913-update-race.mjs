import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const updateHook = readFileSync(resolve(root, "src/hooks/useAppUpdate.ts"), "utf8");
const updatePrompt = readFileSync(resolve(root, "src/components/UpdatePrompt.tsx"), "utf8");
const revisionNotice = readFileSync(resolve(root, "src/components/TripDataRevisionNotice.tsx"), "utf8");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");

for (const phase of [
  "checking-metadata",
  "downloading",
  "waiting-control",
  "ready-to-reload",
]) {
  assert.match(updateHook, new RegExp(phase));
}

assert.match(updateHook, /新版尚未下載完成，請稍後再試；這不代表目前網路一定異常。/);
assert.match(updateHook, /新版已準備完成，但尚未接管目前頁面。請重新載入以套用新版。/);
assert.match(updateHook, /navigator\.onLine\s*\?\s*"更新處理發生錯誤/);
assert.match(updatePrompt, /正在下載新版…/);
assert.match(updatePrompt, /等待新版接管…/);
assert.match(updatePrompt, /重新載入套用新版/);
assert.match(app, /kind=\{isUpdateInProgress \? null : tripDataNoticeKind\}/);
assert.match(app, /willApplyPreparedUpdate=\{hasPreparedUpdate && updateAvailable\}/);
assert.match(revisionNotice, /重新載入並套用新版/);
assert.match(revisionNotice, /重新載入會同時套用新版並取得最新行程資料/);

console.log("V3.9.13 PWA 更新與遠端行程修訂競態靜態契約驗證通過。");
