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

assert.equal(appVersionValue, "3.10.11");
assert.equal(packageMetadata.version, appVersionValue);
assert.equal(publicMetadata.version, appVersionValue);
assert.match(appVersion, /PREVIOUS_RELEASE_VERSION = "3\.10\.10"/);

assert.match(updateHook, /PENDING_UPDATE_VERSION_KEY/);
assert.match(updateHook, /import \{ hasStableActivatedReplacement \} from "\.\.\/utils\/serviceWorkerUpdatePolicy"/);
assert.match(updateHook, /const expectedWorker = registration\.waiting;/);
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
  /if \(activatedReplacement\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(activatedReplacementBranch, /setPendingUpdateVersion\(latestMetadata\.version\)/);
assert.match(activatedReplacementBranch, /reloadOnce\(\)/);
assert.doesNotMatch(activatedReplacementBranch, /setStoredAppVersion\(/);

const controlledBranch = updateBody.match(
  /if \(handoffState === "controlled"\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(controlledBranch, /reloadOnce\(\)/);
assert.doesNotMatch(controlledBranch, /setPendingUpdateVersion\(/);
assert.doesNotMatch(controlledBranch, /setStoredAppVersion\(/);

const activeBranch = updateBody.match(
  /(if \(handoffState === "active"[^\{]*\{)([\s\S]*?)\n      \}/,
);
assert.ok(activeBranch, "必須保留 active handoff 成功分支");
assert.match(activeBranch[1], /registration\.active\?\.state === "activated"/);
assert.doesNotMatch(activeBranch[2], /setPendingUpdateVersion\(/);
assert.match(activeBranch[2], /reloadOnce\(\)/);
assert.doesNotMatch(activeBranch[2], /setStoredAppVersion\(/);

const waitingFlow = updateBody.match(
  /const handoffPromise = waitForServiceWorkerHandoff\([\s\S]*?setPendingUpdateVersion\(latestMetadata\.version\)[\s\S]*?await updateServiceWorker\(false\)/,
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
