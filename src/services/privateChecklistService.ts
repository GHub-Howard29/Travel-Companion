import type { PrivateChecklist, PrivateChecklistItem } from "../types";
import {
  readStoredPrivateChecklist,
  writeStoredPrivateChecklist,
} from "../storage/privateChecklistStorage";

const createPrivateChecklistItemId = (): string => {
  return `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const getPrivateChecklist = (
  tripId: string,
  userId: string,
): PrivateChecklist => {
  return readStoredPrivateChecklist(tripId, userId);
};

export const createPrivateChecklistItem = (
  tripId: string,
  userId: string,
  label: string,
  currentItems: PrivateChecklistItem[],
): PrivateChecklist => {
  const now = new Date().toISOString();
  const nextChecklist: PrivateChecklist = {
    tripId,
    userId,
    items: [
      ...currentItems,
      {
        id: createPrivateChecklistItemId(),
        tripId,
        userId,
        label,
        isChecked: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };

  writeStoredPrivateChecklist(nextChecklist);

  return nextChecklist;
};

export const updatePrivateChecklistItem = (
  tripId: string,
  userId: string,
  itemId: string,
  patch: Partial<Pick<PrivateChecklistItem, "label" | "isChecked">>,
  currentItems: PrivateChecklistItem[],
): PrivateChecklist => {
  const now = new Date().toISOString();
  const nextChecklist: PrivateChecklist = {
    tripId,
    userId,
    items: currentItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            ...patch,
            updatedAt: now,
          }
        : item,
    ),
    updatedAt: now,
  };

  writeStoredPrivateChecklist(nextChecklist);

  return nextChecklist;
};

export const deletePrivateChecklistItem = (
  tripId: string,
  userId: string,
  itemId: string,
  currentItems: PrivateChecklistItem[],
): PrivateChecklist => {
  const nextChecklist: PrivateChecklist = {
    tripId,
    userId,
    items: currentItems.filter((item) => item.id !== itemId),
    updatedAt: new Date().toISOString(),
  };

  writeStoredPrivateChecklist(nextChecklist);

  return nextChecklist;
};
