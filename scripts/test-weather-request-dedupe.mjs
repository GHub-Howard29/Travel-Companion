import assert from "node:assert/strict";
import { createServer } from "vite";

const originalWindow = globalThis.window;
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createWeatherResponse = (items, status = "fresh", fetchedAt = new Date().toISOString()) => ({
  data: {
    results: items.map((item) => ({
      request_id: item.card_id,
      place_id: item.place_id,
      forecast_date: item.forecast_date,
      status,
      fetched_at: fetchedAt,
      timezone: "Asia/Taipei",
      weather: {
        weather_code: 0,
        temperature_2m_max: 24,
        temperature_2m_min: 18,
        precipitation_probability_max: 10,
      },
    })),
  },
  error: null,
});

const createHarness = ({ respond } = {}) => {
  const calls = [];
  const pending = [];
  const supabase = {
    functions: {
      invoke: (name, options) => {
        const deferred = createDeferred();
        const call = { name, body: options.body, options, deferred };
        calls.push(call);
        pending.push(call);
        if (respond) queueMicrotask(() => deferred.resolve(respond(call)));
        return deferred.promise;
      },
    },
  };
  return { calls, pending, supabase };
};

const card = (id, placeId = "PLACE-A", arrival = "09:00", departure = "11:00", showWeather = true) => ({
  id,
  place: { placeId },
  time: arrival,
  departureTime: departure,
  showWeather,
});

const settleAll = async (harness) => {
  for (let round = 0; round < 10; round += 1) {
    await Promise.resolve();
    const pending = harness.pending.splice(0);
    if (!pending.length) continue;
    for (const call of pending) call.deferred.resolve(createWeatherResponse(call.body.items));
  }
  await Promise.resolve();
};

