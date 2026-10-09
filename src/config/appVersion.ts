/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.27";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.26";

export const RELEASE_DATE = "2026-10-09";

export const RELEASE_NOTES = [
  "修正 PWA 更新接管在新版 worker 已 active 時仍等待逾時並誤報更新失敗的問題。",
  "共同清單退出管理時統一等待排序同步完成，避免切換頁面或行程時背景同步尚未完成。",
  "沿用 V3.9.26 的行程公開權限、離線同步與附件簽名網址 1 小時有效期規則。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = true;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
