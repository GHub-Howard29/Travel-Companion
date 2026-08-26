/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.5.3";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.5.1";

export const RELEASE_DATE = "2026-08-26";

export const RELEASE_NOTES = [
  "正式版加入內容安全政策與 no-referrer，限制瀏覽器載入與連線來源。",
  "強化 Google OAuth 等待畫面、外部網址與新視窗的安全處理。",
  "保留附件、PWA、Excel 匯出、分享與既有權限／同步資料流相容性。",
];

export const FORCE_UPDATE = false;
