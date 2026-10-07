/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.24";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.23";

export const RELEASE_DATE = "2026-10-07";

export const RELEASE_NOTES = [
  "PWA 啟動與回到前景時會主動檢查新版 Service Worker，不再依賴瀏覽器自行決定檢查時機。",
  "修正新版 Service Worker 已啟用但舊頁面仍由舊版控制時，被誤判為新版尚未下載而反覆要求重試更新。",
  "新版已啟用但尚未接管目前頁面時，會直接進入安全重新載入階段，不再無效等待接管逾時。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
