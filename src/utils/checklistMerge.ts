import type { ChecklistItem } from "../types";

const hasContentChanged = (
  item: ChecklistItem,
  baseItem: ChecklistItem,
): boolean =>
  item.category !== baseItem.category || item.label !== baseItem.label;

const chooseModifiedItem = (
  localItem: ChecklistItem,
  cloudItem: ChecklistItem,
  baseItem?: ChecklistItem,
): ChecklistItem => {
  if (baseItem) {
    const localChanged = hasContentChanged(localItem, baseItem);
    const cloudChanged = hasContentChanged(cloudItem, baseItem);
    if (localChanged && !cloudChanged) return localItem;
    if (cloudChanged && !localChanged) return cloudItem;
    if (localChanged && cloudChanged) return cloudItem;
  }

  const localUpdatedAt = localItem.updatedAt ?? "";
  const cloudUpdatedAt = cloudItem.updatedAt ?? "";
  return cloudUpdatedAt > localUpdatedAt ? cloudItem : localItem;
};

/**
 * 共同清單的保守三方合併：不同 ID 聯集；同一 ID 修改優先；
 * 刪除與另一端修改衝突時保留修改版本。
 */
export const mergeSharedChecklistItems = (
  localItems: ChecklistItem[],
  cloudItems: ChecklistItem[],
  baseItems: ChecklistItem[],
): ChecklistItem[] => {
  const localItemsById = new Map(localItems.map((item) => [item.id, item]));
  const cloudItemsById = new Map(cloudItems.map((item) => [item.id, item]));
  const baseItemsById = new Map(baseItems.map((item) => [item.id, item]));
  const mergedItems: ChecklistItem[] = [];

  for (const localItem of localItems) {
    const cloudItem = cloudItemsById.get(localItem.id);
    const baseItem = baseItemsById.get(localItem.id);

    if (cloudItem) {
      mergedItems.push(chooseModifiedItem(localItem, cloudItem, baseItem));
      continue;
    }

    // 雲端刪除、本機仍存在：本機修改時保留，未修改才接受刪除。
    if (!baseItem || hasContentChanged(localItem, baseItem)) {
      mergedItems.push(localItem);
    }
  }

  for (const cloudItem of cloudItems) {
    if (localItemsById.has(cloudItem.id)) continue;
    const baseItem = baseItemsById.get(cloudItem.id);

    // 本機刪除、雲端仍存在：雲端修改時保留，未修改才接受刪除。
    if (!baseItem || hasContentChanged(cloudItem, baseItem)) {
      mergedItems.push(cloudItem);
    }
  }

  return mergedItems;
};
