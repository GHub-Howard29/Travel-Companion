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
  latitude?: number;
  longitude?: number;
  source_url?: string;
  weather?: {
    weather_code: number | null;
    temperature_2m_max: number | null;
    temperature_2m_min: number | null;
    precipitation_probability_max: number | null;
  };
  message?: string;
  /** Prevent further requests after destination-local arrival eligibility has expired. */
  refresh_stopped?: boolean;
  /** Arrival time associated with a terminal eligibility result, used to invalidate it after edits. */
  arrival_time?: string;
  diagnostic_code?: string;
  trace_id?: string;
}

const OPEN_METEO_DOCS_ORIGIN = "open-meteo.com";
const OPEN_METEO_DAILY_FIELDS = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";

const isCoordinatePair = (latitude: unknown, longitude: unknown): latitude is number =>
  typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
  typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

export const getWeathernewsForecastUrl = (weather?: Pick<WeatherForecastItem, "latitude" | "longitude">): string | null => {
  if (!weather || !isCoordinatePair(weather.latitude, weather.longitude)) return null;
  return `https://weathernews.jp/onebox/${weather.latitude}/${weather.longitude}/`;
};

const isTrustedOpenMeteoUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === OPEN_METEO_DOCS_ORIGIN;
  } catch {
    return false;
  }
};

/** Build the exact Open-Meteo documentation query used by the weather request. */
export const getOpenMeteoSourceUrl = (weather?: Pick<WeatherForecastItem, "forecast_date" | "latitude" | "longitude" | "source_url">): string | null => {
  if (isTrustedOpenMeteoUrl(weather?.source_url)) return weather.source_url;
  if (!weather || !isCoordinatePair(weather.latitude, weather.longitude) || !/^\d{4}-\d{2}-\d{2}$/.test(weather.forecast_date)) {
    return null;
  }
  const url = new URL("https://open-meteo.com/en/docs");
  url.search = new URLSearchParams({
    latitude: String(weather.latitude), longitude: String(weather.longitude), daily: OPEN_METEO_DAILY_FIELDS,
    start_date: weather.forecast_date, end_date: weather.forecast_date, timezone: "auto", temperature_unit: "celsius",
    models: "best_match", cell_selection: "land",
  }).toString();
  return url.toString();
};

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

/** Use a familiar geographic label instead of a technical time-zone name. */
export const getWeatherTimezoneLabel = (timezone?: string): string => {
  if (!timezone) return "目的地時間";
  const labels: Record<string, string> = {
    "Asia/Taipei": "台北時間",
    "Asia/Shanghai": "北京時間",
    "Asia/Tokyo": "東京時間",
    "Asia/Seoul": "首爾時間",
    "Asia/Hong_Kong": "香港時間",
    "Asia/Singapore": "新加坡時間",
    "Asia/Bangkok": "曼谷時間",
    "Asia/Kuala_Lumpur": "吉隆坡時間",
    "Asia/Manila": "馬尼拉時間",
    "Asia/Jakarta": "雅加達時間",
    "Europe/London": "倫敦時間",
    "Europe/Paris": "巴黎時間",
    "Europe/Rome": "羅馬時間",
    "Europe/Berlin": "柏林時間",
    "Europe/Madrid": "馬德里時間",
    "Europe/Amsterdam": "阿姆斯特丹時間",
    "Australia/Sydney": "雪梨時間",
    "Australia/Melbourne": "墨爾本時間",
    "Pacific/Auckland": "奧克蘭時間",
    "America/New_York": "美東時間",
    "America/Detroit": "美東時間",
    "America/Chicago": "美中時間",
    "America/Denver": "美山時間",
    "America/Los_Angeles": "美西時間",
    "America/Vancouver": "加拿大西岸時間",
  };
  if (labels[timezone]) return labels[timezone];
  const city = timezone.split("/").at(-1)?.replaceAll("_", " ").trim();
  return city ? `${city}時間` : "目的地時間";
};

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
const WEATHER_REQUEST_RETRY_DELAY_MS = 1_000;
const weatherRequestsInFlight = new Map<string, Promise<WeatherForecastItem[]>>();

