/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.11.7";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.11.6";

export const RELEASE_DATE = "2026-11-26";

export const RELEASE_NOTES = [
  "新增行程卡片時間區段天氣預報，依已儲存的到達與離開時間計算單一區段摘要。",
  "新增獨立 Interval 天氣快取與 Lease，依目的地時區及夏令時間計算預報區段。",
  "修正 Open-Meteo 小時預報請求參數，避免明確 UTC 時間窗與相對預報範圍衝突。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
