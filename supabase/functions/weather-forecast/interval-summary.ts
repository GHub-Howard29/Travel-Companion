import { destinationDayUtcWindow } from "./timezone-utc.ts";
import { selectRepresentativeWeatherCode } from "./weather-code-priority.mjs";

export interface HourlyWeatherData {
  time: number[];
  temperature_2m: Array<number | null>;
  precipitation_probability: Array<number | null>;
  weather_code: Array<number | null>;
}

export interface IntervalWeatherSummary {
  weather_code: number | null;
  temperature_2m_max: number | null;
  temperature_2m_min: number | null;
  precipitation_probability_max: number | null;
  sample_count: number;
}

/**
 * Summarize the inclusive destination-local hour range from a complete local-day payload.
 * A full-day completeness check prevents partial hourly responses from looking like valid summaries.
 */
export const calculateIntervalSummary = (
  hourly: HourlyWeatherData,
  timezone: string,
  forecastDate: string,
  arrivalHour: number,
  departureHour: number,
): IntervalWeatherSummary => {
  const required = ["time", "temperature_2m", "precipitation_probability", "weather_code"] as const;
  for (const key of required) {
    if (!Array.isArray(hourly[key])) throw new Error("INVALID_HOURLY_ARRAY");
    if (hourly[key].length !== hourly.time.length) throw new Error("HOURLY_ARRAY_LENGTH_MISMATCH");
  }
  if (!Number.isInteger(arrivalHour) || !Number.isInteger(departureHour) ||
    arrivalHour < 0 || departureHour > 23 || departureHour < arrivalHour) {
    throw new Error("INVALID_INTERVAL");
  }

  const { startEpoch, endEpoch } = destinationDayUtcWindow(forecastDate, timezone);
  const expectedEpochs: number[] = [];
  for (let epoch = startEpoch; epoch < endEpoch; epoch += 3600) expectedEpochs.push(epoch);

  const dayIndexes = new Map<number, number>();
  for (let index = 0; index < hourly.time.length; index += 1) {
    const epoch = hourly.time[index];
    if (!Number.isInteger(epoch)) throw new Error("INVALID_UNIX_TIMESTAMP");
    if (epoch >= startEpoch && epoch < endEpoch) {
      if (dayIndexes.has(epoch)) throw new Error("DUPLICATE_HOURLY_TIMESTAMP");
      dayIndexes.set(epoch, index);
    }
  }
  if (dayIndexes.size !== expectedEpochs.length || expectedEpochs.some((epoch) => !dayIndexes.has(epoch))) {
    throw new Error("HOURLY_DAY_INCOMPLETE");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const rows = expectedEpochs.flatMap((epoch) => {
    const index = dayIndexes.get(epoch);
    if (index === undefined) return [];
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch * 1000)).map((part) => [part.type, part.value]));
    const date = parts.year + "-" + parts.month + "-" + parts.day;
    const hour = Number(parts.hour);
    if (date !== forecastDate || hour < arrivalHour || hour > departureHour) return [];
    return [{
      temperature: hourly.temperature_2m[index],
      precipitation: hourly.precipitation_probability[index],
      code: hourly.weather_code[index],
    }];
  });
  if (!rows.length) throw new Error("INTERVAL_DATA_MISSING");

  const temperatures = rows.map((row) => row.temperature).filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value));
  const precipitation = rows.map((row) => row.precipitation).filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value));

  return {
    weather_code: selectRepresentativeWeatherCode(rows.map((row) => row.code)),
    temperature_2m_max: temperatures.length ? Math.max(...temperatures) : null,
    temperature_2m_min: temperatures.length ? Math.min(...temperatures) : null,
    precipitation_probability_max: precipitation.length ? Math.max(...precipitation) : null,
    sample_count: rows.length,
  };
};
