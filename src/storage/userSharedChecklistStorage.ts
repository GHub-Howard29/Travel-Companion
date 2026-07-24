import type { ChecklistItem } from "../types";

const storageKey = (tripId: string, userEmail: string) =>
  `travel_companion_user_shared_checklist_${tripId}_${userEmail.trim().toLowerCase()}`;

export const readUserSharedChecklist = (tripId: string, userEmail: string, fallback: ChecklistItem[]): ChecklistItem[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(tripId, userEmail)) ?? "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
};

export const writeUserSharedChecklist = (tripId: string, userEmail: string, items: ChecklistItem[]): void => {
  localStorage.setItem(storageKey(tripId, userEmail), JSON.stringify(items));
};
