/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.0";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.8.2";

export const RELEASE_DATE = "2026-09-12";

export const RELEASE_NOTES = [
  "搜尋地點時會顯示候選地點照片，協助確認選擇的位置是否正確。",
  "每日行程可從 Wikimedia Commons 挑選景點照片，並保留圖片來源、作者與授權資訊。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.8.2";
