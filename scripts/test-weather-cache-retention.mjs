import assert from "node:assert/strict";
import { loadWeatherForecastCache, storeWeatherForecastResults } from "../src/services/weatherForecastService.ts";

const cacheKey = "travel-companion-weather-forecast-v1";
const originalWindow = globalThis.window;
const originalNow = Date.now;
const now = Date.parse("2026-11-17T12:00:00.000Z");
const fetchedAt = new Date(now - 30 * 3600000).toISOString();
let storedValue = JSON.stringify({
  tripId: "trip-1",
  items: {
    "card-1": {
      request_id: "card-1",
      place_id: "place-1",
      forecast_date: "2026-11-20",
      status: "fresh",
      fetched_at: fetchedAt,
      arrival_time: "10:00",
      departure_time: "12:00",
      weather: {
        weather_code: 61,
        temperature_2m_max: 18,
        temperature_2m_min: 12,
        precipitation_probability_max: 70,
      },
    },
    "card-2": {
      request_id: "card-2",
      place_id: "place-2",
      forecast_date: "2026-11-20",
      status: "fresh",
      fetched_at: new Date(now - 49 * 3600000).toISOString(),
      weather: { weather_code: 0 },
    },
  },
});

globalThis.window = {
  localStorage: {
    getItem: (key) => key === cacheKey ? storedValue : null,
    setItem: (key, value) => {
      if (key === cacheKey) storedValue = value;
    },
  },
};

try {
  Date.now = () => now;
  const results = storeWeatherForecastResults("trip-1", [{
    request_id: "card-1",
    place_id: "place-1",
    forecast_date: "2026-11-20",
    status: "ineligible",
    arrival_time: "10:00",
    departure_time: "12:00",
  }]);

  assert.equal(results["card-1"].refresh_stopped, true);
  assert.deepEqual(results["card-1"].weather, {
    weather_code: 61,
    temperature_2m_max: 18,
    temperature_2m_min: 12,
    precipitation_probability_max: 70,
  });

  const retained = loadWeatherForecastCache("trip-1");
  assert.equal(retained["card-1"].status, "stale");
  assert.equal(retained["card-1"].refresh_stopped, true);
  assert.equal(retained["card-1"].fetched_at, fetchedAt);
  assert.equal(retained["card-1"].weather.precipitation_probability_max, 70);
  assert.equal(retained["card-2"], undefined);

  Date.now = () => now + 19 * 3600000;
  const expired = loadWeatherForecastCache("trip-1");
  assert.equal(expired["card-1"].status, "ineligible");
  assert.equal(expired["card-1"].weather, undefined);
  assert.equal(expired["card-1"].fetched_at, undefined);

  console.log("Weather cache retention tests passed.");
} finally {
  Date.now = originalNow;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
