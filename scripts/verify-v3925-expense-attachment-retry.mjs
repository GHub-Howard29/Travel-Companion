import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/hooks/useExpenseBook.ts", "utf8");
const screen = readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");
const appVersion = readFileSync("src/config/appVersion.ts", "utf8");

assert.match(
  hook,
  /ATTACHMENT_SYNC_MAX_ATTEMPTS = 5/,
  "照片同步自動重試總嘗試次數必須固定為 5 次",
);

assert.match(
  hook,
  /ATTACHMENT_SYNC_RETRY_DELAY_MS = 3000/,
  "照片同步自動重試間隔必須為 3 秒",
);

assert.match(
  hook,
  /waitForAttachmentRetry[\s\S]*handleOffline = \(\) => finish\(false\)[\s\S]*addEventListener\("offline", handleOffline/,
  "重試等待期間斷網必須可立即中止，不可等滿 3 秒",
);

assert.match(
  hook,
  /if \(!navigator\.onLine\) \{[\s\S]*目前離線，請連線後再同步照片。建議在 Wi-Fi 環境下上傳/,
  "既有完全離線規則與文案必須保留",
);

assert.match(
  hook,
  /let remainingItems = filteredPendingItems[\s\S]*const retryItems:[\s\S]*remainingItems = retryItems/,
  "每輪只應將失敗項目帶入下一輪，不可重傳已成功照片",
);

assert.match(
  hook,
  /attempt < ATTACHMENT_SYNC_MAX_ATTEMPTS[\s\S]*!isNonRetryableAttachmentError\(errorMessage\)/,
  "只有可恢復錯誤且尚未達第 5 次時才能自動重試",
);

assert.match(
  hook,
  /const finalFailedItems = Array\.from\(finalItems\.values\(\)\)[\s\S]*Promise\.allSettled[\s\S]*attachment_status: "upload_failed"/,
  "中間失敗不可與後續成功競態；只在整輪結束後寫入最終失敗狀態",
);

assert.match(
  hook,
  /網路已中斷，已停止照片自動重試。未同步照片會保留在本機；請連線後再次按「同步照片」/,
  "重試期間離線後必須停止並要求使用者重新按同步",
);

assert.match(
  hook,
  /已停止自動重試，失敗項目會保留本機照片；請稍後再次按「同步照片」/,
  "第 5 次仍失敗後必須停止，等待使用者再次手動同步",
);

assert.match(
  screen,
  /同步中 \$\{attachmentSyncAttempt\}\/5/,
  "同步按鈕應顯示目前第幾次嘗試",
);

assert.match(
  appVersion,
  /APP_VERSION = "3\.9\.25"/,
  "V3.9.25 實作必須使用 3.9.25 版本號",
);

console.log("V3.9.25 帳本照片有限自動重試與離線停止 regression 通過。");
