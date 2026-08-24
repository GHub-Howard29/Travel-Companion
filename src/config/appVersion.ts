/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.4.11";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.4.10";

export const RELEASE_DATE = "2026-08-24";

export const RELEASE_NOTES = [
  "統一 Android 原生啟動畫面、等待畫面與 App 系統資訊列為暖米白色",
  "保留單次原生圖示並降低啟動階段系統列與底圖的色差",
];

export const FORCE_UPDATE = false;
