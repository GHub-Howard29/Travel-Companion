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
