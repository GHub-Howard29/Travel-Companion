/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.15";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.14";

export const RELEASE_DATE = "2026-09-27";

export const RELEASE_NOTES = [
  "修正多人共用帳本 Supabase Realtime 即時同步，保留 30 秒輪詢備援。",
  "修正個人帳本文案，只有共用帳本可代其他成員記帳時才顯示提示。",
  "改善手機照片裁切二次畫面比例與操作焦點，並鎖定背景頁面捲動。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
