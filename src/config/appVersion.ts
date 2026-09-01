/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.6.2";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.6.1";

export const RELEASE_DATE = "2026-09-01";

export const RELEASE_NOTES = [
  "編輯行程並縮短天數時，先逐日列出會永久刪除的行程卡片與路線資訊，確認後才儲存。",
  "依台灣時間在行程結束翌日鎖定歷史共用資料；行程編輯者維持完整查看，僅管理者可繼續修改。",
  "保留歷史行程既有離線唯讀、私人清單與個人資料規則。",
];

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.6.2";
