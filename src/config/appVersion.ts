/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.21";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.20";

export const RELEASE_DATE = "2026-10-01";

export const RELEASE_NOTES = [
  "修正 Android PWA 更新後重新載入可能出現白畫面的問題。",
  "更新流程改為等待新版 Service Worker 完成啟用／接管確認後才允許重新載入，避免重複觸發更新。",
  "改善更新中的按鈕狀態，降低使用者誤以為更新中斷而重複點擊的情況。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
