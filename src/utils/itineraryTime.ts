interface ItineraryTimeItem {
  time: string;
}

const ITINERARY_TIME_PATTERN = /^(\d{1,2})(?::|：)(\d{2})$/;

const parseItineraryTime = (
  value: string,
): { minutes: number; normalized: string } | null => {
  const match = value.trim().match(ITINERARY_TIME_PATTERN);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour >= 24 || minute >= 60) return null;

  return {
    minutes: hour * 60 + minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
};

export const getItineraryTimeValue = (value: string): number | null =>
  parseItineraryTime(value)?.minutes ?? null;

export const normalizeItineraryTime = (value: string): string => {
  const trimmedValue = value.trim();
  return parseItineraryTime(trimmedValue)?.normalized ?? trimmedValue;
};

export const sortItineraryItemsByTime = <Item extends ItineraryTimeItem>(
  items: Item[],
): Item[] =>
  items
    .map((item, index) => ({ item, index, time: getItineraryTimeValue(item.time) }))
    .sort((left, right) => {
      if (left.time === null && right.time === null) return left.index - right.index;
      if (left.time === null) return 1;
      if (right.time === null) return -1;
      return left.time - right.time || left.index - right.index;
    })
    .map(({ item }) => item);
