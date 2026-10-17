import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItineraryItem } from "../types";
import { getItineraryDayDate } from "../utils/itineraryDate";

export interface WeatherForecastItem {
  request_id: string;
  place_id: string;
  forecast_date: string;
  status: "fresh" | "stale" | "waiting" | "unavailable" | "long_range" | "ineligible";
  fetched_at?: string;
  timezone?: string;
  weather?: {
    weather_code: number | null;
    temperature_2m_max: number | null;
    temperature_2m_min: number | null;
    precipitation_probability_max: number | null;
  };
  message?: string;
}

const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "晴朗", icon: "☀️" },
  1: { label: "大致晴朗", icon: "🌤️" },
  2: { label: "局部多雲", icon: "⛅" },
  3: { label: "陰天", icon: "☁️" },
  45: { label: "有霧", icon: "🌫️" },
  48: { label: "霧凇", icon: "🌫️" },
  51: { label: "輕微毛毛雨", icon: "🌦️" },
  53: { label: "毛毛雨", icon: "🌦️" },
  55: { label: "強毛毛雨", icon: "🌧️" },
  56: { label: "凍毛毛雨", icon: "🌧️" },
  57: { label: "強凍毛毛雨", icon: "🌧️" },
  61: { label: "小雨", icon: "🌧️" },
  63: { label: "中雨", icon: "🌧️" },
  65: { label: "大雨", icon: "🌧️" },
  66: { label: "凍雨", icon: "🌧️" },
  67: { label: "強凍雨", icon: "🌧️" },
  71: { label: "小雪", icon: "🌨️" },
  73: { label: "中雪", icon: "🌨️" },
  75: { label: "大雪", icon: "❄️" },
  77: { label: "雪粒", icon: "🌨️" },
  80: { label: "小陣雨", icon: "🌦️" },
  81: { label: "陣雨", icon: "🌧️" },
  82: { label: "強陣雨", icon: "🌧️" },
  85: { label: "小陣雪", icon: "🌨️" },
  86: { label: "強陣雪", icon: "❄️" },
  95: { label: "雷雨", icon: "⛈️" },
  96: { label: "雷雨伴隨冰雹", icon: "⛈️" },
  99: { label: "強雷雨伴隨冰雹", icon: "⛈️" },
};

export const getWeatherDescription = (code: number | null | undefined) =>
  typeof code === "number" ? WEATHER_CODES[code] ?? { label: "天氣狀況暫無資料", icon: "🌡️" } : { label: "天氣狀況暫無資料", icon: "🌡️" };

export const isLongRangeForecast = (forecastDate: string, timezone?: string): boolean => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const daysAhead = Math.round((Date.parse(`${forecastDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return daysAhead >= 8 && daysAhead <= 10;
};

export const getWeatherReminders = (weather: WeatherForecastItem["weather"]): string[] => {
  if (!weather) return [];
  const reminders: string[] = [];
  const rain = weather.precipitation_probability_max;
  if (typeof rain === "number" && rain >= 60) reminders.push("降雨機率高，建議評估戶外行程");
  else if (typeof rain === "number" && rain >= 40) reminders.push("可能降雨，建議攜帶雨具");
  if (typeof weather.temperature_2m_max === "number" && weather.temperature_2m_max >= 35) reminders.push("高溫，注意防曬、補水並避免長時間曝曬");
  if (typeof weather.temperature_2m_min === "number" && weather.temperature_2m_min <= 10) reminders.push("低溫，注意保暖並準備適當衣物");
  return reminders;
};

const WEATHER_CACHE_KEY = "travel-companion-weather-forecast-v1";

export const loadWeatherForecastCache = (tripId: string): Record<string, WeatherForecastItem> => {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WEATHER_CACHE_KEY) ?? "null") as {
      tripId?: string; items?: Record<string, WeatherForecastItem>;
    } | null;
    if (parsed?.tripId !== tripId || !parsed.items) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed.items).flatMap(([cardId, item]) => {
      const ageMs = item.fetched_at ? now - Date.parse(item.fetched_at) : Number.POSITIVE_INFINITY;
      if (!item.weather || ageMs >= 48 * 3600000) return [];
      return [[cardId, {
        ...item,
        status: ageMs >= 24 * 3600000 ? "stale" as const : "fresh" as const,
      }]];
    }));
  } catch {
    return {};
  }
};

export const storeWeatherForecastResults = (
  tripId: string,
  results: WeatherForecastItem[],
): Record<string, WeatherForecastItem> => {
  const existing = loadWeatherForecastCache(tripId);
  const merged = { ...existing };
  for (const result of results) {
    if (result.weather && result.fetched_at) merged[result.request_id] = result;
    else if ((result.status === "unavailable" || result.status === "waiting") &&
      merged[result.request_id]?.forecast_date === result.forecast_date) merged[result.request_id] = {
      ...merged[result.request_id], message: result.message ?? "更新失敗，顯示上次資料",
    };
    else merged[result.request_id] = result;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ tripId, items: merged }));
    } catch { /* Storage quota or privacy mode must not block itinerary viewing. */ }
  }
  return merged;
};

export const requestTripWeather = async (
  supabase: SupabaseClient,
  tripId: string,
  departureDate: string,
  daysData: Record<string, ItineraryItem[]>,
): Promise<WeatherForecastItem[]> => {
  const items = Object.entries(daysData).flatMap(([dayKey, cards]) => {
    const dayNumber = Number(dayKey);
    if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) return [];
    const forecastDate = getItineraryDayDate(departureDate, dayNumber);
    if (!forecastDate) return [];
    return cards.flatMap((card) => card.showWeather === true && card.id && card.place?.placeId
      ? [{ card_id: card.id, place_id: card.place.placeId, day_number: dayNumber, forecast_date: forecastDate }]
      : []);
  });
  if (!items.length) return [];
  const targets = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.place_id}|${item.forecast_date}`;
    targets.set(key, [...(targets.get(key) ?? []), item]);
  }
  const targetGroups = [...targets.values()];
  const results: WeatherForecastItem[] = [];
  for (let offset = 0; offset < targetGroups.length; offset += 10) {
    const batch = targetGroups.slice(offset, offset + 10).flat();
    const { data, error } = await supabase.functions.invoke("weather-forecast", {
      body: { trip_id: tripId, items: batch },
      timeout: 60_000,
    });
    if (error) throw new Error("天氣資料暫時無法讀取。");
    if (Array.isArray(data?.results)) results.push(...data.results as WeatherForecastItem[]);
  }

  const resultsByRequestId = new Map(results.map((result) => [result.request_id, result]));
  return items.map((item) => {
    const result = resultsByRequestId.get(item.card_id);
    if (result?.place_id === item.place_id && result.forecast_date === item.forecast_date &&
      result.status !== "waiting") return result;
    return {
      request_id: item.card_id,
      place_id: item.place_id,
      forecast_date: item.forecast_date,
      status: "unavailable" as const,
      message: "未取得有效天氣回應，請稍後重試",
    };
  });
};
