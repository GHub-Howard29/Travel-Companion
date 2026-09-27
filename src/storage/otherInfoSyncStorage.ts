export type OtherInfoSyncStatus = "pending" | "failed";

export interface OtherInfoSyncState {
  tripId: string;
  revision: string;
  status: OtherInfoSyncStatus;
  updatedAt: string;
  itemIds: string[];
  lastError?: string;
}

const STORAGE_PREFIX = "travel_companion_other_info_sync";

const getStorageKey = (tripId: string) => `${STORAGE_PREFIX}_${tripId}`;

export const readOtherInfoSyncState = (
  tripId: string,
): OtherInfoSyncState | null => {
  const rawValue = localStorage.getItem(getStorageKey(tripId));
  if (!rawValue) return null;

  try {
    const value = JSON.parse(rawValue) as Partial<OtherInfoSyncState>;
    if (
      value.tripId !== tripId ||
      typeof value.revision !== "string" ||
      (value.status !== "pending" && value.status !== "failed") ||
      typeof value.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      ...value,
      itemIds: Array.isArray(value.itemIds)
        ? value.itemIds.filter((itemId): itemId is string => typeof itemId === "string")
        : [],
    } as OtherInfoSyncState;
  } catch {
    return null;
  }
};

export const markOtherInfoSyncPending = (
  tripId: string,
  itemIds: string[] = [],
): OtherInfoSyncState => {
  const current = readOtherInfoSyncState(tripId);
  const state: OtherInfoSyncState = {
    tripId,
    revision: crypto.randomUUID(),
    status: "pending",
    updatedAt: new Date().toISOString(),
    itemIds: Array.from(new Set([...(current?.itemIds ?? []), ...itemIds.filter(Boolean)])),
  };
  localStorage.setItem(getStorageKey(tripId), JSON.stringify(state));
  return state;
};

export const markOtherInfoSyncFailed = (
  tripId: string,
  revision: string,
  error: unknown,
): void => {
  const current = readOtherInfoSyncState(tripId);
  if (!current || current.revision !== revision) return;

  localStorage.setItem(
    getStorageKey(tripId),
    JSON.stringify({
      ...current,
      status: "failed",
      lastError: error instanceof Error ? error.message : String(error),
    } satisfies OtherInfoSyncState),
  );
};

export const clearOtherInfoSyncState = (
  tripId: string,
  revision: string,
): boolean => {
  const current = readOtherInfoSyncState(tripId);
  if (!current || current.revision !== revision) return false;

  localStorage.removeItem(getStorageKey(tripId));
  return true;
};
