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
];
