/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.6.4";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.6.3";

export const RELEASE_DATE = "2026-09-04";

export const RELEASE_NOTES = [
  "歷史行程編輯者若同時是記帳參與者，改以完整唯讀模式顯示且不再重複提示鎖定。",
  "新增跨裝置行程與編輯權變動提醒，稍後處理時只暫停行程主資料編輯。",
  "行程儲存加入版本衝突保護，避免較舊畫面覆蓋其他裝置的新資料。",
  "釐清記帳代號與可編輯者 Google Email 的用途，避免誤解授權範圍。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = true;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.6.4";
