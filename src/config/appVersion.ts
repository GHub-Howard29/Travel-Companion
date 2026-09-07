/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.7.0";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.6.5";

export const RELEASE_DATE = "2026-09-08";

export const RELEASE_NOTES = [
  "Day 行程管理新增一次性的時間調整模式，可從指定活動重新計算當日後續時間。",
  "後續到達時間會依已確認路線進位到 30 分鐘刻度並保留原停留時間，預覽確認後才整批套用。",
  "Day 標題顯示依出發日期推算的本地日曆日期，方便辨識目前行程日。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.6.4";
