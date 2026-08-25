/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.5.0";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.4.11";

export const RELEASE_DATE = "2026-08-25";

export const RELEASE_NOTES = [
  "完成其他資訊敏感資料卡片的角色限制與 Supabase RLS 保護",
  "修正其他資訊同步失敗，並新增手動重新同步按鈕",
  "限制 trip_editor 修改參與者／登入 Email 及刪除整個旅程的權限",
  "補強 Android／Chrome PWA 更新與資料同步驗證流程",
  "修正 PWA 更新接管時序，避免重複點擊與更新後空白頁",
];

export const FORCE_UPDATE = true;
