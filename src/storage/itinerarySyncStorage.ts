import type { ItineraryItem } from "../types";

export type ItinerarySyncStatus = "synced" | "pending" | "conflict";
export type ItineraryConflictKind =
  | "field"
  | "delete-edit"
  | "move"
  | "order"
  | "legacy-id"
  | "duplicate-id";

export interface ItineraryConflict {
  id: string;
  kind: ItineraryConflictKind;
  cardId?: string;
  dayKey?: string;
  fields: string[];
  baseDayKey?: string | null;
  localDayKey?: string | null;
  cloudDayKey?: string | null;
  baseCard?: ItineraryItem | null;
  localCard?: ItineraryItem | null;
  cloudCard?: ItineraryItem | null;
  baseOrder?: string[];
  localOrder?: string[];
  cloudOrder?: string[];
}

export type ItineraryResolutionChoice =
  | { conflictId: string; kind: "local" | "cloud" }
  | { conflictId: string; kind: "fields"; fields: Record<string, "local" | "cloud"> }
  | { conflictId: string; kind: "delete" | "restore"; dayKey?: string }
  | { conflictId: string; kind: "order"; order: "local" | "cloud" };

export interface ItinerarySyncState {
  tripId: string;
  revision: string;
  status: ItinerarySyncStatus;
  updatedAt: string;
  baseCloudUpdatedAt: string | null;
  baseDaysData: Record<string, ItineraryItem[]>;
  pendingDaysData: Record<string, ItineraryItem[]>;
  conflictCloudUpdatedAt?: string | null;
  conflictCloudDaysData?: Record<string, ItineraryItem[]>;
  conflicts?: ItineraryConflict[];
  resolutionChoices?: ItineraryResolutionChoice[];
  lastError?: string;
}

const STORAGE_PREFIX = "travel_companion_itinerary_sync";

const getStorageKey = (tripId: string) => `${STORAGE_PREFIX}_${tripId}`;

const isDaysData = (value: unknown): value is Record<string, ItineraryItem[]> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value as Record<string, unknown>).every(Array.isArray);

const isConflictArray = (value: unknown): value is ItineraryConflict[] =>
  Array.isArray(value) &&
  value.every((item) =>
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.kind === "string" &&
    Array.isArray(item.fields),
  );

const isResolutionArray = (value: unknown): value is ItineraryResolutionChoice[] =>
  Array.isArray(value) &&
  value.every((item) =>
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.conflictId === "string" &&
    typeof item.kind === "string",
  );

export const readItinerarySyncState = (
  tripId: string,
): ItinerarySyncState | null => {
  const rawValue = localStorage.getItem(getStorageKey(tripId));
  if (!rawValue) return null;

  try {
    const value = JSON.parse(rawValue) as Partial<ItinerarySyncState>;
    if (
      value.tripId !== tripId ||
      typeof value.revision !== "string" ||
      !value.revision ||
      (value.status !== "synced" && value.status !== "pending" && value.status !== "conflict") ||
      typeof value.updatedAt !== "string" ||
      !(value.baseCloudUpdatedAt === null || typeof value.baseCloudUpdatedAt === "string") ||
      !isDaysData(value.baseDaysData) ||
      !isDaysData(value.pendingDaysData) ||
      (value.conflictCloudDaysData !== undefined && !isDaysData(value.conflictCloudDaysData)) ||
      (value.conflicts !== undefined && !isConflictArray(value.conflicts)) ||
      (value.resolutionChoices !== undefined && !isResolutionArray(value.resolutionChoices))
    ) {
      return null;
    }

    // 向前相容舊版 state：pending/synced state 沒有結構化欄位時補空陣列。
    return {
      ...value,
      conflicts: value.conflicts ?? [],
      resolutionChoices: value.resolutionChoices ?? [],
    } as ItinerarySyncState;
  } catch {
    return null;
  }
};

export const writeItinerarySyncState = (state: ItinerarySyncState): void => {
  localStorage.setItem(getStorageKey(state.tripId), JSON.stringify({
    ...state,
    conflicts: state.conflicts ?? [],
    resolutionChoices: state.resolutionChoices ?? [],
  }));
};

export const clearItinerarySyncState = (
  tripId: string,
  revision?: string,
): boolean => {
  const current = readItinerarySyncState(tripId);
  if (!current || (revision && current.revision !== revision)) return false;
  localStorage.removeItem(getStorageKey(tripId));
  return true;
};
