/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.5.1";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.5.0";

export const RELEASE_DATE = "2026-08-26";

export const RELEASE_NOTES = [
  "強化帳本附件的私有儲存空間、Trip 權限與短期連結保護",
  "新增 App 首頁分享入口與系統原生分享功能",
  "修正其他資訊與共同準備清單的跨裝置即時刷新",
  "保留離線同步佇列，避免遠端事件覆蓋尚未送出的本機變更",
];

export const FORCE_UPDATE = true;
