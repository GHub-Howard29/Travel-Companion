/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.4.2";

export const RELEASE_DATE = "2026-08-20";

export const RELEASE_NOTES = [
  "改善離線後恢復連線時的共同清單同步穩定性",
  "歷史行程在離線狀態下改為完整唯讀，避免誤操作",
  "調整歷史行程記帳本的離線提示文案",
  "新增可離線使用的 PWA 啟動動畫，載入完成後自動進入 App",
];

export const FORCE_UPDATE = false;
