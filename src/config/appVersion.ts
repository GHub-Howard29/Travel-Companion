/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.7";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.6";

export const RELEASE_DATE = "2026-09-24";

export const RELEASE_NOTES = [
  "修正從外部連結返回 PWA 時跳回預設 Day 的問題。",
  "每日行程卡片可直接開啟指定的其他資訊子分類。",
  "新增每日行程版本歷程與受控復原工具，降低舊資料覆寫風險。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
