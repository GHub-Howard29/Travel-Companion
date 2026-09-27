/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.16";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.15";

export const RELEASE_DATE = "2026-09-27";

export const RELEASE_NOTES = [
  "一般 USER 首次進入個人帳本模式時要求設定本機帳本代號，之後同裝置同 Email 自動沿用。",
  "新增 USER 專用的個人帳本代號修改入口；代號只存在本機，不影響旅程共用記帳代號設定。",
  "行程載入後背景預載目前卡片已選用照片，讓未逐張開啟的照片也可在離線時顯示。",
  "修正離線或遠端檢查失敗時誤報「行程資料已有更新」；恢復連線後才重新確認遠端 revision。",
  "個人帳本取消每筆記帳後的阻斷式提示，改為帳本頁常駐顯示本機保存與備份提醒。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
