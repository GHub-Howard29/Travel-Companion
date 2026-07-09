/**
 * Folder Defaults（其他資訊預設分類）
 *
 * 負責建立「其他資訊」功能下方的第一層固定分類。
 *
 * 第一層為系統固定分類，例如景點、機票、飯店。
 * 第二層開始由管理者依照本次旅程資料自由維護。
 *
 * 預設分類使用固定 ID，
 * 避免重新 Build 後 OtherInfoItem.folderId 對應失效。
 */

// ================================
// Import
// ================================

import type { Folder } from "../types";
import { createFolderWithId } from "./folderUtils";

// ================================
// Types
// ================================

interface DefaultFolderConfig {
  id: string;
  title: string;
  order: number;
}

// ================================
// Constants
// ================================

const DEFAULT_FOLDER_CONFIGS: DefaultFolderConfig[] = [
  { id: "other-info-attractions", title: "景點", order: 1 },
  { id: "other-info-flights", title: "機票", order: 2 },
  { id: "other-info-hotels", title: "飯店", order: 3 },
  { id: "other-info-transport", title: "交通", order: 4 },
  { id: "other-info-tickets", title: "票券", order: 5 },
  { id: "other-info-insurance", title: "保險", order: 6 },
  { id: "other-info-visa", title: "簽證", order: 7 },
  { id: "other-info-food", title: "美食", order: 8 },
  { id: "other-info-shopping", title: "購物", order: 9 },
  { id: "other-info-other", title: "其他", order: 99 },
];

// ================================
// Public Functions
// ================================

/**
 * 建立指定 Trip 的「其他資訊」第一層固定分類
 */
export const createDefaultFoldersForTrip = (tripId: string): Folder[] => {
  return DEFAULT_FOLDER_CONFIGS.map((config) =>
    createFolderWithId(config.id, tripId, null, config.title, config.order, true),
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
          folder.id === config.id,
      ),
  );

  if (missingDefaultFolders.length === 0) {
    return folders;
  }

  const newDefaultFolders = missingDefaultFolders.map((config) =>
    createFolderWithId(config.id, tripId, null, config.title, config.order, true),
  );

  return [...folders, ...newDefaultFolders];
};