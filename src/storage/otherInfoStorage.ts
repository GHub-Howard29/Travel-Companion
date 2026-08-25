/**
 * Other Info Storage（其他資訊本機儲存）
 *
 * 負責讀取與寫入「其他資訊」本機覆寫資料。
 *
 * V3-1 階段先使用 localStorage 作為新增 / 編輯 / 刪除資料來源，
 * 未來若改為 JSON 檔、IndexedDB 或 Supabase，
 * 可再集中調整此檔案。
 */


import type { OtherInfoItem } from "../types";
import {
  isRestrictedOtherInfoRoles,
  normalizeOtherInfoAllowedRoles,
  type Role,
} from "../permissions/roles";

const OTHER_INFO_STORAGE_PREFIX = "travel_companion_other_info";

const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isStoredOtherInfoItem = (value: unknown): value is OtherInfoItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<OtherInfoItem>;

  return (
    isString(item.id) &&
    isString(item.tripId) &&
    isString(item.folderId) &&
    isString(item.title) &&
    isString(item.content) &&
    isNumber(item.order) &&
    isString(item.createdAt) &&
    isString(item.updatedAt) &&
    (item.allowedRoles === undefined ||
      item.allowedRoles === null ||
      (Array.isArray(item.allowedRoles) &&
        item.allowedRoles.every((role) => typeof role === "string"))) &&
    (item.isDeleted === undefined || typeof item.isDeleted === "boolean")
  );
};

const normalizeStoredOtherInfoItem = (item: OtherInfoItem): OtherInfoItem => ({
  ...item,
  allowedRoles: normalizeOtherInfoAllowedRoles(
    item.allowedRoles as Role[] | undefined,
  ),
});

const getOtherInfoStorageKey = (tripId: string): string => {
  return `${OTHER_INFO_STORAGE_PREFIX}_${tripId}`;
};

/**
 * 讀取指定 Trip 的其他資訊內容
 */
export const readStoredOtherInfoItems = (
  tripId: string,
): OtherInfoItem[] => {
  const rawData = localStorage.getItem(getOtherInfoStorageKey(tripId));

  if (!rawData) {
    return [];
  }

  try {
    const parsedData = JSON.parse(rawData);

    if (!Array.isArray(parsedData)) {
      return [];
    }

    return parsedData
      .filter(isStoredOtherInfoItem)
      .map(normalizeStoredOtherInfoItem);
  } catch {
    return [];
  }
};

/**
 * 寫入指定 Trip 的其他資訊內容
 */
export const writeStoredOtherInfoItems = (
  tripId: string,
  items: OtherInfoItem[],
): void => {
  localStorage.setItem(
    getOtherInfoStorageKey(tripId),
    JSON.stringify(items.map(normalizeStoredOtherInfoItem)),
  );
};

/**
 * 未授權帳號成功載入行程後，移除共用本機快取中的敏感卡片。
 * 管理者重新登入時會由 Supabase RLS 重新取得可見資料。
 */
export const removeRestrictedStoredOtherInfoItems = (
  tripId: string,
): OtherInfoItem[] => {
  const items = readStoredOtherInfoItems(tripId);
  const visibleItems = items.filter(
    (item) => !isRestrictedOtherInfoRoles(item.allowedRoles),
  );

  if (visibleItems.length !== items.length) {
    writeStoredOtherInfoItems(tripId, visibleItems);
  }

  return visibleItems;
};

/**
 * 清除指定 Trip 的其他資訊內容
 */
export const clearStoredOtherInfoItems = (tripId: string): void => {
  localStorage.removeItem(getOtherInfoStorageKey(tripId));
};
