/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.6.3";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.6.2";

export const RELEASE_DATE = "2026-09-03";

export const RELEASE_NOTES = [
  "修正版本資訊的更新方式，讓必要更新政策不會在完成升級後錯誤改變。",
  "更新開車、步行與大眾運輸圖示，保留原有文字與操作方式。",
  "歷史行程的管理者提醒只在進入管理或編輯旅程時顯示。",
  "縮短行程天數時新增最終確認，避免誤刪每日行程與路線資料。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.6.2";
