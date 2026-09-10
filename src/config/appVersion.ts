/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.8.0";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.7.4";

export const RELEASE_DATE = "2026-09-10";

export const RELEASE_NOTES = [
  "每日行程新增拖曳、鍵盤及上下按鈕排序，儲存後可接著調整行程時間。",
  "行程卡片可一次複製到同一旅程的多個其他 Day。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = true;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.8.0";
