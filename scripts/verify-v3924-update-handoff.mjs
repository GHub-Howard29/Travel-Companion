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
  /const activatedReplacement = hasStableActivatedReplacement\([\s\S]*registration,[\s\S]*previousController,[\s\S]*\)[\s\S]*activatedReplacement && navigator\.serviceWorker\.controller === registration\.active[\s\S]*reloadOnce\(latestMetadata\.version\)/,
  "只有 replacement worker 已穩定且已控制目前頁面時，才可直接重新載入",
);

assert.match(
  updateHook,
  /const waitingWorker = registration\.waiting;[\s\S]*const expectedWorker = waitingWorker \?\? \(activatedReplacement \? registration\.active : null\)[\s\S]*if \(!expectedWorker\)/,
  "SKIP_WAITING 僅針對 waiting worker；已 active 的 replacement 則只等待 clientsClaim 接管",
);
assert.match(
  updateHook,
  /if \(waitingWorker\) \{[\s\S]*recordUpdateDiagnostic\("skip-waiting-requested"[\s\S]*updateServiceWorker!\(false\)[\s\S]*\}/,
  "只有本次捕捉到 waiting worker 時才送出單次 SKIP_WAITING，並留下診斷紀錄",
);

assert.match(
  updateHook,
  /setPendingUpdateVersion\(latestMetadata\.version\)[\s\S]*if \(waitingWorker\) \{[\s\S]*updateServiceWorker!\(false\)/,
  "發出單次 SKIP_WAITING 前必須保存待套用版本，讓新 document 能核對目標版本",
);

assert.match(
  updateHook,
  /HANDOFF_TIMEOUT_MS = 15000/,
  "PWA handoff 採固定 15 秒上限，逾時後停止自動刷新並顯示復原方式",
);

assert.match(
  updateHook,
  /const checkForHandoff = \(\) => \{[\s\S]*const state = getState\(\);[\s\S]*if \(state\) finish\(state\)/,
  "handoff 檢查必須同時監聽 worker 狀態與 controller 狀態",
);

assert.match(
  updateHook,
  /if \(handoffState === "controlled"\) \{[\s\S]*reloadOnce\(latestMetadata\.version\)/,
  "只有新 Worker 已控制目前頁面時，才由唯一 reload owner 重新載入",
);
assert.doesNotMatch(
  updateHook,
  /handoffState === "active"/,
  "Worker 僅進入 active 但尚未控制目前頁面時，不可觸發刷新",
);

const activatedReplacementBlock = updateHook.match(
  /if \(activatedReplacement && navigator\.serviceWorker\.controller === registration\.active\) \{([\s\S]*?)\n      \}/,
)?.[1] ?? "";
assert.match(
  activatedReplacementBlock,
  /reloadOnce\(latestMetadata\.version\)/,
  "replacement 已控制目前頁面時，必須由唯一更新流程重新載入",
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
assert.match(updateHook, /UPDATE_DIAGNOSTICS_KEY[\s\S]*MAX_UPDATE_DIAGNOSTICS = 20[\s\S]*recordWorkerSnapshot/,
  "更新診斷必須限制本機保存筆數並記錄 Worker 快照");
assert.match(updateHook, /controllerchange[\s\S]*expected-worker-statechange[\s\S]*handoff-result/,
  "更新診斷必須保留 controller 與 Worker 生命週期事件及最終結果");
assert.match(updateHook, /MANUAL_RECOVERY_ATTEMPT_KEY[\s\S]*recoveryCount >= 1[\s\S]*manual-recovery-start/,
  "手動恢復必須有單次重試上限並留下診斷紀錄");

const updatePrompt = readFileSync("src/components/UpdatePrompt.tsx", "utf8");
assert.match(updatePrompt, /onRestart[\s\S]*重新啟動 App/,
  "更新失敗時必須提供獨立的重新啟動 App 恢復按鈕");
assert.match(updatePrompt, /onCopyDiagnostics[\s\S]*複製診斷資訊/,
  "更新失敗時必須能複製本機診斷紀錄供後續分析");

console.log("V3.10.7 PWA 主動更新檢查與 active-worker handoff regression 通過.");
