import type { PrivateChecklist, PrivateChecklistItem } from "../types";

const PRIVATE_CHECKLIST_STORAGE_PREFIX = "travel_companion_private_checklist";

const getPrivateChecklistStorageKey = (
  tripId: string,
  userId: string,
): string => {
  return `${PRIVATE_CHECKLIST_STORAGE_PREFIX}_${tripId}_${userId}`;
};

const isPrivateChecklistItem = (
  value: unknown,
): value is PrivateChecklistItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<PrivateChecklistItem>;

  return (
    typeof item.id === "string" &&
    typeof item.tripId === "string" &&
    typeof item.userId === "string" &&
    typeof item.label === "string" &&
    typeof item.isChecked === "boolean" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
};

const isPrivateChecklist = (value: unknown): value is PrivateChecklist => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const checklist = value as Partial<PrivateChecklist>;

  return (
    typeof checklist.tripId === "string" &&
    typeof checklist.userId === "string" &&
    Array.isArray(checklist.items) &&
    checklist.items.every(isPrivateChecklistItem) &&
    typeof checklist.updatedAt === "string"
  );
};

export const readStoredPrivateChecklist = (
  tripId: string,
  userId: string,
): PrivateChecklist => {
  const fallback: PrivateChecklist = {
    tripId,
    userId,
    items: [],
    updatedAt: "",
  };
  const rawData = localStorage.getItem(
    getPrivateChecklistStorageKey(tripId, userId),
  );

  if (!rawData) {
    return fallback;
  }

  try {
    const parsedData = JSON.parse(rawData);

    if (
      !isPrivateChecklist(parsedData) ||
      parsedData.tripId !== tripId ||
      parsedData.userId !== userId
    ) {
      return fallback;
    }

    return parsedData;
  } catch {
    return fallback;
  }
};

export const writeStoredPrivateChecklist = (
  checklist: PrivateChecklist,
): void => {
  localStorage.setItem(
    getPrivateChecklistStorageKey(checklist.tripId, checklist.userId),
    JSON.stringify(checklist),
  );
};
