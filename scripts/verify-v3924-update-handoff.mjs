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
  /const activatedReplacement =[\s\S]*registration\.active !== previousController[\s\S]*!registration\.waiting[\s\S]*!registration\.installing[\s\S]*setUpdatePhase\("ready-to-reload"\)/,
  "新版已 active 但舊頁面仍由舊 controller 控制時，必須直接進入安全重新載入階段",
);

assert.match(
  updateHook,
  /const checkForHandoff = \(\) => \{[\s\S]*const state = getState\(\);[\s\S]*if \(state\) finish\(state\)/,
  "handoff 檢查應立即接受 active 狀態，不可固定等待 timeout",
);

const readyToReloadIndex = updateHook.indexOf(
  'if (hasPreparedUpdate && updatePhase === "ready-to-reload")',
);
const beforeUpdateIndex = updateHook.indexOf("if (beforeUpdate)");
assert.ok(
  readyToReloadIndex >= 0 &&
    beforeUpdateIndex >= 0 &&
    readyToReloadIndex < beforeUpdateIndex,
  "第二次按下「重新載入套用新版」應直接 reload，不可再次執行資料 preflight",
);

console.log("V3.9.24 PWA 主動更新檢查與 active-worker handoff regression 通過.");
