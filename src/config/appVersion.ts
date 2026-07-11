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
  "發布 Travel Companion V3 大改版",
  "整合 V2 重構成果與 V3-1 旅程管理、清單與參考資訊功能",
  "新增 PWA 版本更新提示與強制更新流程",
];

export const FORCE_UPDATE = true;
