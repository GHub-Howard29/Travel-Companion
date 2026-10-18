/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.10.7";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.10.6";

export const RELEASE_DATE = "2026-10-18";

export const RELEASE_NOTES = [
  "加入 DEV 非 loopback Supabase 連線硬阻擋，避免測試帳號誤觸正式資料庫。",
  "保存 Open-Meteo 實際查詢來源網址，舊快取缺欄位時提供安全 fallback。",
  "修正天氣 lease 回寫結果判斷、過期租約清理與來源選單窄螢幕溢位。",
  "整理 Supabase Advisor 安全提醒，列入後續安全掃描與權限審查。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
