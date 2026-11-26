import type { HourlyWeatherData } from "./interval-summary.ts";
import { destinationDayUtcWindow } from "./timezone-utc.ts";

export const OPEN_METEO_HOURLY_FIELDS =
  "temperature_2m,precipitation_probability,weather_code";

export interface OpenMeteoHourlyForecast {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly_data: HourlyWeatherData;
  source_url: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isValidTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
};

const numberOrNullArray = (value: unknown): Array<number | null> | null => {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => item === null || (typeof item === "number" && Number.isFinite(item)))) {
    return null;
  }
  return value as Array<number | null>;
};

const makeUtcHour = (epoch: number): string =>
  new Date(epoch * 1000).toISOString().slice(0, 16);

export const makeOpenMeteoHourlyUrl = (
  latitude: number,
  longitude: number,
  forecastDate: string,
  destinationTimezone: string,
): URL => {
  const { startEpoch, endEpoch } = destinationDayUtcWindow(forecastDate, destinationTimezone);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  // Explicit hourly bounds replace relative windows; Open-Meteo rejects those options together.
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: OPEN_METEO_HOURLY_FIELDS,
    start_hour: makeUtcHour(startEpoch),
    end_hour: makeUtcHour(endEpoch),
    timezone: "UTC",
    timeformat: "unixtime",
    temperature_unit: "celsius",
    models: "best_match",
    cell_selection: "land",
  }).toString();
  return url;
};

export const makeOpenMeteoHourlySourceUrl = (
  latitude: number,
  longitude: number,
  forecastDate: string,
  destinationTimezone: string,
): string => {
  const { startEpoch, endEpoch } = destinationDayUtcWindow(forecastDate, destinationTimezone);
  const url = new URL("https://open-meteo.com/en/docs");
  // Explicit hourly bounds replace relative windows; Open-Meteo rejects those options together.
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: OPEN_METEO_HOURLY_FIELDS,
    start_hour: makeUtcHour(startEpoch),
    end_hour: makeUtcHour(endEpoch),
    timezone: "UTC",
    timeformat: "unixtime",
    temperature_unit: "celsius",
    models: "best_match",
    cell_selection: "land",
  }).toString();
  return url.toString();
};

export const validateOpenMeteoHourlyPayload = (
  payload: unknown,
  latitude: number,
  longitude: number,
  forecastDate: string,
  destinationTimezone: string,
): OpenMeteoHourlyForecast => {
  if (!isRecord(payload) || typeof payload.timezone !== "string" ||
    !["GMT", "UTC"].includes(payload.timezone) || !isValidTimezone(destinationTimezone) ||
    !isRecord(payload.hourly)) {
    throw new Error("OPEN_METEO_INVALID_RESPONSE");
  }
  const { startEpoch, endEpoch } = destinationDayUtcWindow(forecastDate, destinationTimezone);
  const expectedEpochs: number[] = [];
  for (let epoch = startEpoch; epoch <= endEpoch; epoch += 3600) expectedEpochs.push(epoch);
  const hourly = payload.hourly;
  const time = hourly.time;
  const temperature = numberOrNullArray(hourly.temperature_2m);
  const precipitation = numberOrNullArray(hourly.precipitation_probability);
  const codes = numberOrNullArray(hourly.weather_code);
  if (!Array.isArray(time) || !time.every((value) => Number.isInteger(value) && value > 0) ||
    !temperature || !precipitation || !codes ||
    time.length !== expectedEpochs.length ||
    temperature.length !== time.length ||
    precipitation.length !== time.length ||
    codes.length !== time.length ||
    temperature.some((value) => value !== null && (value < -100 || value > 100)) ||
    precipitation.some((value) => value !== null && (value < 0 || value > 100)) ||
    codes.some((value) => value !== null && (!Number.isInteger(value) || value < 0 || value > 99))) {
    throw new Error("OPEN_METEO_INVALID_RESPONSE");
  }
  const timestamps = time as number[];
  if (timestamps.some((value, index) => value !== expectedEpochs[index])) {
    throw new Error("OPEN_METEO_INVALID_RESPONSE");
  }
  const localFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: destinationTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDates = new Set(timestamps.slice(0, -1).map((value) => {
    const parts = Object.fromEntries(localFormatter.formatToParts(new Date(value * 1000))
      .map((part) => [part.type, part.value]));
    return parts.year + "-" + parts.month + "-" + parts.day;
  }));
  if (localDates.size !== 1 || !localDates.has(forecastDate)) {
    throw new Error("OPEN_METEO_INVALID_RESPONSE");
  }
  return {
    latitude,
    longitude,
    timezone: destinationTimezone,
    hourly_data: {
      time: timestamps.slice(0, -1),
      temperature_2m: temperature.slice(0, -1),
      precipitation_probability: precipitation.slice(0, -1),
      weather_code: codes.slice(0, -1),
    },
    source_url: makeOpenMeteoHourlySourceUrl(latitude, longitude, forecastDate, destinationTimezone),
  };
};

export const fetchOpenMeteoHourly = async (
  latitude: number,
  longitude: number,
  forecastDate: string,
  destinationTimezone: string,
  fetcher: typeof fetch = fetch,
): Promise<OpenMeteoHourlyForecast> => {
  const url = makeOpenMeteoHourlyUrl(latitude, longitude, forecastDate, destinationTimezone);
  let lastError = "OPEN_METEO_FAILED";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        lastError = response.status === 429 ? "OPEN_METEO_RATE_LIMITED" : `OPEN_METEO_HTTP_${response.status}`;
        if (attempt === 0 && (response.status >= 500 || response.status === 429)) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5000)
            : 300;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        throw new Error(lastError);
      }
      const payload: unknown = await response.json();
      return validateOpenMeteoHourlyPayload(payload, latitude, longitude, forecastDate, destinationTimezone);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("OPEN_METEO_HTTP_4")) throw error;
      if (error instanceof Error && error.message === "OPEN_METEO_INVALID_RESPONSE") throw error;
      lastError = error instanceof Error && error.name === "TimeoutError"
        ? "OPEN_METEO_TIMEOUT"
        : error instanceof TypeError ? "OPEN_METEO_FAILED" : lastError;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(lastError);
};
