/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.6";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.5";

export const RELEASE_DATE = "2026-10-18";

export const RELEASE_NOTES = [
  "修正複製行程卡片後天氣請求的同步競態與重複請求。",
  "區分天氣更新中的租約狀態，並以單次短暫重試收斂批次天氣更新。",
  "沿用 V3.9 已驗證的 PWA 更新接管方案，3.10.6 才套用本次新版接管流程。",
  "不修改 migration、正式資料或 secrets。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
