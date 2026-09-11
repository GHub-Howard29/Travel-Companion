/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.8.1";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.8.0";

export const RELEASE_DATE = "2026-09-11";

export const RELEASE_NOTES = [
  "強化旅程刪除與跨裝置同步：旅程刪除後會在其他裝置同步移除，不會再次復活。",
  "新增穩定的旅程識別，支援相同日期建立多趟旅程，並保護系統保留旅程避免誤刪。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = true;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.8.1";
