/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.8";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.7";

export const RELEASE_DATE = "2026-10-21";

export const RELEASE_NOTES = [
  "依天氣文案定稿收合無預報狀態，並統一離線、更新等待與異常提示。",
  "有可顯示預報時才呈現 Open-Meteo 來源、CC BY 4.0 授權及資料修改說明。",
  "最後更新時間改依預報目的地時區顯示，並附上時區名稱。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