/** Destination-local eligibility and remote-cache availability must be checked by the Edge Function. */
const waitForWeatherRetry = () => new Promise<void>((resolve) => {
  globalThis.setTimeout(resolve, WEATHER_REQUEST_RETRY_DELAY_MS);
});

export const loadWeatherForecastCache = (tripId: string): Record<string, WeatherForecastItem> => {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WEATHER_CACHE_KEY) ?? "null") as {
      tripId?: string; items?: Record<string, WeatherForecastItem>;
    } | null;
    if (parsed?.tripId !== tripId || !parsed.items) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed.items).flatMap(([cardId, item]): [string, WeatherForecastItem][] => {
      const ageMs = item.fetched_at ? now - Date.parse(item.fetched_at) : Number.POSITIVE_INFINITY;
      // Keep terminal eligibility even after weather values age out, so reopening the itinerary
      // never repeats a request for the same date/place/arrival time.
      if (item.refresh_stopped) {
        if (item.weather && item.fetched_at && ageMs < 48 * 3600000) return [[cardId, {
          ...item,
          status: ageMs >= 24 * 3600000 ? "stale" as const : "fresh" as const,
          message: "預報已超過有效期限，目前顯示的是歷史資料",
        }]];
        return [[cardId, {
          ...item,
          status: "ineligible" as const,
          weather: undefined,
          fetched_at: undefined,
          message: "預報已超過有效期限，系統已停止更新天氣資料",
        }]];
      }
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
    else if (result.status === "ineligible" && merged[result.request_id]?.forecast_date === result.forecast_date &&
      merged[result.request_id]?.weather && merged[result.request_id]?.fetched_at) merged[result.request_id] = {
      ...merged[result.request_id],
      refresh_stopped: true,
      arrival_time: result.arrival_time ?? merged[result.request_id].arrival_time,
      message: "預報已超過有效期限，目前顯示的是歷史資料",
    };
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

const requestTripWeatherOnce = async (
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
      ? [{
        card_id: card.id, place_id: card.place.placeId, day_number: dayNumber, forecast_date: forecastDate,
        arrival_time: card.time ?? "",
      }]
      : []);
  });
  if (!items.length) return [];

  const cached = loadWeatherForecastCache(tripId);
  const stoppedItems = items.filter((item) => {
    const previous = cached[item.card_id];
    const stopMatches = previous?.refresh_stopped === true && previous.forecast_date === item.forecast_date &&
      previous.place_id === item.place_id && previous.arrival_time === item.arrival_time;
    // A terminal local cache only suppresses a request while its weather remains displayable.
    // Once local weather expires, ask the Edge Function to re-check destination eligibility and remote cache.
    const cacheAgeMs = previous?.fetched_at ? Date.now() - Date.parse(previous.fetched_at) : Number.POSITIVE_INFINITY;
    return Boolean(stopMatches && previous?.weather && previous.fetched_at && cacheAgeMs < 48 * 3600000);
  });
  const stoppedIds = new Set(stoppedItems.map((item) => item.card_id));
  const stoppedResults = stoppedItems.map((item) => cached[item.card_id]);
  const pendingItems = items.filter((item) => !stoppedIds.has(item.card_id));
  // Let the Edge Function check destination-local eligibility and any usable remote cache before disabling a card.
  const activeItems = pendingItems;
  if (!activeItems.length) return stoppedResults;

  const targets = new Map<string, typeof activeItems>();
  for (const item of activeItems) {
    const key = `${item.place_id}|${item.forecast_date}`;
    targets.set(key, [...(targets.get(key) ?? []), item]);
  }
  const targetGroups = [...targets.values()];
  const results: WeatherForecastItem[] = [];
  for (let offset = 0; offset < targetGroups.length; offset += 10) {
    const batch = targetGroups.slice(offset, offset + 10).flat();
    const { data, error } = await supabase.functions.invoke("weather-forecast", {
      body: { trip_id: tripId, items: batch },
      timeout: 45_000,
    });
    if (error) {
      console.warn("天氣 Edge Function 呼叫失敗。", {
        error_code: "WEATHER_FUNCTION_INVOKE_FAILED",
        http_status: error.context instanceof Response ? error.context.status : null,
      });
      results.push(...batch.map((item) => ({
        request_id: item.card_id,
        place_id: item.place_id,
        forecast_date: item.forecast_date,
        status: "unavailable" as const,
        message: "天氣服務逾時，請稍後重試",
        diagnostic_code: "WEATHER_FUNCTION_INVOKE_FAILED",
      })));
      continue;
    }
    if (Array.isArray(data?.results)) results.push(...data.results as WeatherForecastItem[]);
  }

  const resultsByRequestId = new Map(results.map((result) => [result.request_id, result]));
  return [...stoppedResults, ...activeItems.map((item) => {
    const result = resultsByRequestId.get(item.card_id);
    if (result?.place_id === item.place_id && result.forecast_date === item.forecast_date) return {
      ...result,
      arrival_time: item.arrival_time,
      ...(result.status === "ineligible" ? { refresh_stopped: true } : {}),
    };
    return {
      request_id: item.card_id,
      place_id: item.place_id,
      forecast_date: item.forecast_date,
      status: "unavailable" as const,
      arrival_time: item.arrival_time,
      message: "未取得有效天氣回應，請稍後重試",
    };
  })];
};

