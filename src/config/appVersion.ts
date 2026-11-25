/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.11.6";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.11.5";

export const RELEASE_DATE = "2026-11-25";

export const RELEASE_NOTES = [
  "修正登入身份切換後旅程清單未即時 reconciliation 的問題，並隔離舊身份的非同步結果。",
  "修正登出期間 Workspace Loading、編輯 Lease heartbeat 與舊帳本識別的生命週期清理。",
  "保護已送出的保存及雲端待同步資料，避免身份切換或登出不當中斷。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
