/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.1";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.0";

export const RELEASE_DATE = "2026-09-17";

export const RELEASE_NOTES = [
  "跨日複製行程可直接輸入四碼時間，例如 0930 會自動整理為 09:30。",
  "Commons 選圖加入實體範圍辨識與同名地點選擇，讓候選照片更貼近指定景點。",
  "選取候選照片前可確認、裁切並放大檢視，所有結果仍由管理者人工採用。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.8.2";
