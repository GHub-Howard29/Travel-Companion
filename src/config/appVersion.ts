/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.5.6";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.5.5";

export const RELEASE_DATE = "2026-08-28";

export const RELEASE_NOTES = [
  "新增最低支援版本政策，必要更新不再受裝置模式或稍後更新狀態影響。",
  "將資訊卡片內容與行程說明的文字選色工具列移到輸入框下方。",
  "支援全形冒號時間、統一儲存格式，並阻擋無效時間進入行程排序。",
];

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.5.6";
