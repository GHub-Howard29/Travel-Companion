/**
 * App 版本設定
 *
 * 此檔案是每次發布新版時的主要修改入口。
 * 更新 APP_VERSION、RELEASE_DATE、RELEASE_NOTES 與 FORCE_UPDATE 後，
 * 必須同步更新 public/app-version.json，
 * PWA 更新提示會使用這些資訊顯示版本內容。
 */
export const APP_VERSION = "3.1.5";

export const RELEASE_DATE = "2026-07-13";

export const RELEASE_NOTES = [
  "馬上更新加入重新載入備援，降低 Android PWA 點擊後未自動更新的情況",
  "iOS Safari 網頁模式也會顯示版本更新提示，方便未安裝 App 時更新",
  "保留非強制更新的馬上更新與稍後更新流程，稍後更新後重新整理仍會再次提醒",
];

export const FORCE_UPDATE = false;
