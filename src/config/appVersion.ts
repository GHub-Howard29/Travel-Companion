/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.4.10";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.4.9";

export const RELEASE_DATE = "2026-08-24";

export const RELEASE_NOTES = [
  "移除 Android 原生啟動畫面後重複出現的網頁層 App 圖示",
  "載入期間保留一致藍底，完成後一次切換至操作介面",
];

export const FORCE_UPDATE = false;
