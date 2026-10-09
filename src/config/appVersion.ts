/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.29";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.28";

export const RELEASE_DATE = "2026-10-10";

export const RELEASE_NOTES = [
  "修正三天行程日期按鈕分界：三天歸入首日／中間日配色規則。",
  "少於三天行程維持全白底；當天或選取日期只增加細紅框，不改變原有底色。",
  "最低支援版本維持 3.9.27，沿用既有 PWA 更新接管與離線同步規則。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = true;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.27";
