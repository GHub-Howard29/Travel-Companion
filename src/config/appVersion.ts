/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.25";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.24";

export const RELEASE_DATE = "2026-10-08";

export const RELEASE_NOTES = [
  "共用帳本照片同步在線上暫時失敗時，每隔 3 秒自動重試，最多共嘗試 5 次。",
  "自動重試只處理仍失敗的照片；已成功照片不重傳，第 5 次仍失敗後停止並等待使用者再次按同步。",
  "維持既有離線規則：離線不啟動照片同步；重試期間斷線會立即停止，恢復連線後不會自行續傳。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
