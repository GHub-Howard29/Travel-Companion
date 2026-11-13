import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const updateHook = readFileSync(resolve(root, "src/hooks/useAppUpdate.ts"), "utf8");
const updatePrompt = readFileSync(resolve(root, "src/components/UpdatePrompt.tsx"), "utf8");
const revisionNotice = readFileSync(resolve(root, "src/components/TripDataRevisionNotice.tsx"), "utf8");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const appVersion = readFileSync(resolve(root, "src/config/appVersion.ts"), "utf8");

assert.match(appVersion, /APP_VERSION = "\d+\.\d+\.\d+"/);

for (const phase of [
  "syncing-data",
  "checking-metadata",
  "downloading",
  "waiting-control",
]) {
  assert.match(updateHook, new RegExp(phase));
}

assert.match(updateHook, /新版尚未下載完成，請確認網路連線後再試；目前版本仍可繼續使用。/);
assert.match(updateHook, /waitForServiceWorkerHandoff/);
assert.match(updateHook, /controller === expectedWorker/);
assert.match(updateHook, /activeWorker === expectedWorker/);
assert.match(updateHook, /await updateServiceWorker!\(false\)/);
assert.doesNotMatch(updateHook, /await updateServiceWorker\(true\)/);
assert.match(
  updateHook,
  /activatedReplacement && navigator\.serviceWorker\.controller === registration\.active[\s\S]*reloadOnce\(latestMetadata\.version\)/,
);
assert.match(
  updateHook,
  /if \(handoffState === "controlled"\) \{[\s\S]*reloadOnce\(latestMetadata\.version\)/,
);
assert.doesNotMatch(updateHook, /handoffState === "active"/);
assert.match(updateHook, /HANDOFF_TIMEOUT_MS = 15000/);
assert.match(updateHook, /UPDATE_RELOAD_ATTEMPT_KEY/);
assert.doesNotMatch(updateHook, /ready-to-reload/);
assert.match(updateHook, /navigator\.onLine\s*\?\s*"更新處理發生錯誤/);
assert.match(updatePrompt, /正在同步行程資料…/);
assert.match(updatePrompt, /正在下載新版…/);
assert.match(updatePrompt, /正在切換新版…/);
assert.doesNotMatch(updatePrompt, /ready-to-reload/);
assert.match(updateHook, /await beforeUpdate\(\)/);
assert.match(updateHook, /行程資料同步尚未完成/);
assert.doesNotMatch(
  updateHook,
  /onNeedReload:\s*\(\)\s*=>\s*\{[^}]*reloadOnce\(/s,
);
assert.match(app, /await reconcileTripWorkspace\(\)/);
assert.match(app, /await reloadCurrentTrip\(\)/);
assert.match(app, /kind=\{updateAvailable \? null : tripDataNoticeKind\}/);
assert.match(app, /<TripDataRevisionNotice[\s\S]*kind=\{updateAvailable \? null : tripDataNoticeKind\}/);
assert.match(revisionNotice, /重新載入以套用最新權限/);
assert.match(revisionNotice, /確認衝突並重新載入/);
assert.match(revisionNotice, /行程資料已在其他裝置更新/);

console.log("V3.9.13 PWA 更新與遠端行程修訂競態靜態契約驗證通過。");
