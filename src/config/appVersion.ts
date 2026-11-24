/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.11.5";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.11.4";

export const RELEASE_DATE = "2026-11-24";

export const RELEASE_NOTES = [
  "修正每日行程卡片編輯與保存的跨裝置競態，統一使用 Trip 層級編輯租約保護。",
  "改善卡片管理與行程編輯的保存協調及狀態更新可靠性。",
  "移除不再使用的行程變更預覽／Journal 流程，簡化相關提示與同步狀態處理。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
