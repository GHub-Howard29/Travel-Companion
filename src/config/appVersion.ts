/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.11.1";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.11.0";

export const RELEASE_DATE = "2026-11-13";

export const RELEASE_NOTES = [
  "修正 Android PWA 更新時 Service Worker 接管判定，避免新版已啟用但頁面仍等待接管。",
  "確認新版 Worker 已實際控制目前頁面後才自動重新載入，並於新頁面核對目標版本。",
  "新增 reload 防循環保護；版本確認失敗時停止自動重載，避免反覆更新提示。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
