/**
 * App 版本設定
 *
 * 此檔案是每次發布新版時的主要修改入口。
 * 更新 APP_VERSION、RELEASE_DATE、RELEASE_NOTES 與 FORCE_UPDATE 後，
 * PWA 更新提示會使用這些資訊顯示版本內容。
 */
export const APP_VERSION = "3.0.0";

export const RELEASE_DATE = "2026-07-11";

export const RELEASE_NOTES = [
  "可以在 App 裡新增、編輯旅程與每日行程",
  "新增共同檢查清單與私人確認清單，方便旅行前分工準備",
  "新增版本更新提醒，更新前會先讓你看到本次改了什麼",
];

export const FORCE_UPDATE = true;
