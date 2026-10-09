/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.26";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.25";

export const RELEASE_DATE = "2026-10-09";

export const RELEASE_NOTES = [
  "行程公開／私人權限與受邀編輯者隔離正式完成，公開資料不再攜帶私人參與者 Email map。",
  "其他資訊與共同清單改由正規化資料表同步，保留離線變更與重新連線後的同步流程。",
  "帳本附件離線保存、重新連線上傳與失敗重試規則維持不變；既有照片簽名網址仍維持 1 小時有效期。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
