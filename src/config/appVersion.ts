/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.2";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.1";

export const RELEASE_DATE = "2026-10-18";

export const RELEASE_NOTES = [
  "修正天氣更新失敗時只顯示泛化訊息，補上可追蹤的安全診斷碼。",
  "改善天氣前端批次回應與逾時處理，避免部分卡片卡在等候狀態。",
  "保留既有快取、權限與背景更新規則。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
