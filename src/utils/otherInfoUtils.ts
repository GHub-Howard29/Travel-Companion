/**
 * Other Info Utils（其他資訊工具函式）
 *
 * 負責處理「其他資訊」唯讀內容的常用查詢與排序。
 *
 * V3-1 只做資料展示輔助，
 * 不處理 APP 內新增、編輯、刪除，
 * 也暫不執行 Role 權限過濾。
 */

// ================================
// Import
// ================================

import type { OtherInfoItem } from "../types";

// ================================
// Public Functions
// ================================

/**
 * 取得指定 Folder 底下的其他資訊內容
 */
export const getOtherInfoItemsByFolderId = (
  items: OtherInfoItem[],
  folderId: string,
): OtherInfoItem[] => {
  return items.filter((item) => item.folderId === folderId);
};

/**
 * 依照排序欄位排序其他資訊內容
 */
export const sortOtherInfoItemsByOrder = (
  items: OtherInfoItem[],
): OtherInfoItem[] => {
  return [...items].sort((a, b) => a.order - b.order);
};

/**
 * 判斷指定 Folder 是否有其他資訊內容
 */
export const hasOtherInfoItems = (
  items: OtherInfoItem[],
  folderId: string,
): boolean => {
  return items.some((item) => item.folderId === folderId);
};