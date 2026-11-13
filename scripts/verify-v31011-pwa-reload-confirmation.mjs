import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasStableActivatedReplacement } from "../src/utils/serviceWorkerUpdatePolicy.ts";

const root = resolve(import.meta.dirname, "..");
const updateHook = readFileSync(resolve(root, "src/hooks/useAppUpdate.ts"), "utf8");
const appVersion = readFileSync(resolve(root, "src/config/appVersion.ts"), "utf8");
const packageMetadata = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const publicMetadata = JSON.parse(readFileSync(resolve(root, "public/app-version.json"), "utf8"));

const versionMatch = appVersion.match(/APP_VERSION = "([^"]+)"/);
assert.ok(versionMatch, "必須設定 APP_VERSION");
const appVersionValue = versionMatch[1];

assert.match(appVersionValue, /^\d+\.\d+\.\d+$/);
assert.equal(packageMetadata.version, appVersionValue);
assert.equal(publicMetadata.version, appVersionValue);
const previousReleaseMatch = appVersion.match(/PREVIOUS_RELEASE_VERSION = "([^"]+)"/);
assert.ok(previousReleaseMatch, "必須設定 PREVIOUS_RELEASE_VERSION");
assert.match(previousReleaseMatch[1], /^\d+\.\d+\.\d+$/);
assert.notEqual(previousReleaseMatch[1], appVersionValue);

assert.match(updateHook, /PENDING_UPDATE_VERSION_KEY/);
assert.match(updateHook, /import \{ hasStableActivatedReplacement \} from "\.\.\/utils\/serviceWorkerUpdatePolicy"/);
assert.match(updateHook, /const waitingWorker = registration\.waiting;/);
assert.match(updateHook, /const expectedWorker = waitingWorker \?\? \(activatedReplacement \? registration\.active : null\)/);
assert.doesNotMatch(updateHook, /registration\.waiting \?\? registration\.installing/);
assert.match(updateHook, /新版尚未進入可接管狀態/);
assert.match(updateHook, /const setPendingUpdateVersion = \(version: string\) => \{/);
assert.match(updateHook, /clearPendingUpdateVersion/);

const previousWorker = { state: "activated" };
const activatedReplacement = { state: "activated" };
assert.equal(
  hasStableActivatedReplacement(
    { active: activatedReplacement, waiting: null, installing: null },
    previousWorker,
  ),
  true,
  "active replacement 在 waiting／installing 清空後才算穩定可 reload",
);
assert.equal(
  hasStableActivatedReplacement(
    { active: activatedReplacement, waiting: null, installing: { state: "installing" } },
    previousWorker,
  ),
  false,
  "仍有 installing worker 時不可提前回報 ready，否則後續可能沒有 waiting worker 可送 SKIP_WAITING",
);
assert.equal(
  hasStableActivatedReplacement(
    { active: activatedReplacement, waiting: { state: "installed" }, installing: null },
    previousWorker,
  ),
  false,
  "仍有 waiting worker 時應走 waiting／SKIP_WAITING 流程，不可當成穩定替代狀態",
);
assert.equal(
  hasStableActivatedReplacement(
    { active: previousWorker, waiting: null, installing: null },
    previousWorker,
  ),
  false,
  "原 controller 仍 active 時不可誤判成 replacement",
);

// A successful handoff records only a pending target before navigation.
// It must not mark the update as seen in the old document.
const updateBody = updateHook.slice(updateHook.indexOf("const update = useCallback"));
const activatedReplacementBranch = updateBody.match(
  /if \(activatedReplacement && navigator\.serviceWorker\.controller === registration\.active\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(activatedReplacementBranch, /reloadOnce\(latestMetadata\.version\)/);
assert.doesNotMatch(activatedReplacementBranch, /setStoredAppVersion\(/);

const controlledBranch = updateBody.match(
  /if \(handoffState === "controlled"\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(controlledBranch, /reloadOnce\(latestMetadata\.version\)/);
assert.doesNotMatch(controlledBranch, /setStoredAppVersion\(/);
assert.doesNotMatch(updateBody, /handoffState === "active"/);

assert.match(updateHook, /controller === expectedWorker/);
assert.match(updateHook, /controller\.state === "activated"/);
assert.match(updateHook, /activeWorker === expectedWorker/);
assert.match(updateHook, /UPDATE_RELOAD_ATTEMPT_KEY/);
assert.match(updateHook, /setReloadAttemptVersion\(targetVersion\)/);
assert.match(updateHook, /window\.location\.reload\(\)/);
assert.match(updateHook, /HANDOFF_TIMEOUT_MS = 15000/);
assert.match(updateHook, /不會自動重複刷新/);

const waitingFlow = updateBody.match(
  /const waitingWorker = registration\.waiting;[\s\S]*?setPendingUpdateVersion\(latestMetadata\.version\)[\s\S]*?if \(waitingWorker\) \{\s*await updateServiceWorker!\(false\);\s*\}/,
)?.[0] ?? "";
assert.ok(waitingFlow, "waiting worker 流程必須在送出單次 SKIP_WAITING 前保存 pending version");

// Only a fresh document running the target bundle can confirm the pending update.
// The confirmation is an explicit startup effect and also runs in browser mode.
assert.match(
  updateHook,
  /const confirmPendingUpdateForCurrentBundle = \(\) => \{[\s\S]*pendingVersion !== APP_VERSION[\s\S]*setStoredAppVersion\(APP_VERSION\)[\s\S]*clearPendingUpdateVersion\(\)/,
);
assert.match(
  updateHook,
  /useEffect\(\(\) => \{\s*confirmPendingUpdateForCurrentBundle\(\);\s*\}, \[\]\)/,
  "新 document 啟動時必須確認 pending version，不依賴 standalone 提示 UI 是否顯示",
);
const confirmationBody = updateHook.match(
  /const confirmPendingUpdateForCurrentBundle = \(\) => \{([\s\S]*?)\n\};/,
)?.[1] ?? "";
assert.match(confirmationBody, /pendingVersion !== APP_VERSION/);
assert.match(confirmationBody, /setStoredAppVersion\(APP_VERSION\)/);
assert.match(confirmationBody, /clearPendingUpdateVersion\(\)/);
assert.doesNotMatch(
  confirmationBody.slice(0, confirmationBody.indexOf("setStoredAppVersion")),
  /clearPendingUpdateVersion\(\)/,
  "不同版本 bundle 不得清除 pending marker",
);

assert.match(updateHook, /window\.location\.reload\(\)/);
assert.match(updateHook, /if \(reloadStartedRef\.current\) return/);

console.log("V3.10.11 PWA 新頁面啟動確認與待套用版本 regression 通過。");
