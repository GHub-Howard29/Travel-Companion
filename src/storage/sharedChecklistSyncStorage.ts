import type { ChecklistItem } from "../types";

export interface PendingSharedChecklistOrder {
  tripId: string;
  userEmail: string;
  items: ChecklistItem[];
  baseItems: ChecklistItem[];
  revision: string;
}

export interface PendingSharedChecklistProgress {
  tripId: string;
  userEmail: string;
  checkedItemIds: string[];
  revision: string;
}

const ORDER_STORAGE_PREFIX = "travel_companion_pending_shared_checklist_order";
const PROGRESS_STORAGE_PREFIX =
  "travel_companion_pending_shared_checklist_progress";

const storageKey = (tripId: string, userEmail: string): string =>
  `${ORDER_STORAGE_PREFIX}_${tripId}_${userEmail.trim().toLowerCase()}`;

const progressStorageKey = (tripId: string, userEmail: string): string =>
  `${PROGRESS_STORAGE_PREFIX}_${tripId}_${userEmail.trim().toLowerCase()}`;

const isChecklistItem = (value: unknown): value is ChecklistItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ChecklistItem>;
  return (
    typeof item.id === "string" &&
    typeof item.category === "string" &&
    typeof item.label === "string"
  );
};

export const readPendingSharedChecklistOrder = (
  tripId: string,
  userEmail: string,
): PendingSharedChecklistOrder | null => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey(tripId, userEmail)) ?? "null",
    ) as Partial<PendingSharedChecklistOrder> | null;

    if (
      !parsed ||
      parsed.tripId !== tripId ||
      parsed.userEmail !== userEmail.trim().toLowerCase() ||
      !Array.isArray(parsed.items) ||
      !parsed.items.every(isChecklistItem) ||
      typeof parsed.revision !== "string"
    ) {
      return null;
    }

    return {
      ...parsed,
      baseItems:
        Array.isArray(parsed.baseItems) && parsed.baseItems.every(isChecklistItem)
          ? parsed.baseItems
          : [],
    } as PendingSharedChecklistOrder;
  } catch {
    return null;
  }
};

export const writePendingSharedChecklistOrder = (
  tripId: string,
  userEmail: string,
  items: ChecklistItem[],
  baseItems: ChecklistItem[],
): PendingSharedChecklistOrder => {
  const currentPending = readPendingSharedChecklistOrder(tripId, userEmail);
  const mergedBaseItemsById = new Map(
    (currentPending?.baseItems ?? []).map((item) => [item.id, item]),
  );
  baseItems.forEach((item) => {
    if (!mergedBaseItemsById.has(item.id)) {
      mergedBaseItemsById.set(item.id, item);
    }
  });
  const pending: PendingSharedChecklistOrder = {
    tripId,
    userEmail: userEmail.trim().toLowerCase(),
    items,
    baseItems: Array.from(mergedBaseItemsById.values()),
    revision: crypto.randomUUID(),
  };
  localStorage.setItem(storageKey(tripId, userEmail), JSON.stringify(pending));
  return pending;
};

export const clearPendingSharedChecklistOrder = (
  tripId: string,
  userEmail: string,
  revision: string,
): boolean => {
  const pending = readPendingSharedChecklistOrder(tripId, userEmail);
  if (!pending || pending.revision !== revision) return false;
  localStorage.removeItem(storageKey(tripId, userEmail));
  return true;
};

export const readPendingSharedChecklistProgress = (
  tripId: string,
  userEmail: string,
): PendingSharedChecklistProgress | null => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(progressStorageKey(tripId, userEmail)) ?? "null",
    ) as Partial<PendingSharedChecklistProgress> | null;
    if (
      !parsed ||
      parsed.tripId !== tripId ||
      parsed.userEmail !== userEmail.trim().toLowerCase() ||
      !Array.isArray(parsed.checkedItemIds) ||
      !parsed.checkedItemIds.every((itemId) => typeof itemId === "string") ||
      typeof parsed.revision !== "string"
    ) {
      return null;
    }
    return parsed as PendingSharedChecklistProgress;
  } catch {
    return null;
  }
};

export const writePendingSharedChecklistProgress = (
  tripId: string,
  userEmail: string,
  checkedItemIds: string[],
): PendingSharedChecklistProgress => {
  const pending: PendingSharedChecklistProgress = {
    tripId,
    userEmail: userEmail.trim().toLowerCase(),
    checkedItemIds,
    revision: crypto.randomUUID(),
  };
  localStorage.setItem(
    progressStorageKey(tripId, userEmail),
    JSON.stringify(pending),
  );
  return pending;
};

export const clearPendingSharedChecklistProgress = (
  tripId: string,
  userEmail: string,
  revision: string,
): boolean => {
  const pending = readPendingSharedChecklistProgress(tripId, userEmail);
  if (!pending || pending.revision !== revision) return false;
  localStorage.removeItem(progressStorageKey(tripId, userEmail));
  return true;
};
