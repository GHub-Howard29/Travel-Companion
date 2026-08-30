/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.6.0";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.5.6";

export const RELEASE_DATE = "2026-08-30";

export const RELEASE_NOTES = [
  "新增相鄰地點交通資訊，依預設交通方式自動顯示預估時間與距離。",
  "輸入地點後可直接確認正確位置，讓路線估算更穩定。",
  "管理模式支援直接在行程卡片內編輯，儲存失敗時會自動定位需要修正的欄位。",
  "分開 Google Maps 路線與修改交通方式操作，使用流程更清楚。",
];

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.5.6";
