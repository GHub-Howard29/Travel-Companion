import type { TripMeta } from '../types/trip';

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

/**
 * 邏輯 2：自動尋找「最新出發」作為首頁預設值
 * 優先尋找「今天或未來」的行程中最近的那一個；若全部行程都過期了，則選擇離今天最近的歷史行程。
 */
export const findDefaultTrip = (trips: TripMeta[]): TripMeta | null => {
  if (trips.length === 0) return null;

  const now = new Date();
  // 將今天的時間重設為 00:00:00，只比對日期本身
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // 1. 先篩選出「今天或未來」的行程
  const upcomingTrips = trips.filter(trip => {
    const tripDate = new Date(trip.departureDate).getTime();
    return tripDate >= today;
  });

  if (upcomingTrips.length > 0) {
    // 未來行程中，日期「最接近今天（即差值最小、日期最早）」的排在最前面
    return upcomingTrips.sort((a, b) => {
      return new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime();
    })[0];
  }

  // 2. 如果沒有任何未來行程，代表全是歷史行程，選擇「離今天最近（日期最新）」的歷史行程
  return trips.sort((a, b) => {
    return new Date(b.departureDate).getTime() - new Date(a.departureDate).getTime();
  })[0];
};