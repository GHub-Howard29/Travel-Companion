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

type ItineraryDayButtonState = {
  isActive: boolean;
  isToday: boolean;
};

/**
 * 日期按鈕配色規則：少於三天行程全白；三天以上行程保留首日／中間日底色，
 * 末日白底。只有目前選取日使用紅框；今天若未選取，改用低調灰色外環，
 * 避免今天與目前選取日同時出現紅框。底色不隨選取改變。
 */
export const getItineraryDayButtonClasses = (
  days: number[],
  index: number,
  { isActive, isToday }: ItineraryDayButtonState,
): string => {
  const tone = getItineraryDayTone(days, index);
  const isShortTrip = days.length < 3;
  const baseClass = isShortTrip
    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    : {
        first: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
        middle: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        last: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      }[tone];
  const emphasisClass = isActive
    ? "!border-2 !border-rose-700"
    : isToday
      ? "ring-1 ring-slate-300"
      : "";
  return `${baseClass} ${emphasisClass}`.trim();
};
