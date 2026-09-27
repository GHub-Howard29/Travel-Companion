/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.17";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.16";

export const RELEASE_DATE = "2026-09-27";

export const RELEASE_NOTES = [
  "遠端行程資料有更新時新增「預覽變更」，可先查看自上次載入後的變更分類與數量。",
  "變更摘要只顯示每日行程、照片附件、旅費帳本、核對清單與其他設定的新增／修改／刪除數量，不顯示內容細節。",
  "新增最小化 Change Journal，只保存分類、動作、數量、來源 client 與 revision，供重新載入前核對。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
