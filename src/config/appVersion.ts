/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.5.5";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.5.4";

export const RELEASE_DATE = "2026-08-27";

export const RELEASE_NOTES = [
  "修正刪除目前行程後的預設行程選取，與進入 App 時的規則保持一致。",
  "資訊卡片連結改由系統外部處理，Google Maps 連結優先交由專用 App 開啟。",
  "資訊卡片內容與每日詳細行程說明支援選取局部文字設定顏色。",
];

export const FORCE_UPDATE = false;
