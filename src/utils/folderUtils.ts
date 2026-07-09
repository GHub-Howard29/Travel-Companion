/**
 * Folder Utils（資料夾工具函式）
 *
 * 負責提供 Folder 樹狀結構常用操作。
 *
 * Folder 本身不使用 type 或 category。
 * 分類由第一層系統固定 Folder 決定。
 */

// ================================
// Import
// ================================

import type { Folder } from "../types";

// ================================
// Public Functions
// ================================

/**
 * 建立新的 Folder
 */
export const createFolder = (
  tripId: string,
  parentId: string | null,
  title: string,
  order = 0,
  isSystem = false,
): Folder => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    tripId,
    parentId,
    title,
    order,
    isSystem,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * 更新 Folder 時間
 */
export const updateFolderTimestamp = (folder: Folder): Folder => ({
  ...folder,
  updatedAt: new Date().toISOString(),
});

/**
 * 取得第一層 Folder
 */
export const getRootFolders = (folders: Folder[]): Folder[] => {
  return folders.filter((folder) => folder.parentId === null);
};

/**
 * 取得指定 Folder 的子資料夾
 */
export const getChildFolders = (
  folders: Folder[],
  parentId: string,
): Folder[] => {
  return folders.filter((folder) => folder.parentId === parentId);
};

/**
 * 依照排序欄位排序 Folder
 */
export const sortFoldersByOrder = (folders: Folder[]): Folder[] => {
  return [...folders].sort((a, b) => a.order - b.order);
};