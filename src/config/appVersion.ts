/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.3";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.2";

export const RELEASE_DATE = "2026-09-17";

export const RELEASE_NOTES = [
  "新增系統開發者能力驗證與最小化使用紀錄彙總畫面。",
  "補上冷啟動效能量測，並整合 V3.9.1 驗證入口以縮短一般建置流程。",
  "完成 App TypeScript 型別檢查，降低發布前才發現介面錯誤的風險。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = false;
export const MINIMUM_SUPPORTED_VERSION = "3.9.2";
