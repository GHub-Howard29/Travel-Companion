import type { PrivateChecklist, PrivateChecklistItem } from "../types";

const PRIVATE_CHECKLIST_STORAGE_PREFIX = "travel_companion_private_checklist";
const PRIVATE_CHECKLIST_PENDING_PREFIX =
  "travel_companion_pending_private_checklist";

const getPrivateChecklistStorageKey = (
  tripId: string,
  userEmail: string,
): string => {
  return `${PRIVATE_CHECKLIST_STORAGE_PREFIX}_${tripId}_${userEmail}`;
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
    typeof item.userEmail === "string" &&
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
    typeof checklist.userEmail === "string" &&
    Array.isArray(checklist.items) &&
    checklist.items.every(isPrivateChecklistItem) &&
    typeof checklist.updatedAt === "string"
  );
};

export const readStoredPrivateChecklist = (
  tripId: string,
  userEmail: string,
): PrivateChecklist => {
  const fallback: PrivateChecklist = {
    tripId,
    userEmail,
    items: [],
    updatedAt: "",
  };
  const rawData = localStorage.getItem(
    getPrivateChecklistStorageKey(tripId, userEmail),
  );

  if (!rawData) {
    return fallback;
  }

  try {
    const parsedData = JSON.parse(rawData);

    if (
      !isPrivateChecklist(parsedData) ||
      parsedData.tripId !== tripId ||
      parsedData.userEmail !== userEmail ||
      parsedData.items.some(
        (item) => item.tripId !== tripId || item.userEmail !== userEmail,
      )
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
    getPrivateChecklistStorageKey(checklist.tripId, checklist.userEmail),
    JSON.stringify(checklist),
  );
};

const getPrivateChecklistPendingKey = (
  tripId: string,
  userEmail: string,
): string => `${PRIVATE_CHECKLIST_PENDING_PREFIX}_${tripId}_${userEmail}`;

export const markPrivateChecklistPending = (
  checklist: PrivateChecklist,
): string => {
  const revision = crypto.randomUUID();
  localStorage.setItem(
    getPrivateChecklistPendingKey(checklist.tripId, checklist.userEmail),
    revision,
  );
  return revision;
};

export const readPrivateChecklistPendingRevision = (
  tripId: string,
  userEmail: string,
): string | null =>
  localStorage.getItem(getPrivateChecklistPendingKey(tripId, userEmail));

export const clearPrivateChecklistPending = (
  tripId: string,
  userEmail: string,
  revision: string,
): boolean => {
  const key = getPrivateChecklistPendingKey(tripId, userEmail);
  if (localStorage.getItem(key) !== revision) return false;
  localStorage.removeItem(key);
  return true;
};
