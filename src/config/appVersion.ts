/**
 * App 版本設定
 *
 * 此檔案是每次發布新版時的主要修改入口。
 * 更新 APP_VERSION、RELEASE_DATE、RELEASE_NOTES 與 FORCE_UPDATE 後，
 * 必須同步更新 public/app-version.json，
 * PWA 更新提示會使用這些資訊顯示版本內容。
 */
export const APP_VERSION = "3.1.3";

export const RELEASE_DATE = "2026-07-12";

export const RELEASE_NOTES = [
  "iOS 安裝版 App 的 Google 登入改用專用開啟流程，降低兩步驗證後無法接回 App 的機率",
  "登入提示補上 iOS 兩步驗證建議，遇到 YouTube / Google App 確認時可改用其他驗證方式或 Safari 網頁模式",
  "iOS 照片同步改為重新包裝照片 Blob，並在失敗時改用 ArrayBuffer 重試上傳",
  "照片同步失敗時會顯示實際錯誤原因，方便判斷是授權、檔案格式或網路問題",
];

export const FORCE_UPDATE = false;
