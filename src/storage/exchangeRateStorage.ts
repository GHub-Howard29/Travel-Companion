import type { TripExchangePurchase } from "../types";

const STORAGE_PREFIX = "travel_companion_exchange_rate";
const getStorageKey = (tripId: string): string => `${STORAGE_PREFIX}_${tripId}`;

const isValidPurchase = (value: unknown): value is TripExchangePurchase => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TripExchangePurchase>;
  return typeof item.id === "string" && typeof item.tripId === "string" &&
    typeof item.foreignCurrency === "string" && typeof item.purchaseDate === "string" &&
    typeof item.twdAmount === "number" && Number.isFinite(item.twdAmount) &&
    typeof item.foreignAmount === "number" && Number.isFinite(item.foreignAmount) &&
    typeof item.createdAt === "string" && typeof item.updatedAt === "string";
};

export const readExchangePurchases = (tripId: string): TripExchangePurchase[] => {
  const raw = localStorage.getItem(getStorageKey(tripId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidPurchase).filter((item) => item.tripId === tripId) : [];
  } catch {
    return [];
  }
};

export const writeExchangePurchases = (tripId: string, purchases: TripExchangePurchase[]): void => {
  localStorage.setItem(getStorageKey(tripId), JSON.stringify(purchases));
};

export const clearExchangePurchases = (tripId: string): void => {
  localStorage.removeItem(getStorageKey(tripId));
};
