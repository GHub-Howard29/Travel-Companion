/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.6.1";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.6.0";

export const RELEASE_DATE = "2026-09-01";

export const RELEASE_NOTES = [
  "修正 Android Chrome 與 PWA 記帳金額欄位超出卡片右側的問題。",
  "修正 PWA 第一次點擊馬上更新時未等待新版下載完成，必須再次點擊的問題。",
];

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.5.6";
