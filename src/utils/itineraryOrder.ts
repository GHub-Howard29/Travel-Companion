import type { ItineraryItem, TripDetail } from "../types";
import { getItineraryTimeValue } from "./itineraryTime.ts";

export type ItineraryIdFactory = () => string;

export const createItineraryItemId: ItineraryIdFactory = () =>
  globalThis.crypto?.randomUUID?.() ??
  `itinerary-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const ensureItineraryDaysDataIds = (
  daysData: TripDetail["content"]["daysData"],
  createId: ItineraryIdFactory = createItineraryItemId,
): TripDetail["content"]["daysData"] => {
  const usedIds = new Set<string>();

  return Object.fromEntries(
    Object.entries(daysData).map(([day, items]) => [
      day,
      items.map((item) => {
        const candidate = item.id?.trim();
        if (candidate && !usedIds.has(candidate)) {
          usedIds.add(candidate);
          return candidate === item.id ? item : { ...item, id: candidate };
        }

        let id = createId();
        while (!id || usedIds.has(id)) id = createId();
        usedIds.add(id);
        return { ...item, id };
      }),
    ]),
  );
};

const withoutStaleTravelEstimate = (item: ItineraryItem): ItineraryItem => {
  if (!item.travelToNext) return item;
  const nextItem = { ...item };
  delete nextItem.travelToNext;
  return nextItem;
};

/** 清除重新排列或插入後，目的地已不是原相鄰卡片的路線快取。 */
export const invalidateChangedTravelDestinations = (
  before: ItineraryItem[],
  after: ItineraryItem[],
): ItineraryItem[] => {
  const previousDestinationById = new Map<string, string | null>();
  before.forEach((item, index) => {
    if (item.id) previousDestinationById.set(item.id, before[index + 1]?.id ?? null);
  });

  return after.map((item, index) => {
    if (!item.id || !previousDestinationById.has(item.id)) return item;
    return previousDestinationById.get(item.id) === (after[index + 1]?.id ?? null)
      ? item
      : withoutStaleTravelEstimate(item);
  });
};

export const reorderItineraryItems = (
  items: ItineraryItem[],
  activeId: string,
  overId: string,
): ItineraryItem[] => {
  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === overId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return invalidateChangedTravelDestinations(items, nextItems);
};

export const moveItineraryItem = (
  items: ItineraryItem[],
  itemId: string,
  direction: -1 | 1,
): ItineraryItem[] => {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const target = items[currentIndex + direction];
  return currentIndex < 0 || !target?.id
    ? items
    : reorderItineraryItems(items, itemId, target.id);
};

export const createItineraryCopy = (
  source: ItineraryItem,
  createId: ItineraryIdFactory = createItineraryItemId,
): ItineraryItem => {
  const copy = { ...source, id: createId() };
  delete copy.travelModeToNext;
  delete copy.travelToNext;
  return copy;
};

/** 依到達時間插入；同時間放在既有卡片之後，無有效時間則放在最後。 */
export const insertItineraryCopyByTime = (
  items: ItineraryItem[],
  copy: ItineraryItem,
): ItineraryItem[] => {
  const copyTime = getItineraryTimeValue(copy.time);
  const insertionIndex = copyTime === null
    ? items.length
    : items.findIndex((item) => {
        const itemTime = getItineraryTimeValue(item.time);
        return itemTime === null || itemTime > copyTime;
      });
  const targetIndex = insertionIndex < 0 ? items.length : insertionIndex;
  const nextItems = [...items];
  nextItems.splice(targetIndex, 0, copy);
  return invalidateChangedTravelDestinations(items, nextItems);
};
