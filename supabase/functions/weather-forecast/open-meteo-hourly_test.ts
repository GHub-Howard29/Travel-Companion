import {
  fetchOpenMeteoHourly,
  makeOpenMeteoHourlyUrl,
  validateOpenMeteoHourlyPayload,
} from "./open-meteo-hourly.ts";
import { destinationDayUtcWindow } from "./timezone-utc.ts";

const makePayload = (destinationTimezone: string, date: string) => {
  const { startEpoch, endEpoch } = destinationDayUtcWindow(date, destinationTimezone);
  const time: number[] = [];
  for (let epoch = startEpoch; epoch <= endEpoch; epoch += 3600) time.push(epoch);
  return {
    latitude: 35.68,
    longitude: 139.69,
    timezone: "GMT",
    hourly: {
      time,
      temperature_2m: time.map((_, index) => index === 3 ? null : 12 + index),
      precipitation_probability: time.map((_, index) => index === 4 ? null : index * 2),
      weather_code: time.map(() => 1),
    },
  };
};

Deno.test("hourly URL requests UTC epoch boundaries derived from destination IANA day", () => {
  const tokyo = makeOpenMeteoHourlyUrl(35.68, 139.69, "2026-11-20", "Asia/Tokyo");
  if (tokyo.searchParams.get("timezone") !== "UTC" ||
    tokyo.searchParams.get("timeformat") !== "unixtime" ||
    tokyo.searchParams.get("forecast_days") !== "16" ||
    tokyo.searchParams.get("past_hours") !== "25" ||
    tokyo.searchParams.get("hourly") !== "temperature_2m,precipitation_probability,weather_code") {
    throw new Error("Unexpected hourly request parameters");
  }
  if (tokyo.searchParams.get("start_hour") !== "2026-11-19T15:00" ||
    tokyo.searchParams.get("end_hour") !== "2026-11-20T15:00") {
    throw new Error("Tokyo UTC boundaries were not used");
  }
  const spring = makeOpenMeteoHourlyUrl(34, -118, "2026-03-08", "America/Los_Angeles");
  if (spring.searchParams.get("start_hour") !== "2026-03-08T08:00" ||
    spring.searchParams.get("end_hour") !== "2026-03-09T07:00") {
    throw new Error("Spring DST UTC boundaries were not used");
  }
  const fall = makeOpenMeteoHourlyUrl(34, -118, "2026-11-01", "America/Los_Angeles");
  if (fall.searchParams.get("start_hour") !== "2026-11-01T07:00" ||
    fall.searchParams.get("end_hour") !== "2026-11-02T08:00") {
    throw new Error("Fall DST UTC boundaries were not used");
  }
});

Deno.test("valid ordinary destination day filters the inclusive UTC endpoint", () => {
  const result = validateOpenMeteoHourlyPayload(
    makePayload("Asia/Tokyo", "2026-11-20"), 35.68, 139.69, "2026-11-20", "Asia/Tokyo",
  );
  if (result.hourly_data.time.length !== 24 || result.timezone !== "Asia/Tokyo") {
    throw new Error("Unexpected normalized hourly payload");
  }
  if (result.hourly_data.temperature_2m[3] !== null) throw new Error("Null values must be preserved");
  if (!result.source_url.startsWith("https://open-meteo.com/en/docs?") ||
    !result.source_url.includes("start_hour=") || !result.source_url.includes("timezone=UTC")) {
    throw new Error("Missing UTC hourly attribution query");
  }
});

Deno.test("DST local days preserve 23 and 25 actual hours after endpoint removal", () => {
  const spring = validateOpenMeteoHourlyPayload(
    makePayload("America/Los_Angeles", "2026-03-08"), 34, -118, "2026-03-08", "America/Los_Angeles",
  );
  const fall = validateOpenMeteoHourlyPayload(
    makePayload("America/Los_Angeles", "2026-11-01"), 34, -118, "2026-11-01", "America/Los_Angeles",
  );
  if (spring.hourly_data.time.length !== 23 || fall.hourly_data.time.length !== 25) {
    throw new Error("DST day lengths were not preserved");
  }
  if (fall.hourly_data.time.filter((epoch) => {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(epoch * 1000));
    return parts.find((part) => part.type === "hour")?.value === "01";
  }).length !== 2) {
    throw new Error("Fall-back repeated local hour was not retained twice");
  }
});

Deno.test("invalid timezone, array lengths, timestamps and date fail closed", () => {
  const valid = makePayload("UTC", "2026-11-20");
  const invalidPayloadTimezone = { ...valid, timezone: "Not/A_Zone" };
  try {
    validateOpenMeteoHourlyPayload(invalidPayloadTimezone, 0, 0, "2026-11-20", "UTC");
    throw new Error("Expected invalid API timezone");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_INVALID_RESPONSE") throw error;
  }

  const invalidLength = { ...valid, hourly: { ...valid.hourly, weather_code: [] } };
  try {
    validateOpenMeteoHourlyPayload(invalidLength, 0, 0, "2026-11-20", "UTC");
    throw new Error("Expected invalid length");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_INVALID_RESPONSE") throw error;
  }

  const invalidProbability = {
    ...valid,
    hourly: { ...valid.hourly, precipitation_probability: valid.hourly.precipitation_probability.map((value, index) => index === 4 ? 101 : value) },
  };
  try {
    validateOpenMeteoHourlyPayload(invalidProbability, 0, 0, "2026-11-20", "UTC");
    throw new Error("Expected invalid probability range");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_INVALID_RESPONSE") throw error;
  }

  const invalidWeatherCode = {
    ...valid,
    hourly: { ...valid.hourly, weather_code: valid.hourly.weather_code.map((value, index) => index === 4 ? 100 : value) },
  };
  try {
    validateOpenMeteoHourlyPayload(invalidWeatherCode, 0, 0, "2026-11-20", "UTC");
    throw new Error("Expected invalid weather code");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_INVALID_RESPONSE") throw error;
  }

  const invalidSequence = {
    ...valid,
    hourly: { ...valid.hourly, time: valid.hourly.time.map((value, index) => index === 5 ? value + 60 : value) },
  };
  try {
    validateOpenMeteoHourlyPayload(invalidSequence, 0, 0, "2026-11-20", "UTC");
    throw new Error("Expected invalid timestamps");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_INVALID_RESPONSE") throw error;
  }

  try {
    validateOpenMeteoHourlyPayload(valid, 0, 0, "2026-11-21", "UTC");
    throw new Error("Expected date mismatch");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_INVALID_RESPONSE") throw error;
  }
});

Deno.test("HTTP client parses a valid response and fails on non-retryable HTTP status", async () => {
  const payload = makePayload("UTC", "2026-11-20");
  const fetched = await fetchOpenMeteoHourly(0, 0, "2026-11-20", "UTC", async () =>
    new Response(JSON.stringify(payload), { status: 200 }),
  );
  if (fetched.hourly_data.time.length !== 24) throw new Error("Expected 24 hourly rows");

  try {
    await fetchOpenMeteoHourly(0, 0, "2026-11-20", "UTC", async () =>
      new Response("bad request", { status: 400 }),
    );
    throw new Error("Expected HTTP error");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPEN_METEO_HTTP_400") throw error;
  }
});
