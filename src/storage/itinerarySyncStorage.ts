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
  /** Legacy timestamp retained for diagnostics only; never used as CAS version. */
  baseCloudUpdatedAt: string | null;
  /** Trusted itinerary version from tc_read_itinerary_version. */
  baseCloudVersion: number | null;
  baseDaysData: Record<string, ItineraryItem[]>;
  pendingDaysData: Record<string, ItineraryItem[]>;
  conflictCloudUpdatedAt?: string | null;
  conflictCloudVersion?: number | null;
  conflictCloudDaysData?: Record<string, ItineraryItem[]>;
  conflicts?: ItineraryConflict[];
  resolutionChoices?: ItineraryResolutionChoice[];
  recoveryError?: boolean;
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
  const recoveryErrorState = (reason: string): ItinerarySyncState => ({
    tripId, revision: "recovery-error", status: "conflict", updatedAt: new Date().toISOString(),
    baseCloudUpdatedAt: null, baseCloudVersion: null, baseDaysData: {}, pendingDaysData: {},
    conflicts: [], resolutionChoices: [], recoveryError: true,
    lastError: `原始 Pending 資料已保留，但無法解析或驗證（${reason}）；禁止覆寫，需進行 recovery。`,
  });
  try {
    const value = JSON.parse(rawValue) as Partial<ItinerarySyncState>;
    if (
      value.tripId !== tripId || typeof value.revision !== "string" || !value.revision ||
      (value.status !== "synced" && value.status !== "pending" && value.status !== "conflict") ||
      typeof value.updatedAt !== "string" ||
      !(value.baseCloudUpdatedAt === null || typeof value.baseCloudUpdatedAt === "string") ||
      !isDaysData(value.baseDaysData) || !isDaysData(value.pendingDaysData) ||
      (value.baseCloudVersion !== undefined && !(value.baseCloudVersion === null || (Number.isSafeInteger(value.baseCloudVersion) && value.baseCloudVersion >= 1))) ||
      (value.conflictCloudVersion !== undefined && !(value.conflictCloudVersion === null || (Number.isSafeInteger(value.conflictCloudVersion) && value.conflictCloudVersion >= 1))) ||
      (value.conflictCloudDaysData !== undefined && !isDaysData(value.conflictCloudDaysData)) ||
      (value.conflicts !== undefined && !isConflictArray(value.conflicts)) ||
      (value.resolutionChoices !== undefined && !isResolutionArray(value.resolutionChoices))
    ) return recoveryErrorState("shape validation failed");
    return { ...value, conflicts: value.conflicts ?? [], resolutionChoices: value.resolutionChoices ?? [] } as ItinerarySyncState;
  } catch {
    return recoveryErrorState("JSON parse failed");
  }
};

export const writeItinerarySyncState = (state: ItinerarySyncState): void => {
  if (state.recoveryError) throw new Error(state.lastError ?? "Pending recovery error; original data is protected.");
  const existing = readItinerarySyncState(state.tripId);
  if (existing?.recoveryError) throw new Error(existing.lastError ?? "Pending recovery error; original data is protected.");
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
