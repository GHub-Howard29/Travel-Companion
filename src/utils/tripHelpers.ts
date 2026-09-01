import type { ItineraryItem, TripDetail, TripMeta } from "../types/trip";

const TAIPEI_TIME_ZONE = "Asia/Taipei";
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const taipeiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TAIPEI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const toTaipeiDateString = (date: Date): string => {
  const parts = Object.fromEntries(
    taipeiDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addCalendarDays = (dateValue: string, days: number): string => {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return dateValue;

  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};

/**
 * 邏輯 1：左側選單排序（由新到舊 / 由近到遠）
 * 將所有行程依照出發日期排序，最未來的日期排在最上面。
 */
export const sortTripsByDateDesc = (trips: TripMeta[]): TripMeta[] => {
  return [...trips].sort((a, b) => {
    const dateA = new Date(a.departureDate).getTime();
    const dateB = new Date(b.departureDate).getTime();
    return dateB - dateA; // 降冪排序：由新到舊
  });
};

const toDateOnlyTime = (dateValue: string): number =>
  Date.parse(`${dateValue.slice(0, 10)}T00:00:00Z`);

const getTripEndTime = (trip: TripMeta): number => {
  const departureTime = toDateOnlyTime(trip.departureDate);
  const safeDayCount = Math.max(1, trip.dayCount ?? 1);
  return departureTime + (safeDayCount - 1) * DAY_IN_MILLISECONDS;
};

export const getTripEndDate = (trip: TripMeta): string =>
  addCalendarDays(trip.departureDate.slice(0, 10), Math.max(1, trip.dayCount ?? 1) - 1);

export const getTripLockDate = (trip: TripMeta): string =>
  addCalendarDays(getTripEndDate(trip), 1);

/** 台灣日期進入行程結束翌日時，視為歷史行程。 */
export const isHistoricalTrip = (trip: TripMeta, now = new Date()): boolean => {
  return getTripEndDate(trip) < toTaipeiDateString(now);
};

/** 距離下一個台灣曆日 00:00 的毫秒數。台灣時區固定為 UTC+8，無日光節約時間。 */
export const getMillisecondsUntilNextTaipeiDay = (
  now = new Date(),
): number => {
  const [year, month, day] = toTaipeiDateString(now).split("-").map(Number);
  const nextTaipeiMidnight = Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000;
  return Math.max(0, nextTaipeiMidnight - now.getTime());
};

export const formatTripDate = (dateValue: string): string => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return year && month && day ? `${year}/${month}/${day}` : dateValue;
};

export interface RemovedDayImpact {
  day: number;
  cardCount: number;
  routeCount: number;
}

const hasRouteInformation = (item: ItineraryItem): boolean =>
  Boolean(item.travelModeToNext || item.travelToNext);

export const getRemovedDayImpacts = (
  detail: TripDetail,
  nextDayCount: number,
): RemovedDayImpact[] => {
  const currentDayCount = detail.content.days.length;
  if (nextDayCount >= currentDayCount) return [];

  return Array.from(
    { length: currentDayCount - nextDayCount },
    (_, index) => nextDayCount + index + 1,
  ).map((day) => {
    const items = detail.content.daysData[String(day)] ?? [];
    return {
      day,
      cardCount: items.length,
      routeCount: items.filter(hasRouteInformation).length,
    };
  });
};

/** 回傳旅程今天所對應的 Day；不在旅程期間時維持 Day 1。 */
export const getDefaultActiveDay = (
  departureDate: string,
  days: number[],
  now = new Date(),
): number => {
  const departureTime = toDateOnlyTime(departureDate);
  const today = toDateOnlyTime(toTaipeiDateString(now));
  const day = Math.floor((today - departureTime) / DAY_IN_MILLISECONDS) + 1;

  return days.includes(day) ? day : days[0] ?? 1;
};

/**
 * 邏輯 2：自動尋找「最新出發」作為首頁預設值
 * 優先尋找今天落在旅程日期區間內的旅程。
 * 若沒有，且未來還有旅程，選擇最接近今天的未來旅程。
 * 若未來完全沒有旅程，選擇離今天最近的歷史旅程。
 */
export const findDefaultTrip = (trips: TripMeta[]): TripMeta | null => {
  if (trips.length === 0) return null;

  const today = toDateOnlyTime(toTaipeiDateString(new Date()));

  const activeTrips = trips.filter((trip) => {
    const departureTime = toDateOnlyTime(trip.departureDate);
    return departureTime <= today && today <= getTripEndTime(trip);
  });

  if (activeTrips.length > 0) {
    return activeTrips.sort((a, b) => {
      return toDateOnlyTime(a.departureDate) - toDateOnlyTime(b.departureDate);
    })[0];
  }

  const upcomingTrips = trips.filter((trip) => {
    return toDateOnlyTime(trip.departureDate) > today;
  });

  if (upcomingTrips.length > 0) {
    return upcomingTrips.sort((a, b) => {
      return toDateOnlyTime(a.departureDate) - toDateOnlyTime(b.departureDate);
    })[0];
  }

  return trips.sort((a, b) => {
    return getTripEndTime(b) - getTripEndTime(a);
  })[0];
};
