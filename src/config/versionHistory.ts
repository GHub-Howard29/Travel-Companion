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
    version: "3.5.6",
    date: "2026-08-28",
    forceUpdate: true,
    notes: [
      "新增最低支援版本政策，必要更新不再受裝置模式或稍後更新狀態影響。",
      "將資訊卡片內容與行程說明的文字選色工具列移到輸入框下方。",
      "支援全形冒號時間、統一儲存格式，並阻擋無效時間進入行程排序。",
    ],
  },
  {
    version: "3.5.5",
    date: "2026-08-27",
    forceUpdate: false,
    notes: [
      "修正刪除目前行程後的預設行程選取，與進入 App 時的規則保持一致。",
      "資訊卡片連結改由系統外部處理，Google Maps 連結優先交由專用 App 開啟。",
      "資訊卡片內容與每日詳細行程說明支援選取局部文字設定顏色。",
    ],
  },
  {
    version: "3.5.4",
    date: "2026-08-26",
    forceUpdate: false,
    notes: [
      "新增 Super Admin 固定顯示名稱，建立旅程時只預帶 Howard 與 Carol。",
      "統一新 Trip ID 規則，阻擋本機、雲端及併發造成的重複 Trip。",
      "新增旅程必須保持連線，既有旅程 ID、編輯與離線能力維持不變。",
    ],
  },
  {
    version: "3.5.3",
    date: "2026-08-26",
    forceUpdate: false,
    notes: [
      "加入內容安全政策與 no-referrer，限制瀏覽器載入與連線來源。",
      "強化 Google OAuth 等待畫面、外部網址與新視窗的安全處理。",
      "保留附件、PWA、Excel 匯出、分享與既有權限／同步資料流相容性。",
    ],
  },
  {
    version: "3.5.1",
    date: "2026-08-26",
    forceUpdate: true,
    notes: [
      "強化帳本附件的私有儲存空間、Trip 權限與短期連結保護。",
      "新增 App 首頁分享入口與系統原生分享功能。",
      "修正其他資訊與共同準備清單的跨裝置即時刷新。",
      "保留離線同步佇列，避免遠端事件覆蓋尚未送出的本機變更。",
    ],
  },
  {
    version: "3.5.0",
    date: "2026-08-25",
    forceUpdate: true,
    notes: [
      "完成其他資訊敏感資料卡片的角色限制與 Supabase RLS 保護。",
      "修正其他資訊同步失敗並提供手動重試，收斂行程編輯權限。",
      "修正 PWA 更新接管時序，並完成 Android／Chrome 發布後驗證。",
    ],
  },
  {
    version: "3.4.11",
    date: "2026-08-24",
    forceUpdate: false,
    notes: [
      "統一 Android 原生啟動畫面、等待畫面與 App 系統資訊列為暖米白色。",
      "保留單次原生圖示並降低啟動階段系統列與底圖的色差。",
    ],
  },
  {
    version: "3.4.10",
    date: "2026-08-24",
    forceUpdate: false,
    notes: [
      "移除 Android 原生啟動畫面後重複出現的網頁層 App 圖示。",
      "載入期間保留一致底圖，完成後一次切換至操作介面。",
    ],
  },
  {
    version: "3.4.9",
    date: "2026-08-24",
    forceUpdate: false,
    notes: [
      "修正共同清單首次同步期間勾選狀態可能回彈的問題。",
      "歷史行程離線時改用明確的清單唯讀提示。",
      "統一 PWA 網頁載入畫面，降低進入操作介面前的跳動。",
    ],
  },
  {
    version: "3.4.8",
    date: "2026-08-24",
    forceUpdate: false,
    notes: [
      "修正 PWA 更新時的過早與重複重載。",
      "降低 Android PWA 更新後停留在純色啟動畫面的機率。",
    ],
  },
  {
    version: "3.4.7",
    date: "2026-08-23",
    forceUpdate: false,
    notes: [
      "修正 V3.4.6 發布後 App 與網頁仍顯示 V3.4.5 的問題。",
    ],
  },
  {
    version: "3.4.6",
    date: "2026-08-23",
    forceUpdate: false,
    notes: [
      "改善 PWA 啟動畫面與手機系統列的顯示銜接。",
      "版本資訊主畫面保留最近兩版，並可查看完整版本歷史。",
    ],
  },
  {
    version: "3.4.5",
    date: "2026-08-23",
    forceUpdate: false,
    notes: [
      "修正 PWA 載入銜接，移除重複的網頁 Splash 圖示與動畫。",
      "補強版本歷史防漏驗證，避免遺漏上一個已發布版本。",
    ],
  },
  {
    version: "3.4.4",
    date: "2026-08-23",
    forceUpdate: false,
    notes: [
      "調整 PWA 預設載入畫面，統一使用明亮天空藍背景並移除載入動畫。",
      "保留既有 PWA 桌面圖示、網站 favicon 與 manifest 圖示設定。",
    ],
  },
  {
    version: "3.4.3",
    date: "2026-08-23",
    forceUpdate: false,
    notes: [
      "優化 PWA 啟動畫面，讓系統 Splash、HTML 預載與 App 載入流程更連續。",
      "保留既有 PWA 桌面圖示、網站 favicon 與 manifest 圖示設定。",
    ],
  },
  {
    version: "3.4.2",
    date: "2026-08-20",
    forceUpdate: false,
    notes: [
      "改善離線後恢復連線時的共同清單同步穩定性。",
      "歷史行程在離線狀態下改為完整唯讀，避免誤操作。",
      "調整歷史行程記帳本的離線提示文案。",
      "新增可離線使用的 PWA 啟動動畫，載入完成後自動進入 App。",
    ],
  },
  {
    version: "3.4.1",
    date: "2026-08-20",
    forceUpdate: false,
    notes: [
      "改善離線刷新、旅行工具載入與恢復連線提示。",
      "共同與私人清單加強離線同步及多人修改合併。",
      "修正清單刪除、排序與跨裝置更新穩定性。",
      "其他資訊改為本機先存並於背景同步。",
      "共用帳本支援代其他成員記帳與多人資料疊加。",
      "Excel 匯出新增紀錄者與幣別分類合計。",
    ],
  },
  {
    version: "3.4.0",
    date: "2026-08-05",
    forceUpdate: false,
    notes: [
      "非首屏旅行工具與 Excel 匯出改為按需載入。",
      "降低 App 首次開啟的 JavaScript 下載量。",
    ],
  },
  {
    version: "3.3.3",
    date: "2026-07-30",
    forceUpdate: false,
    notes: [
      "修正私人確認清單跨裝置同步邏輯。",
      "共同確認清單分類（根目錄）新增排序功能。",
    ],
  },
  {
    version: "3.3.2",
    date: "2026-07-27",
    forceUpdate: false,
    notes: [
      "修正版本資訊顯示與帳本總覽、匯出操作體驗。",
      "帳本匯出補上支出人幣別合計與完整記帳日期。",
      "管理者可匯出目前旅程的全部雲端帳本明細。",
    ],
  },
  {
    version: "3.3.1",
    date: "2026-07-27",
    forceUpdate: false,
    notes: [
      "行程首頁依出發日期自動開啟對應 Day，行程活動依時間排序。",
      "共同清單、私人清單與資訊卡片支援拖拉排序與延後同步。",
      "已登入使用者可設定個人預設首頁；一般登入使用者可使用本機共同檢查清單。",
    ],
  },
  {
    version: "3.3.0",
    date: "2026-07-20",
    forceUpdate: false,
    notes: [
      "新增外幣換算，支援換匯紀錄、加權平均與臺銀參考匯率雙估算。",
      "換匯紀錄支援 Trip 雲端同步、跨瀏覽器即時更新與離線參考匯率。",
      "金額輸入支援千分位，並更新旅行 App 圖示與網頁小圖示。",
    ],
  },
  {
    version: "3.2.0",
    date: "2026-07-13",
    forceUpdate: false,
    notes: [
      "帳本新增記帳日期，支援依日期排序與 Excel 匯出",
      "行程管理編輯流程與每日行程操作體驗優化",
    ],
  },
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
