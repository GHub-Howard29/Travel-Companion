/**
 * Folder Defaults（其他資訊預設分類）
 *
 * 負責建立「其他資訊」功能下方的第一層固定分類。
 *
 * 第一層為系統固定分類，例如景點、機票、飯店。
 * 第二層開始由使用者依照本次旅程自由建立。
 *
 * 此檔案只負責產生預設 Folder 資料，
 * 不負責儲存，也不直接操作 localStorage。
 */

// ================================
// Import
// ================================

import type { Folder } from "../types";
import { createFolder } from "./folderUtils";

// ================================
// Types
// ================================

interface DefaultFolderConfig {
  title: string;
  order: number;
}

// ================================
// Constants
// ================================

const DEFAULT_FOLDER_CONFIGS: DefaultFolderConfig[] = [
  { title: "景點", order: 1 },
  { title: "機票", order: 2 },
  { title: "飯店", order: 3 },
  { title: "交通", order: 4 },
  { title: "票券", order: 5 },
  { title: "保險", order: 6 },
  { title: "簽證", order: 7 },
  { title: "美食", order: 8 },
  { title: "購物", order: 9 },
  { title: "其他", order: 99 },
];

// ================================
// Public Functions
// ================================

/**
 * 建立指定 Trip 的「其他資訊」第一層固定分類
 */
export const createDefaultFoldersForTrip = (tripId: string): Folder[] => {
  return DEFAULT_FOLDER_CONFIGS.map((config) =>
    createFolder(tripId, null, config.title, config.order, true),
  );
};

/**
 * 確保指定 Trip 已包含「其他資訊」第一層固定分類
 */
export const ensureDefaultFoldersForTrip = (
  tripId: string,
  folders: Folder[],
): Folder[] => {
  const missingDefaultFolders = DEFAULT_FOLDER_CONFIGS.filter(
    (config) =>
      !folders.some(
        (folder) =>
          folder.isSystem === true &&
          folder.parentId === null &&
          folder.title === config.title,
      ),
  );

  if (missingDefaultFolders.length === 0) {
    return folders;
  }

  const newDefaultFolders = missingDefaultFolders.map((config) =>
    createFolder(tripId, null, config.title, config.order, true),
  );

  return [...folders, ...newDefaultFolders];
};