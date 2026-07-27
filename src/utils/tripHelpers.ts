import type { TripMeta } from "../types/trip";

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

const toDateOnlyTime = (dateValue: string): number => {
  const date = new Date(dateValue);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const getTripEndTime = (trip: TripMeta): number => {
  const departureTime = toDateOnlyTime(trip.departureDate);
  const safeDayCount = Math.max(1, trip.dayCount ?? 1);
  return departureTime + (safeDayCount - 1) * 24 * 60 * 60 * 1000;
};

/** 回傳旅程今天所對應的 Day；不在旅程期間時維持 Day 1。 */
export const getDefaultActiveDay = (
  departureDate: string,
  days: number[],
  now = new Date(),
): number => {
  const departureTime = toDateOnlyTime(departureDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = Math.floor((today - departureTime) / (24 * 60 * 60 * 1000)) + 1;

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

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

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
