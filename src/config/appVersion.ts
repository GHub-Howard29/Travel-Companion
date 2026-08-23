/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.4.7";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.4.6";

export const RELEASE_DATE = "2026-08-23";

export const RELEASE_NOTES = [
  "修正 V3.4.6 發布後 App 與網頁仍顯示 V3.4.5 的問題",
];

export const FORCE_UPDATE = false;
