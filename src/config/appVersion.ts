/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.3";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.1";

export const RELEASE_DATE = "2026-10-18";

export const RELEASE_NOTES = [
  "修正 PWA 新版 worker 已 active 但尚未由新版 controller 接管時的誤重載與重試更新循環。",
  "天氣更新補上不含敏感資料的診斷碼與 trace ID，區分正式鏈路的授權、座標、上游、租約與快取階段。",
  "補強正式環境驗證規則：本機成功不視為正式單卡成功，並保留既有快取、權限與背景更新規則。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
