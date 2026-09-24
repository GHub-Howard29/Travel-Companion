/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.9";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.8";

export const RELEASE_DATE = "2026-09-24";

export const RELEASE_NOTES = [
  "修正升級 V3.9.8 後，部分既有快取仍可能誤判其他裝置更新而無法儲存卡片。",
  "只有在行程本體與雲端一致時才自動校正版本並重試，真正的跨裝置修改仍會阻擋。",
  "新增舊版 Trip 時間戳自癒與跨裝置衝突保護回歸。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
