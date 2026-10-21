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
  /const hasActivatedReplacement = \(\) =>[\s\S]*registration\.active !== previousController[\s\S]*registration\.active\.state === "activated"/,
  "已 active 的新版 worker 必須視為已準備完成，不可等待不存在的 waiting/installing worker",
);

assert.match(
  updateHook,
  /const activatedReplacement =[\s\S]*registration\.active !== previousController[\s\S]*!registration\.waiting[\s\S]*!registration\.installing[\s\S]*setStoredAppVersion\(latestMetadata\.version\)[\s\S]*reloadOnce\(\)/,
  "新版已 active 但舊頁面仍由舊 controller 控制時，必須直接重新載入，不可要求第二次點擊",
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
  /if \(handoffState === "active" && registration\.active\) \{[\s\S]*setStoredAppVersion\(latestMetadata\.version\)[\s\S]*reloadOnce\(\)/,
  "active worker handoff 應直接套用並重新載入，不可要求第二次點擊",
);

const activatedReplacementBlock = updateHook.match(
  /if \(activatedReplacement\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(
  activatedReplacementBlock,
  /setStoredAppVersion\(latestMetadata\.version\)[\s\S]*reloadOnce\(\)/,
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
