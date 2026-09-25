/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.12";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.11";

export const RELEASE_DATE = "2026-09-25";

export const RELEASE_NOTES = [
  "新增管理者明確觸發的 AI 中／英／日候選搜尋詞流程，候選詞必須人工採用後才會搜尋照片。",
  "撤回固定自動多語別名擴充，恢復 V3.9.1 原有搜尋邊界與 Commons 排序契約。",
  "修正精準搜尋檢查上限在候選組裝前誤終止的問題。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
