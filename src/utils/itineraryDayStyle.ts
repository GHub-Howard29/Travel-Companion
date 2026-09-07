export type ItineraryDayTone = "first" | "middle" | "last";

/** 最後一天優先，讓單日行程也能明確表示為終日。 */
export const getItineraryDayTone = (
  days: number[],
  index: number,
): ItineraryDayTone => {
  if (index === days.length - 1) return "last";
  if (index === 0) return "first";
  return "middle";
};
