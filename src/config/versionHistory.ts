/**
 * App 版本歷史
 *
 * 保留已發布版本的摘要資訊。
 * 只保留過去版本摘要。
 * 目前版本與本次更新內容由 appVersion.ts 顯示，避免在版本歷史重複洗版。
 */
export type VersionHistoryItem = {
  version: string;
  date: string;
  forceUpdate: boolean;
  notes: string[];
};

export const VERSION_HISTORY: VersionHistoryItem[] = [
  {
    version: "3.1.5",
    date: "2026-07-13",
    forceUpdate: false,
    notes: [
      "Android PWA 馬上更新加入重新載入備援，降低點擊後未自動更新的情況",
      "iOS Safari 網頁模式也會顯示版本更新提示，方便未安裝 App 時更新",
      "保留非強制更新的馬上更新與稍後更新流程，稍後更新後重新整理仍會再次提醒",
    ],
  },
  {
    version: "3.1.4",
    date: "2026-07-13",
    forceUpdate: false,
    notes: [
      "非強制更新恢復顯示更新提示，提供馬上更新與稍後更新選項",
      "選擇馬上更新時會先清除 App 暫存，再重新載入最新版本",
      "選擇稍後更新不會標記為已讀，重新整理或重新開啟 App 會再次提醒",
      "新增與編輯旅程時，參與者名稱與登入 Email 合併為名稱=Email 欄位，降低重複輸入",
      "預設幣別新增並排序為 TWD、JPY、KRW、USD、EUR",
      "TWD、JPY、KRW 分攤結算改為整數進位規則，零頭盈餘由代墊者承接",
      "更新提示補上未儲存資料警語，提醒先儲存後再更新",
    ],
  },
  {
    version: "3.1.3",
    date: "2026-07-12",
    forceUpdate: false,
    notes: [
      "iOS 安裝版 App 的 Google 登入改用專用開啟流程，降低兩步驗證後無法接回 App 的機率",
      "登入提示補上 iOS 兩步驗證建議，遇到 YouTube / Google App 確認時可改用其他驗證方式或 Safari 網頁模式",
      "iOS 照片同步改為重新包裝照片 Blob，並在失敗時改用 ArrayBuffer 重試上傳",
      "照片同步失敗時會顯示實際錯誤原因，方便判斷是授權、檔案格式或網路問題",
    ],
  },
  {
    version: "3.1.2",
    date: "2026-07-12",
    forceUpdate: false,
    notes: [
      "改善 iOS PWA Google 登入流程，降低安裝版 App 重新驗證失敗的機率",
      "改善 iOS 照片附件處理與照片連結開啟，支援空 MIME 與 HEIC / HEIF 轉存",
      "修正 iOS PWA 點選輸入框後畫面自動放大的問題",
      "領隊導遊聯絡資訊與自駕租車資訊改用獨立資料區，不再混入其他資訊分類",
      "頁首新增旅程性質標示，可直接看到跟團或自助 / 自駕",
    ],
  },
  {
    version: "3.1.1",
    date: "2026-07-12",
    forceUpdate: false,
    notes: [
      "其他資訊開始接上雲端同步基礎",
      "開啟旅程時會合併雲端其他資訊與既有 Trip 內容",
      "刪除旅程時會一併清理該旅程的其他資訊雲端資料",
      "PWA manifest、package 與 App 版本設定同步為 V3.1.1",
    ],
  },
  {
    version: "3.1.0",
    date: "2026-07-11",
    forceUpdate: false,
    notes: [
      "修正版本更新提示，同版本或第一次開啟不再誤跳更新視窗",
      "其他資訊與自駕 / 領隊資訊改為先瀏覽、需要時再進入管理",
      "旅費記帳本可單獨移除已上傳的附件，不會刪除帳目",
      "手機新增或編輯照片附件時，可選擇拍照或既有照片",
      "補上其他資訊未來雲端同步所需的資料表與權限設計",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-07-11",
    forceUpdate: true,
    notes: [
      "可以在 App 裡新增、編輯旅程與每日行程",
      "新增共同檢查清單與私人確認清單，方便旅行前分工準備",
      "新增版本更新提醒，更新前會先讓你看到本次改了什麼",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-07",
    forceUpdate: false,
    notes: [
      "讓 App 在網路不穩時也能更安心使用",
      "改善附件與記帳資料的保存穩定度",
      "整理系統架構，讓後續新增旅行工具更容易",
    ],
  },
  {
    version: "1.0.0",
    date: "2026",
    forceUpdate: false,
    notes: [
      "推出第一版旅行記帳功能",
      "支援登入、建立帳目、上傳附件與匯出 Excel",
      "完成第一版線上使用入口",
    ],
  },
];
