/** 依天氣資料的目的地時區顯示成功取得時間，並附上可讀的時區名稱。 */
export const formatWeatherFetchedAt = (fetchedAt: string, timezone?: string): string => {
  const date = new Date(fetchedAt);
  if (!Number.isFinite(date.getTime())) return "時間未知";

  const format = (timeZone: string) => new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "long",
  }).format(date);

  if (!timezone) return "無法取得目的地時區，請通知系統管理員";

  try {
    return format(timezone);
  } catch {
    return "無法取得目的地時區，請通知系統管理員";
  }
};
