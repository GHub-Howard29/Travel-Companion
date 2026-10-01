/** App 發布版本設定；須與 public/app-version.json 保持一致。 */
export const APP_VERSION = "3.9.22";

/**
 * 最近一次已發布版本；此版本必須存在於 versionHistory.ts。
 * production build 會驗證這個規則，避免升版後遺漏版本歷史。
 */
export const PREVIOUS_RELEASE_VERSION = "3.9.21";

export const RELEASE_DATE = "2026-10-01";

export const RELEASE_NOTES = [
  "調整順序與時間重算分離，儲存順序不再自動修改原本時間。",
  "新增「預覽新時間」，可檢查建議時間、接受或手動延後到達時間，最後再一次套用。",
  "餐飲與其他卡片可設定是否納入交通計算；被略過卡片不會中斷前後有效地點的交通鏈。",
  "更新程式前會先同步最新行程資料，再進行新版接管，降低遠端資料同步與 PWA 更新互相競態。",
  "「調整時間」可同時設定新的到達與離開時間；離開早於到達時會先阻擋，不進行交通重算。",
  "修正 Trip 編輯版本基準不一致：在線開啟編輯器時先取得最新雲端快照，並以同一快照進行版本鎖定。",
  "修正旅程刪除完成後可能誤報失敗；已刪除旅程可依永久 tombstone 安全重試。",
  "套用新時間時同步保存已預覽的交通時間與距離；大眾運輸時刻基準失效時會先重新查詢。",
];

/** 目前版本發布時保存的更新政策；不隨執行中客戶端是否已達最低版本而改變。 */
export const IS_MANDATORY_RELEASE = false;

/** 舊版 App 的橋接相容旗標；新版一律依最低支援版本計算是否為必要更新。 */
export const FORCE_UPDATE = true;
export const MINIMUM_SUPPORTED_VERSION = "3.9.17";
