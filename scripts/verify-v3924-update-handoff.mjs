import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const updateHook = readFileSync("src/hooks/useAppUpdate.ts", "utf8");
const appVersion = readFileSync("src/config/appVersion.ts", "utf8");

assert.match(appVersion, /APP_VERSION = "\d+\.\d+\.\d+"/);

assert.match(
  updateHook,
  /onRegisteredSW\(_serviceWorkerUrl, registration\) \{[\s\S]*requestServiceWorkerUpdate\(registration \?\? null, true\)/,
  "PWA 註冊完成後必須主動檢查新版 Service Worker",
);

assert.match(
  updateHook,
  /handleVisibilityChange[\s\S]*document\.visibilityState !== "visible"[\s\S]*requestServiceWorkerUpdate\(\)/,
  "PWA 回到前景時必須主動檢查 Service Worker 更新",
);

assert.match(
  updateHook,
  /lastWorkerUpdateCheckAtRef[\s\S]*< 30000/,
  "前景更新檢查必須節流，避免頻繁請求 sw.js",
);

assert.match(
  updateHook,
  /const hasActivatedReplacement = \(\) =>\s*hasStableActivatedReplacement\(registration, previousController\)/,
  "只有 active 已替代舊 controller 且 waiting／installing 都已清空時，才可視為穩定替代 worker",
);

assert.match(
  updateHook,
  /const activatedReplacement = hasStableActivatedReplacement\([\s\S]*registration,[\s\S]*previousController,[\s\S]*\)[\s\S]*setPendingUpdateVersion\(latestMetadata\.version\)[\s\S]*reloadOnce\(\)/,
  "新版已 active 但舊頁面仍由舊 controller 控制時，必須先記錄待套用版本並直接重新載入",
);

assert.match(
  updateHook,
  /const expectedWorker = registration\.waiting;[\s\S]*if \(!expectedWorker\)[\s\S]*新版尚未進入可接管狀態/,
  "SKIP_WAITING 只能針對確實存在的 waiting worker；installing 不可當成可接管目標",
);

assert.match(
  updateHook,
  /setPendingUpdateVersion\(latestMetadata\.version\)[\s\S]*await updateServiceWorker\(false\)/,
  "發出單次 SKIP_WAITING 前必須保存待套用版本，讓新 document 能在舊頁面 handoff 逾時後確認更新",
);

assert.match(
  updateHook,
  /timeoutMs = 12000/,
  "PWA handoff 應沿用已通過實機驗證的 12 秒狀態判定窗口，不以延長等待掩蓋流程問題",
);

assert.match(
  updateHook,
  /const checkForHandoff = \(\) => \{[\s\S]*const state = getState\(\);[\s\S]*if \(state\) finish\(state\)/,
  "handoff 檢查必須同時監聽 worker 狀態與 controller 狀態",
);

assert.match(
  updateHook,
  /if \(handoffState === "active" && registration\.active\?\.state === "activated"\) \{[\s\S]*reloadOnce\(\)/,
  "active worker handoff 必須確認 activated，再由唯一 reload owner 重新載入",
);

const activatedReplacementBlock = updateHook.match(
  /if \(activatedReplacement\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(
  activatedReplacementBlock,
  /setPendingUpdateVersion\(latestMetadata\.version\)[\s\S]*reloadOnce\(\)/,
  "active replacement 必須由唯一更新流程直接套用並重新載入",
);

assert.doesNotMatch(
  updateHook,
  /workerReadyRef|safeReloadWorkerRef/,
  "更新流程不可保留跨次嘗試的過期 worker ready 狀態",
);

assert.match(
  updateHook,
  /waitForUpdateWorkerReady\([\s\S]*\(\) => Boolean\(registration\.waiting\)/,
  "新版 ready 判斷必須以當次 registration.waiting 為準，不可使用過期全域旗標",
);

console.log("V3.10.7 PWA 主動更新檢查與 active-worker handoff regression 通過.");
