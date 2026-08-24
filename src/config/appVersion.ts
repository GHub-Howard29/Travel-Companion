/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.4.9";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.4.8";

export const RELEASE_DATE = "2026-08-24";

export const RELEASE_NOTES = [
  "修正共同清單首次同步期間勾選狀態可能回彈的問題",
  "歷史行程離線時改用明確的清單唯讀提示",
  "統一 PWA 網頁載入畫面，降低進入操作介面前的跳動",
];

export const FORCE_UPDATE = false;
