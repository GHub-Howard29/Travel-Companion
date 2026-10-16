import assert from "node:assert/strict";

const baseUrl = (process.env.WEATHER_TEST_URL ?? "http://127.0.0.1:54321").replace(/\/$/, "") +
  "/functions/v1/weather-forecast";

const request = (method, headers = {}, body) => fetch(baseUrl, {
  method,
  headers,
  ...(body === undefined ? {} : { body }),
});

const getJson = async (response) => {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return body;
};

const methodNotAllowed = await request("GET");
assert.equal(methodNotAllowed.status, 405, "GET must be rejected");
assert.equal((await getJson(methodNotAllowed)).error, "METHOD_NOT_ALLOWED");

const noAuthorization = await request("POST", { "content-type": "application/json" }, "{}");
assert.equal(noAuthorization.status, 401, "APP request without Authorization must be rejected");
assert.equal((await getJson(noAuthorization)).error, "UNAUTHORIZED");

const wrongCronSecret = await request("POST", {
  "content-type": "application/json",
  "x-weather-cron-secret": "intentionally-wrong-local-test-secret",
}, "{}");
assert.equal(wrongCronSecret.status, 401, "incorrect Cron secret must be rejected");
assert.equal((await getJson(wrongCronSecret)).error, "UNAUTHORIZED");

const invalidJwt = await request("POST", {
  "content-type": "application/json",
  authorization: "Bearer intentionally-invalid-local-test-token",
}, JSON.stringify({
  trip_id: "intentionally-nonexistent-local-test-trip",
  items: [{ day_number: 1, forecast_date: "2026-10-20", card_id: "forged", place_id: "forged-place" }],
}));
assert.equal(invalidJwt.status, 403, "invalid JWT / unreadable trip must not authorize candidate processing");
assert.equal((await getJson(invalidJwt)).error, "TRIP_NOT_READABLE");

const preflight = await request("OPTIONS");
assert.equal(preflight.status, 200, "CORS preflight must succeed");

console.log("V3.10.1 weather endpoint smoke tests passed (method, no auth, bad Cron secret, invalid JWT, CORS).");
