import type {
  ConfirmedPlace,
  ItineraryItem,
  SavedTravelEstimate,
  TransitVehicle,
  TravelMode,
  TripDetail,
} from "../types";
import { getItineraryTimeValue } from "./itineraryTime.ts";

export type TravelTimeWarning =
  | { type: "conflict" }
  | { type: "insufficient"; shortfallMinutes: number }
  | null;

export const isConfirmedPlace = (
  place: ConfirmedPlace | null | undefined,
): place is ConfirmedPlace =>
  Boolean(
    place &&
      typeof place.placeId === "string" &&
      place.placeId.trim().length >= 10,
  );

export const getPlaceKey = (place: ConfirmedPlace): string =>
  `place:${place.placeId.trim()}`;

const isTravelMode = (value: unknown): value is TravelMode =>
  value === "drive" || value === "walk" || value === "transit";

export const getPreferredTravelMode = (
  origin: ItineraryItem,
): TravelMode => {
  if (isTravelMode(origin.travelModeToNext)) return origin.travelModeToNext;
  if (isTravelMode(origin.travelToNext?.mode)) return origin.travelToNext.mode;
  return "drive";
};

export const isFlightConnection = (
  origin: ItineraryItem,
  destination: ItineraryItem,
): boolean =>
  origin.travelKind === "flight" && destination.travelKind === "flight";

export const hasDistinctConfirmedPlaces = (
  origin: ItineraryItem,
  destination: ItineraryItem,
): boolean =>
  isConfirmedPlace(origin.place) &&
  isConfirmedPlace(destination.place) &&
  getPlaceKey(origin.place) !== getPlaceKey(destination.place);

/**
 * 找出剛儲存的活動前後，已具備兩個有效地點但尚無可用估算的交通區段。
 * 回傳值是每個區段起點在 items 中的索引。
 */
export const getAdjacentTravelOriginIndexesNeedingEstimate = (
  items: ItineraryItem[],
  changedIndex: number,
): number[] =>
  [changedIndex - 1, changedIndex].filter((originIndex) => {
    const origin = items[originIndex];
    const destination = items[originIndex + 1];
    return Boolean(
      origin &&
        destination &&
        hasDistinctConfirmedPlaces(origin, destination) &&
        !isFlightConnection(origin, destination) &&
        !getSavedTravelEstimate(origin, destination),
    );
  });

export const getSavedTravelEstimate = (
  origin: ItineraryItem,
  destination: ItineraryItem,
): SavedTravelEstimate | null => {
  if (
    !isConfirmedPlace(origin.place) ||
    !isConfirmedPlace(destination.place) ||
    isFlightConnection(origin, destination)
  ) {
    return null;
  }

  const estimate = origin.travelToNext;
  if (!estimate) return null;
  const expiresAt = new Date(estimate.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  if (
    estimate.mode === "transit" &&
    estimate.departureTimeBasis !== (origin.departureTime || origin.time)
  ) {
    return null;
  }

  return estimate.originKey === getPlaceKey(origin.place) &&
    estimate.destinationKey === getPlaceKey(destination.place)
    ? estimate
    : null;
};

export const getTravelTimeWarning = (
  origin: ItineraryItem,
  destination: ItineraryItem,
  estimate: SavedTravelEstimate | null,
): TravelTimeWarning => {
  const departure = getItineraryTimeValue(origin.departureTime || origin.time);
  const arrival = getItineraryTimeValue(destination.time);
  if (departure === null || arrival === null) return null;
  if (departure > arrival) return { type: "conflict" };
  if (!estimate) return null;

  const availableSeconds = (arrival - departure) * 60;
  if (availableSeconds >= estimate.durationSeconds) return null;

  return {
    type: "insufficient",
    shortfallMinutes: Math.max(
      1,
      Math.ceil((estimate.durationSeconds - availableSeconds) / 60),
    ),
  };
};

export const formatTravelDuration = (durationSeconds: number): string => {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `${minutes} 分鐘`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小時 ${remainder} 分鐘` : `${hours} 小時`;
};

export const formatTravelDistance = (distanceMeters: number): string => {
  if (distanceMeters < 1_000) return `${Math.max(1, Math.round(distanceMeters))} 公尺`;
  return `${(distanceMeters / 1_000).toFixed(distanceMeters < 10_000 ? 1 : 0)} 公里`;
};

export const getTravelModeLabel = (mode: TravelMode): string =>
  ({ drive: "開車", walk: "步行", transit: "大眾運輸" })[mode];

export const getTransitVehicleLabel = (
  vehicle: TransitVehicle | undefined,
): string =>
  ({
    bus: "公車",
    rail: "鐵路",
    subway: "捷運",
    tram: "路面電車",
    ferry: "渡輪",
    other: "大眾運輸",
  })[vehicle ?? "other"];

/** 讀取與再次同步時移除已超過 Google Maps 允許快取期限的交通結果。 */
export const removeExpiredTravelEstimates = (
  content: TripDetail["content"],
  now = Date.now(),
): TripDetail["content"] => {
  let changed = false;
  const daysData = Object.fromEntries(
    Object.entries(content.daysData).map(([day, items]) => [
      day,
      items.map((item) => {
        if (!item.travelToNext) return item;
        const preferredMode = getPreferredTravelMode(item);
        const itemWithPreference = item.travelModeToNext === preferredMode
          ? item
          : (() => {
              changed = true;
              return { ...item, travelModeToNext: preferredMode };
            })();
        const expiresAt = new Date(item.travelToNext.expiresAt).getTime();
        if (Number.isFinite(expiresAt) && expiresAt > now) return itemWithPreference;
        changed = true;
        const nextItem = { ...itemWithPreference };
        delete nextItem.travelToNext;
        return nextItem;
      }),
    ]),
  );

  return changed ? { ...content, daysData } : content;
};
