/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.11.0";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.12";

export const RELEASE_DATE = "2026-11-13";

export const RELEASE_NOTES = [
  "新增 TRIP 時可直接匯入標準 Excel 範本，建立 TRIP 基本資料與每日行程卡片。",
  "提供固定 V1 範本、欄位驗證與匯入預覽，並由系統推導旅程天數。",
  "Excel 建立僅限 Super Admin；透過雲端整批交易、request 冪等與結果核對保護資料完整性。",
  "結果不明時保留原 request，30 秒後自動查詢一次；無法確認時才由使用者決定是否重新匯入。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
