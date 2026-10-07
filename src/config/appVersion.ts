/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.23";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.22";

export const RELEASE_DATE = "2026-10-07";

export const RELEASE_NOTES = [
  "修正帳本拍照或返回前景後，手動選擇的代記帳人被重設為預設值。",
  "修正私人核對清單在 Realtime 同步時可能被舊雲端快照覆蓋，造成勾選或取消勾選復原。",
  "調整帳本金額輸入為手機數字鍵盤文字模式，避免偶發無法輸入四位數以上金額。",
  "修正已載入行程在網路中斷後重新開啟 App 可能卡空白畫面；雲端啟動失敗時改用本機快取行程。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
