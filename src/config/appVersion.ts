/**
 * App 版本設定
 *
 * 此檔案是每次發布新版時的主要修改入口。
 * 更新 APP_VERSION、RELEASE_DATE、RELEASE_NOTES 與 FORCE_UPDATE 後，
 * 必須同步更新 public/app-version.json，
 * PWA 更新提示會使用這些資訊顯示版本內容。
 */
export const APP_VERSION = "3.2.0";

export const RELEASE_DATE = "2026-07-13";

export const RELEASE_NOTES = [
  "記帳本新增記帳日期，新增帳目預設使用今天日期",
  "編輯既有帳目時可調整記帳日期，舊帳目會用建立時間補上相容日期",
  "帳目列表改為依記帳日期最新優先顯示，同日再依建立時間排序",
  "Excel 匯出新增記帳日期欄位，方便旅後整理帳務",
];

export const FORCE_UPDATE = false;
