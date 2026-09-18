/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.5";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.3";

export const RELEASE_DATE = "2026-09-18";

export const RELEASE_NOTES = [
  "改善 Commons 搜尋續頁與候選累積，並提供一層相關分類的延伸候選。",
  "每日行程照片新增拍照與自行上傳，可在 100%～250% 間調整並以同圖模糊背景補足卡片。",
  "航班卡片不再規劃下一站地面交通；每日到達與離開時間可直接輸入四碼或全形數字。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
