/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.9";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.8";

export const RELEASE_DATE = "2026-10-21";

export const RELEASE_NOTES = [
  "修正目的地日期／到達時間已過，但快取未滿 24 小時時的歷史天氣提示。",
  "已停止更新的歷史快取仍保留天氣值，並持續顯示 W09 歷史資料文案。",
  "統一天氣快取合併與重新載入後的停止更新狀態。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
