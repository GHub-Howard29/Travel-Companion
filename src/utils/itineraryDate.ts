import { Solar } from "lunar-javascript";

/** 以本地日曆日計算 Day 日期，避免 ISO／UTC 轉換造成跨日偏移。 */
export const getItineraryDayDate = (
  departureDateValue: string,
  activeDay: number,
): string | null => {
  if (!Number.isSafeInteger(activeDay) || activeDay < 1) return null;
  const match = departureDateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const departureDate = new Date(year, month - 1, date);
  if (
    !Number.isFinite(departureDate.getTime()) ||
    departureDate.getFullYear() !== year ||
    departureDate.getMonth() !== month - 1 ||
    departureDate.getDate() !== date
  ) return null;

  const dayDate = new Date(year, month - 1, date + activeDay - 1);
  return `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
};

/** 將已驗證的本地日曆日期換為農曆月與日；換算失敗時不阻斷行程瀏覽。 */
export const getLunarDateLabel = (gregorianDate: string): string | null => {
  const match = gregorianDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validatedDate = getItineraryDayDate(gregorianDate, 1);
  if (!validatedDate) return null;

  try {
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  } catch {
    return null;
  }
};
