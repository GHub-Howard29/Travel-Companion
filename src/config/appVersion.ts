/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.5.4";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.5.3";

export const RELEASE_DATE = "2026-08-26";

export const RELEASE_NOTES = [
  "新增 Super Admin 固定顯示名稱，建立旅程時只預帶 Howard 與 Carol。",
  "統一新 Trip ID 規則，並阻擋本機、雲端及併發造成的重複 Trip。",
  "新增旅程必須保持連線；既有旅程的 ID、編輯與離線使用方式維持不變。",
];

export const FORCE_UPDATE = false;
