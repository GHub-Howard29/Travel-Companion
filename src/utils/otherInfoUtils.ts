/**
 * Other Info Utils（其他資訊工具函式）
 *
 * 負責處理「其他資訊」內容的常用查詢與排序。
 *
 * V3-1 的新增、編輯、刪除由 service/storage 處理，
 * utils 僅保留 pure helper，不執行 Role 權限過濾。
 */

// ================================
// Import
// ================================

import type { OtherInfoItem } from "../types";

// ================================
// Types
// ================================

export interface OtherInfoContentSegment {
  type: "text" | "link";
  text: string;
}

export type OtherInfoContentLine = OtherInfoContentSegment[];

// ================================
// Constants
// ================================

const HTTP_URL_PATTERN = /(https?:[\\/]+[^\s]+)/gi;
const EXACT_HTTP_URL_PATTERN = /^https?:[\\/]+[^\s]+$/i;

const normalizeHttpUrl = (value: string): string =>
  value.replace(/^(https?):[\\/]+/i, "$1://");

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

/**
 * 將其他資訊內容切成文字與 URL 片段，供 UI render 成可點擊連結
 */
export const parseOtherInfoContentLinks = (
  content: string,
): OtherInfoContentLine[] => {
  return content.split("\n").map((line) =>
    line
      .split(HTTP_URL_PATTERN)
      .filter((part) => part.length > 0)
      .map((part) => ({
        type: EXACT_HTTP_URL_PATTERN.test(part) ? "link" : "text",
        text: EXACT_HTTP_URL_PATTERN.test(part) ? normalizeHttpUrl(part) : part,
      })),
  );
};

/**
 * 將單一網址內容轉成可直接使用的超連結網址。
 */
export const getStandaloneHttpUrl = (content: string): string | null => {
  const value = content.trim();

  return EXACT_HTTP_URL_PATTERN.test(value) ? normalizeHttpUrl(value) : null;
};
