/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.6.5";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.6.4";

export const RELEASE_DATE = "2026-09-08";

export const RELEASE_NOTES = [
  "App 資料就緒後立即結束啟動畫面，功能頁仍在載入時顯示既有載入提示。",
  "初次啟動共用同一份 Trip 雲端快照，減少重複讀取與等待。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.6.4";
