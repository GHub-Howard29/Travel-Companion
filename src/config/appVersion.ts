/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.20";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.19";

export const RELEASE_DATE = "2026-09-30";

export const RELEASE_NOTES = [
  "其他資訊新增自訂子類別管理，可新增、改名、排序、顯示／隱藏、自動排列與恢復預設，既有資料會保留。",
  "改善每日行程與其他資訊編輯時的畫面聚焦，手機會等待可視視窗穩定後再將編輯框對齊上緣。",
  "統一取消按鈕與其他資訊管理操作樣式，並加強排列草稿、恢復預設與變更提示。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
