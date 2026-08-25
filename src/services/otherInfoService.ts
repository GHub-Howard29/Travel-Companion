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
import { normalizeOtherInfoAllowedRoles, type Role } from "../permissions/roles";

import {
  createDefaultFoldersForTrip,
  ensureDefaultFoldersForTrip,
} from "../utils/folderDefaults";

import {
  sortFoldersByOrder,
} from "../utils/folderUtils";

import {
  sortOtherInfoItemsByOrder,
} from "../utils/otherInfoUtils";

import {
  OTHER_INFO_DATA_BY_TRIP_ID,
} from "../constants/otherInfoData";

import {
  getFoldersByTripId,
} from "../storage/folderRepository";

import {
  readStoredOtherInfoItems,
  writeStoredOtherInfoItems,
} from "../storage/otherInfoStorage";

// ================================
// Private Helpers
// ================================

const normalizeEditableText = (value: string): string => {
  return value.trim();
};

const getStoredItemsForTrip = (tripId: string): OtherInfoItem[] => {
  return readStoredOtherInfoItems(tripId).filter((item) => item.tripId === tripId);
};

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
  const seedFolders = OTHER_INFO_DATA_BY_TRIP_ID[tripId]?.folders ?? [];
  const storedFolders = getFoldersByTripId(tripId);
  const mergedFoldersById = new Map<string, Folder>();

  createDefaultFoldersForTrip(tripId).forEach((folder) => {
    mergedFoldersById.set(folder.id, folder);
  });

  seedFolders.forEach((folder) => {
    mergedFoldersById.set(folder.id, folder);
  });

  storedFolders.forEach((folder) => {
    mergedFoldersById.set(folder.id, folder);
  });

  const folders = ensureDefaultFoldersForTrip(
    tripId,
    Array.from(mergedFoldersById.values()),
  );

  return sortFoldersByOrder(folders);
};

/**
 * 取得指定 Trip 的所有內容
 */
export const getItems = (
  tripId: string,
): OtherInfoItem[] => {
  const seedItems = OTHER_INFO_DATA_BY_TRIP_ID[tripId]?.items ?? [];
  const storedItems = getStoredItemsForTrip(tripId);
  const mergedItemsById = new Map<string, OtherInfoItem>();

  seedItems.forEach((item) => {
    mergedItemsById.set(item.id, item);
  });

  storedItems.forEach((item) => {
    mergedItemsById.set(item.id, item);
  });

  return sortOtherInfoItemsByOrder(
    Array.from(mergedItemsById.values()).filter((item) => !item.isDeleted),
  );
};

export const createOtherInfoItem = (
  tripId: string,
  folderId: string,
  title: string,
  content: string,
  allowedRoles?: Role[],
): OtherInfoItem[] => {
  const normalizedTitle = normalizeEditableText(title);
  const normalizedContent = normalizeEditableText(content);

  if (!normalizedTitle || !normalizedContent) {
    return getItems(tripId);
  }

  const now = new Date().toISOString();
  const storedItems = getStoredItemsForTrip(tripId);
  const nextOrder =
    getItems(tripId).filter((item) => item.folderId === folderId).length + 1;

  writeStoredOtherInfoItems(tripId, [
    ...storedItems,
    {
      id: crypto.randomUUID(),
      tripId,
      folderId,
      title: normalizedTitle,
      content: normalizedContent,
      allowedRoles: normalizeOtherInfoAllowedRoles(allowedRoles),
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return getItems(tripId);
};

export const updateOtherInfoItem = (
  tripId: string,
  itemId: string,
  patch: Pick<OtherInfoItem, "folderId" | "title" | "content" | "allowedRoles">,
): OtherInfoItem[] => {
  const normalizedTitle = normalizeEditableText(patch.title);
  const normalizedContent = normalizeEditableText(patch.content);

  if (!normalizedTitle || !normalizedContent) {
    return getItems(tripId);
  }

  const currentItem = getItems(tripId).find((item) => item.id === itemId);

  if (!currentItem) {
    return getItems(tripId);
  }

  const storedItems = getStoredItemsForTrip(tripId);
  const nextItem: OtherInfoItem = {
    ...currentItem,
    ...patch,
    title: normalizedTitle,
    content: normalizedContent,
    allowedRoles: normalizeOtherInfoAllowedRoles(patch.allowedRoles),
    updatedAt: new Date().toISOString(),
  };
  const hasStoredItem = storedItems.some((item) => item.id === itemId);
  const nextStoredItems = hasStoredItem
    ? storedItems.map((item) => (item.id === itemId ? nextItem : item))
    : [...storedItems, nextItem];

  writeStoredOtherInfoItems(tripId, nextStoredItems);

  return getItems(tripId);
};

export const deleteOtherInfoItem = (
  tripId: string,
  itemId: string,
): OtherInfoItem[] => {
  const currentItem = getItems(tripId).find((item) => item.id === itemId);

  if (!currentItem) {
    return getItems(tripId);
  }

  const storedItems = getStoredItemsForTrip(tripId);
  const deleteMarker: OtherInfoItem = {
    ...currentItem,
    isDeleted: true,
    updatedAt: new Date().toISOString(),
  };
  const hasStoredItem = storedItems.some((item) => item.id === itemId);
  const nextStoredItems = hasStoredItem
    ? storedItems.map((item) => (item.id === itemId ? deleteMarker : item))
    : [...storedItems, deleteMarker];

  writeStoredOtherInfoItems(tripId, nextStoredItems);

  return getItems(tripId);
};
