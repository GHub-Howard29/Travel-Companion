import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const updateHook = readFileSync("src/hooks/useAppUpdate.ts", "utf8");

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
  /const checkForHandoff = \(\) => \{[\s\S]*const state = getState\(\);[\s\S]*if \(state\) finish\(state\)/,
  "handoff 檢查應立即接受 active 狀態，不可固定等待 timeout",
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

console.log("V3.9.24 PWA 主動更新檢查與 active-worker handoff regression 通過.");