/**
 * 同一份 Trip 快照只允許一個天氣請求；複製卡片造成的連續 render 不得重複打同一批資料。
 * Edge Function 回報同步／租約忙碌或卡片尚未同步時，只對該等候項目做一次短暫重試；已完成或已停止更新的卡片不重送。
 */
export const requestTripWeather = (
  supabase: SupabaseClient,
  tripId: string,
  departureDate: string,
  daysData: Record<string, ItineraryItem[]>,
): Promise<WeatherForecastItem[]> => {
  const fingerprint = Object.entries(daysData)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([dayKey, cards]) => cards.map((card) => {
      const forecastDate = getItineraryDayDate(departureDate, Number(dayKey));
      return `${dayKey}:${card.id ?? ""}:${card.place?.placeId ?? ""}:${forecastDate ?? ""}:${card.time ?? ""}:${card.showWeather ? "1" : "0"}`;
    }))
    .sort()
    .join(";");
  const requestKey = `${tripId}|${departureDate}|${fingerprint}`;
  const hasWeatherTargets = Object.values(daysData).some((cards) => cards.some((card) =>
    card.showWeather === true && Boolean(card.id) && Boolean(card.place?.placeId),
  ));
  if (!hasWeatherTargets) return Promise.resolve([]);
  const existing = weatherRequestsInFlight.get(requestKey);
  if (existing) return existing;

  const request = (async () => {
    const firstResults = await requestTripWeatherOnce(supabase, tripId, departureDate, daysData);
    const retryIds = new Set(firstResults.filter((result) =>
      result.status === "waiting" || result.diagnostic_code === "WEATHER_CARD_NOT_FOUND",
    ).map((result) => result.request_id));
    const finalResults = retryIds.size > 0
      ? await (async () => {
        await waitForWeatherRetry();
        const retryDaysData = Object.fromEntries(Object.entries(daysData).map(([dayKey, cards]) => [
          dayKey, cards.filter((card) => Boolean(card.id && retryIds.has(card.id))),
        ]).filter(([, cards]) => cards.length > 0));
        const retryResults = await requestTripWeatherOnce(supabase, tripId, departureDate, retryDaysData);
        return [
          ...firstResults.filter((result) => !retryIds.has(result.request_id)),
          ...retryResults,
        ];
      })()
      : firstResults;

    // A second lease-busy response has no automatic retry scheduled by this effect; never leave the UI in a permanent waiting state.
    return finalResults.map((result) => result.status === "waiting" ? {
      ...result,
      status: "unavailable" as const,
      message: "天氣資料仍在更新，請稍後重新開啟行程",
      diagnostic_code: result.diagnostic_code ?? "WEATHER_REFRESH_IN_PROGRESS",
    } : result);
  })();
  weatherRequestsInFlight.set(requestKey, request);
  const clearRequest = () => {
    if (weatherRequestsInFlight.get(requestKey) === request) weatherRequestsInFlight.delete(requestKey);
  };
  void request.then(clearRequest, clearRequest);
  return request;
};