const waitForCalls = async (harness, expectedCount) => {
  for (let round = 0; round < 20 && harness.calls.length < expectedCount; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(harness.calls.length, expectedCount, `expected ${expectedCount} Edge invoke(s)`);
};

let vite;
try {
  vite = await createServer({
    configFile: "vite.config.ts",
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  const weather = await vite.ssrLoadModule("/src/services/weatherForecastService.ts");

  // Same target remains in-flight when an unrelated card or another itinerary day changes.
  {
    const harness = createHarness();
    const base = { "1": [card("CARD-A")] };
    const first = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-1", "2026-12-01", base);
    const sameSnapshot = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-1", "2026-12-01", { "1": [card("CARD-A")] });
    assert.equal(first, sameSnapshot, "identical target snapshots should share the same batch Promise");
    await waitForCalls(harness, 1);

    const changedSnapshot = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-1", "2026-12-01", {
      "1": [card("CARD-A")],
      "2": [card("CARD-B", "PLACE-B")],
    });
    await waitForCalls(harness, 2);
    assert.deepEqual(harness.calls.map((call) => call.body.items.map((item) => item.card_id)), [["CARD-A"], ["CARD-B"]]);

    await settleAll(harness);
    const [firstResults, changedResults] = await Promise.all([first, changedSnapshot]);
    assert.deepEqual(firstResults.map((item) => item.request_id), ["CARD-A"]);
    assert.deepEqual(changedResults.map((item) => item.request_id), ["CARD-A", "CARD-B"]);
  }

  // Overlapping snapshots share only the unchanged target; each caller receives its own result set.
  {
    const harness = createHarness();
    const first = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-2", "2026-12-01", { "1": [card("CARD-A")] });
    await waitForCalls(harness, 1);
    const second = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-2", "2026-12-01", {
      "1": [card("CARD-A")],
      "2": [card("CARD-B", "PLACE-B")],
    });
    await waitForCalls(harness, 2);
    await settleAll(harness);
    const [firstResults, secondResults] = await Promise.all([first, second]);
    assert.deepEqual(firstResults.map((item) => item.request_id), ["CARD-A"]);
    assert.deepEqual(secondResults.map((item) => item.request_id), ["CARD-A", "CARD-B"]);
    assert.equal(harness.calls.filter((call) => call.body.items.some((item) => item.card_id === "CARD-A")).length, 1);
  }

  // Real target changes must not reuse an old in-flight result.
  {
    const harness = createHarness();
    const base = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-3", "2026-12-01", { "1": [card("CARD-A")] });
    await waitForCalls(harness, 1);
    const placeChanged = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-3", "2026-12-01", { "1": [card("CARD-A", "PLACE-CHANGED")] });
    await waitForCalls(harness, 2);
    const timeChanged = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-3", "2026-12-01", { "1": [card("CARD-A", "PLACE-A", "09:00", "12:00")] });
    await waitForCalls(harness, 3);
    const dateChanged = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-3", "2026-12-02", { "1": [card("CARD-A")] });
    await waitForCalls(harness, 4);
    assert.deepEqual(harness.calls.map((call) => call.body.items[0].forecast_date), [
      "2026-12-01", "2026-12-01", "2026-12-01", "2026-12-02",
    ]);
    assert.equal(harness.calls[1].body.items[0].place_id, "PLACE-CHANGED");
    assert.equal(harness.calls[2].body.items[0].departure_time, "12:00");
    await settleAll(harness);
    await Promise.all([base, placeChanged, timeChanged, dateChanged]);
  }

  // Different card identity must remain a distinct forecast target even at the same place/date/time.
  {
    const harness = createHarness();
    const first = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-CARD-ID", "2026-12-01", { "1": [card("CARD-IDENTITY-A")] });
    await waitForCalls(harness, 1);
    const second = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-CARD-ID", "2026-12-01", { "1": [card("CARD-IDENTITY-B")] });
    await waitForCalls(harness, 2);
    assert.deepEqual(harness.calls.map((call) => call.body.items[0].card_id), ["CARD-IDENTITY-A", "CARD-IDENTITY-B"]);
    await settleAll(harness);
    const [firstResults, secondResults] = await Promise.all([first, second]);
    assert.deepEqual(firstResults.map((item) => item.request_id), ["CARD-IDENTITY-A"]);
    assert.deepEqual(secondResults.map((item) => item.request_id), ["CARD-IDENTITY-B"]);
  }

  // Cards with weather disabled do not become request targets.
  {
    const harness = createHarness();
    const result = await weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-NO-WEATHER", "2026-12-01", {
      "1": [card("HIDDEN-A", "PLACE-A", "09:00", "11:00", false)],
    });
    assert.deepEqual(result, []);
    assert.equal(harness.calls.length, 0);
  }

  // Daily forecasts still deduplicate when only unrelated itinerary data changes.
  {
    const harness = createHarness();
    const dailyCard = { ...card("DAILY-A", "PLACE-DAILY", "", ""), time: undefined, departureTime: undefined };
    const first = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-4", "2026-12-01", { "1": [dailyCard] });
    await waitForCalls(harness, 1);
    const second = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-4", "2026-12-01", {
      "1": [dailyCard],
      "2": [card("OTHER", "PLACE-OTHER")],
    });
    await waitForCalls(harness, 2);
    await settleAll(harness);
    const [firstResults, secondResults] = await Promise.all([first, second]);
    assert.equal(harness.calls.filter((call) => call.body.items.some((item) => item.card_id === "DAILY-A")).length, 1);
    assert.deepEqual(firstResults.map((item) => item.request_id), ["DAILY-A"]);
    assert.deepEqual(secondResults.map((item) => item.request_id), ["DAILY-A", "OTHER"]);
  }

  // The existing one-time waiting retry remains limited to the waiting target.
  {
    let waitingResponseSent = false;
    const harness = createHarness({
      respond: (call) => {
        const results = call.body.items.map((item) => createWeatherResponse(
          [item], item.card_id === "WAIT-A" && !waitingResponseSent ? "waiting" : "fresh",
        ).data.results[0]);
        if (call.body.items.some((item) => item.card_id === "WAIT-A")) waitingResponseSent = true;
        return { data: { results }, error: null };
      },
    });
    const request = weather.requestTripWeather(harness.supabase, "TRIP-DEDUP-5", "2026-12-01", {
      "1": [card("WAIT-A"), card("FRESH-B", "PLACE-B")],
    });
    const results = await request;
    assert.equal(harness.calls.length, 2);
    assert.deepEqual(harness.calls[1].body.items.map((item) => item.card_id), ["WAIT-A"]);
    assert.deepEqual(results.map((item) => item.status), ["fresh", "fresh"]);
  }

  // An ineligible terminal result is cached; same target is suppressed only while cached weather is <48h old.
  {
    const tripId = "TRIP-DEDUP-6";
    const harness = createHarness({ respond: (call) => ({
      data: { results: call.body.items.map((item) => ({
        request_id: item.card_id,
        place_id: item.place_id,
        forecast_date: item.forecast_date,
        status: "ineligible",
        arrival_time: item.arrival_time,
        departure_time: item.departure_time,
        fetched_at: new Date().toISOString(),
        weather: { weather_code: 0, temperature_2m_max: 21, temperature_2m_min: 12, precipitation_probability_max: 0 },
      })) },
      error: null,
    }) });
    const first = await weather.requestTripWeather(harness.supabase, tripId, "2026-12-01", { "1": [card("STOP-A")] });
    weather.storeWeatherForecastResults(tripId, first);
    const second = await weather.requestTripWeather(harness.supabase, tripId, "2026-12-01", { "1": [card("STOP-A")] });
    assert.equal(harness.calls.length, 1);
    assert.ok(["fresh", "stale"].includes(second[0].status));
    assert.equal(second[0].refresh_stopped, true);
    assert.ok(second[0].weather);
  }

  // 24h/48h cache boundaries, including terminal ineligible cache, remain unchanged.
  {
    const tripId = "TRIP-DEDUP-7";
    const now = Date.now();
    const makeCached = (ageHours, refreshStopped = false) => ({
      request_id: `CACHE-${ageHours}-${refreshStopped}`,
      place_id: "PLACE-CACHE",
      forecast_date: "2026-12-01",
      status: "fresh",
      fetched_at: new Date(now - ageHours * 3600000).toISOString(),
      ...(refreshStopped ? { refresh_stopped: true } : {}),
      weather: { weather_code: 0, temperature_2m_max: 20, temperature_2m_min: 10, precipitation_probability_max: 0 },
    });
    weather.storeWeatherForecastResults(tripId, [makeCached(23), makeCached(25), makeCached(47), makeCached(49), makeCached(25, true), makeCached(49, true)]);
    const cached = weather.loadWeatherForecastCache(tripId);
    assert.equal(cached["CACHE-23-false"].status, "fresh");
    assert.equal(cached["CACHE-25-false"].status, "stale");
    assert.equal(cached["CACHE-47-false"].status, "stale");
    assert.equal(cached["CACHE-49-false"], undefined);
    assert.equal(cached["CACHE-25-true"].status, "stale");
    assert.equal(cached["CACHE-49-true"].status, "ineligible");
    assert.equal(cached["CACHE-49-true"].weather, undefined);
  }

  // Failed refresh preserves the last successful summary and fetched_at.
  {
    const tripId = "TRIP-DEDUP-8";
    const success = {
      request_id: "CACHE-FAIL-PRESERVE", place_id: "PLACE-CACHE", forecast_date: "2026-12-01", status: "fresh",
      fetched_at: new Date().toISOString(), weather: { weather_code: 1, temperature_2m_max: 21, temperature_2m_min: 11, precipitation_probability_max: 5 },
    };
    weather.storeWeatherForecastResults(tripId, [success]);
    const failed = weather.storeWeatherForecastResults(tripId, [{
      request_id: success.request_id, place_id: success.place_id, forecast_date: success.forecast_date, status: "unavailable", message: "stub failure",
    }]);
    assert.equal(failed[success.request_id].fetched_at, success.fetched_at);
    assert.deepEqual(failed[success.request_id].weather, success.weather);
    assert.equal(failed[success.request_id].message, "stub failure");
  }

  console.log("Weather request target deduplication regression tests passed.");
} finally {
  await vite?.close();
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
