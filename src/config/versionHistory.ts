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
      "完成整體系統重構",
      "整理 Offline First、Storage、Attachment 與 Sync 模組",
      "建立後續 V3 功能擴充基礎",
    ],
  },
  {
    version: "1.0.0",
    date: "2026",
    forceUpdate: false,
    notes: [
      "建立第一版旅行記帳系統",
      "支援 Google 登入、帳目管理、附件上傳與 Excel 匯出",
      "完成 GitHub Pages 部署",
    ],
  },
];
