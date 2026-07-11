/**
 * App 版本歷史
 *
 * 保留已發布版本的摘要資訊。
 * 目前先收斂為最新版記錄，未來若要建立版本資訊頁，可從此檔案延伸。
 */
import {
  APP_VERSION,
  FORCE_UPDATE,
  RELEASE_DATE,
  RELEASE_NOTES,
} from "./appVersion";

export type VersionHistoryItem = {
  version: string;
  date: string;
  forceUpdate: boolean;
  notes: string[];
};

export const VERSION_HISTORY: VersionHistoryItem[] = [
  {
    version: APP_VERSION,
    date: RELEASE_DATE,
    forceUpdate: FORCE_UPDATE,
    notes: RELEASE_NOTES,
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
