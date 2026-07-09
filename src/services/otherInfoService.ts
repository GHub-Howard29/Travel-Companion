/**
 * Other Info Service（其他資訊服務層）
 *
 * 負責整合：
 * - 預設 Folder
 * - 靜態資料
 * - Repository
 *
 * UI 不直接操作 Storage 或 Constants，
 * 一律透過 Service 取得資料。
 */

// ================================
// Import
// ================================

import type { Folder, OtherInfoItem } from "../types";

import {
  createDefaultFoldersForTrip,
} from "../utils/folderDefaults";

import {
  OTHER_INFO_DATA_BY_TRIP_ID,
} from "../constants/otherInfoData";

// ================================
// Public Functions
// ================================

/**
 * 取得指定 Trip 的第一層固定分類
 */
export const getDefaultFolders = (
  tripId: string,
): Folder[] => {
  return createDefaultFoldersForTrip(tripId);
};

/**
 * 取得指定 Trip 的所有 Folder
 */
export const getFolders = (
  tripId: string,
): Folder[] => {
  return OTHER_INFO_DATA_BY_TRIP_ID[tripId]?.folders ?? [];
};

/**
 * 取得指定 Trip 的所有內容
 */
export const getItems = (
  tripId: string,
): OtherInfoItem[] => {
  return OTHER_INFO_DATA_BY_TRIP_ID[tripId]?.items ?? [];
};