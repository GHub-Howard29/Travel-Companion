/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.11.8";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.11.7";

export const RELEASE_DATE = "2026-11-27";

export const RELEASE_NOTES = [
  "其他資訊交通卡片可同步顯示於自駕須知，並支援兩個頁面獨立排序。",
  "修正 Other Info 本機／雲端同步狀態提示，保留失敗後的重新同步入口。",
  "修正路徑估算併發請求，使用 keyed reservation 避免相同 cache key 重複呼叫上游 API。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
