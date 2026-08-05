/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.4.0";

export const RELEASE_DATE = "2026-08-05";

export const RELEASE_NOTES = [
  "非首屏旅行工具改為按需載入，降低首次開啟下載量。",
  "Excel 匯出套件改為匯出時載入，production 初始 bundle 減少約 68.8%。",
  "確認 PWA 離線重載與旅行工具切換正常。",
];

export const FORCE_UPDATE = false;
