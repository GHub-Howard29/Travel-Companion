/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.10";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.9";

export const RELEASE_DATE = "2026-09-25";

export const RELEASE_NOTES = [
  "簡化每日行程卡片的照片資訊，只保留照片來源原處連結。",
  "其他資訊捷徑與查看地圖整組靠右，捷徑緊鄰地圖操作。",
  "保留查看地圖定位圖示，移除重複的聯外圖示。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
