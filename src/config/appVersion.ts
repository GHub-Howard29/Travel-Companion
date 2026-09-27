/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.17";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.16";

export const RELEASE_DATE = "2026-09-27";

export const RELEASE_NOTES = [
  "新增「預覽變更」，更新行程前可先查看行程與照片的變更摘要。",
  "改善共同清單、私人清單與其他資訊的跨裝置同步。",
  "改善手機操作與資料同步穩定性。",
  "本次更新包含同步機制改善，請更新後繼續使用。已儲存的資料不會被清除。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = true;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
