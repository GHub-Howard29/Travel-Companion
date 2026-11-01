/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.12";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.11";

export const RELEASE_DATE = "2026-11-01";

export const RELEASE_NOTES = [
  "每日行程卡片新增雲端重新驗證、離線 pending 保護與逐筆衝突處理。",
  "新增卡片編輯租約，避免不同裝置同時修改同一張卡片。",
  "背景同步不再顯示短暫同步提示，保留手動操作回饋與錯誤訊息。",
  "改善變更摘要更新方式，避免摘要畫面閃動。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
