import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { preferSharedTargetCandidate, type WeatherCandidate } from "./target-selection.ts";

type WeatherSupabaseClient = SupabaseClient;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-weather-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const logWeatherDiagnostic = (
  event: string,
  traceId: string,
  stage: string,
  details: Record<string, string | number | boolean | null> = {},
) => {
  // Never pass API keys, authorization headers, request bodies, place IDs, or raw error messages here.
  console.error(JSON.stringify({
    scope: "weather-forecast",
    event,
    trace_id: traceId,
    stage,
    ...details,
  }));
};
const safeErrorCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const knownCodes = new Set([
    "COORDINATE_CACHE_READ_FAILED", "COORDINATE_CACHE_WRITE_FAILED", "PLACE_DETAILS_FAILED",
    "PLACE_DETAILS_RATE_LIMITED", "PLACE_DETAILS_TIMEOUT", "PLACE_DETAILS_NETWORK_ERROR",
    "PLACE_DETAILS_RESPONSE_ERROR", "PLACE_DETAILS_INVALID_COORDINATES", "PLACE_DETAILS_RETRY_COOLDOWN",
    "WEATHER_SERVICE_NOT_CONFIGURED", "WEATHER_LEASE_FAILED", "WEATHER_CACHE_WRITE_FAILED",
    "OPEN_METEO_FAILED", "OPEN_METEO_RATE_LIMITED", "OPEN_METEO_TIMEOUT", "OPEN_METEO_INVALID_RESPONSE",
    "ARRIVAL_TIME_PASSED", "WEATHER_SERVICE_FAILED",
  ]);
  if (knownCodes.has(message) || /^(?:PLACE_DETAILS|OPEN_METEO)_HTTP_[1-5][0-9]{2}$/.test(message)) return message;
  return "UNCLASSIFIED_ERROR";
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isValidDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isValidTime = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const dayDate = (departureDate: string, dayNumber: number) => {
  const date = new Date(`${departureDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1);
  return date.toISOString().slice(0, 10);
};
const dateDistance = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const dateAtTimezone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const timeAtTimezone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
};
const isCoordinate = (latitude: unknown, longitude: unknown) =>
  typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
  typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

type Candidate = WeatherCandidate;
interface WeatherResult {
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
  diagnostic_code?: string;
  trace_id?: string;
}

const makeCandidate = (tripId: string, departureDate: string, dayNumber: number, card: unknown): Candidate | null => {
  if (!isRecord(card) || card.showWeather !== true || !isRecord(card.place) ||
    typeof card.place.placeId !== "string" || !card.place.placeId.trim() ||
    typeof card.id !== "string" || !card.id.trim()) return null;
  const forecastDate = dayDate(departureDate, dayNumber);
  return {
    tripId, dayNumber, cardId: card.id, placeId: card.place.placeId.trim(), forecastDate,
    arrivalTime: isValidTime(card.time) ? card.time : "",
  };
};

const getStoredCandidate = (trip: Record<string, unknown>, candidate: Candidate): Candidate | null => {
  const departureDate = typeof trip.departure_date === "string" ? trip.departure_date : "";
  const content = isRecord(trip.content) ? trip.content : {};
  const daysData = isRecord(content.daysData) ? content.daysData : {};
  const cards = daysData[String(candidate.dayNumber)];
  if (!Array.isArray(cards)) return null;
  const card = cards.find((item) => isRecord(item) && item.id === candidate.cardId);
  const verified = makeCandidate(String(trip.id), departureDate, candidate.dayNumber, card);
  if (!verified || verified.placeId !== candidate.placeId || verified.forecastDate !== candidate.forecastDate) return null;
  return verified;
};

const getCoordinates = async (admin: WeatherSupabaseClient, placeId: string, traceId: string) => {
  const now = new Date();
  const { data: cached, error: cacheReadError } = await admin.from("weather_place_coordinates")
    .select("place_id, latitude, longitude, fetched_at, expires_at, status, last_error, updated_at")
    .eq("place_id", placeId).maybeSingle();
  if (cacheReadError) {
    logWeatherDiagnostic("coordinate_cache_read_failed", traceId, "coordinate_cache_read", {
      error_code: "COORDINATE_CACHE_READ_FAILED",
      database_code: cacheReadError.code ?? null,
    });
    throw new Error("COORDINATE_CACHE_READ_FAILED");
  }
  if (cached?.status === "valid" && isCoordinate(cached.latitude, cached.longitude) &&
    cached.expires_at && Date.parse(cached.expires_at) > now.getTime() && !cached.last_error) {
    return { latitude: cached.latitude as number, longitude: cached.longitude as number };
  }
  if (cached?.status === "failed" && cached.updated_at &&
    Date.parse(cached.updated_at) > now.getTime() - 3600000) {
    // Do not trust historical last_error text; it may predate the safe diagnostic-code policy.
    throw new Error("PLACE_DETAILS_RETRY_COOLDOWN");
  }

  let apiKey: string;
  try {
    apiKey = env("GOOGLE_MAPS_API_KEY");
  } catch {
    logWeatherDiagnostic("environment_variable_missing", traceId, "google_places_configuration", {
      variable: "GOOGLE_MAPS_API_KEY",
      configured: false,
    });
    throw new Error("WEATHER_SERVICE_NOT_CONFIGURED");
  }
  let lastError = "PLACE_DETAILS_FAILED";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,location" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        lastError = response.status === 429 ? "PLACE_DETAILS_RATE_LIMITED" : `PLACE_DETAILS_HTTP_${response.status}`;
        logWeatherDiagnostic("google_places_http_error", traceId, "google_places_request", {
          error_code: lastError,
          http_status: response.status,
          attempt: attempt + 1,
        });
        if (response.status < 500 && response.status !== 429) break;
      } else {
        const payload = await response.json();
        const location = isRecord(payload) && isRecord(payload.location) ? payload.location : null;
        const latitude = location?.latitude;
        const longitude = location?.longitude;
        if (!isCoordinate(latitude, longitude)) { lastError = "PLACE_DETAILS_INVALID_COORDINATES"; break; }
        const fetchedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
        const { data: stored, error } = await admin.rpc("tc_weather_store_coordinates", {
          p_place_id: placeId,
          p_latitude: latitude,
          p_longitude: longitude,
          p_fetched_at: fetchedAt,
          p_expires_at: expiresAt,
        });
        if (error || stored !== true) {
          logWeatherDiagnostic("coordinate_cache_write_failed", traceId, "coordinate_cache_write", {
            error_code: "COORDINATE_CACHE_WRITE_FAILED",
            database_code: error?.code ?? null,
            rpc_returned_true: stored === true,
          });
          throw new Error("COORDINATE_CACHE_WRITE_FAILED");
        }
        logWeatherDiagnostic("coordinate_lookup_succeeded", traceId, "coordinate_cache_write", {
          cache_write_succeeded: true,
        });
        return { latitude: latitude as number, longitude: longitude as number };
      }
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        lastError = "PLACE_DETAILS_TIMEOUT";
        logWeatherDiagnostic("google_places_timeout", traceId, "google_places_request", {
          error_code: lastError,
          attempt: attempt + 1,
        });
      } else if (error instanceof Error &&
        ["COORDINATE_CACHE_WRITE_FAILED", "WEATHER_SERVICE_NOT_CONFIGURED", "COORDINATE_CACHE_READ_FAILED"].includes(error.message)) {
        lastError = error.message;
        break;
      } else {
        if (error instanceof TypeError) lastError = "PLACE_DETAILS_NETWORK_ERROR";
        logWeatherDiagnostic("google_places_request_failed", traceId, "google_places_request", {
          error_code: error instanceof TypeError ? "PLACE_DETAILS_NETWORK_ERROR" : "PLACE_DETAILS_RESPONSE_ERROR",
          attempt: attempt + 1,
        });
      }
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  const failedAt = new Date().toISOString();
  // Preserve any previously stored coordinate values; a failed refresh must not erase them.
  const failureWriteResult = cached
    ? await admin.from("weather_place_coordinates").update({
      status: "failed", last_error: lastError, updated_at: failedAt,
    }).eq("place_id", placeId)
    : await admin.from("weather_place_coordinates").insert({
      place_id: placeId, status: "failed", last_error: lastError, updated_at: failedAt,
    });
  const failureWriteError = failureWriteResult.error;
  logWeatherDiagnostic("coordinate_lookup_failed", traceId, "coordinate_failure_record_write", {
    error_code: lastError,
    failure_record_write_succeeded: !failureWriteError,
    database_code: failureWriteError?.code ?? null,
  });
  throw new Error(lastError);
};

const fetchForecast = async (latitude: number, longitude: number, forecastDate: string) => {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    start_date: forecastDate, end_date: forecastDate, timezone: "auto", temperature_unit: "celsius",
    models: "best_match", cell_selection: "land",
  }).toString();
  let payload: unknown;
  let lastError = "OPEN_METEO_FAILED";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        payload = await response.json();
        break;
      }
      lastError = response.status === 429 ? "OPEN_METEO_RATE_LIMITED" : `OPEN_METEO_HTTP_${response.status}`;
      if (response.status < 500 && response.status !== 429) throw new Error(lastError);
      if (attempt === 0) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 300;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    } catch (error) {
      if (attempt === 1 || (error instanceof Error && error.message.startsWith("OPEN_METEO_HTTP_4"))) throw error;
      lastError = error instanceof Error && error.name === "TimeoutError" ? "OPEN_METEO_TIMEOUT" : lastError;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  if (!payload) throw new Error(lastError);
  if (!isRecord(payload) || typeof payload.timezone !== "string" || !isRecord(payload.daily) ||
    !Array.isArray(payload.daily.time) || payload.daily.time[0] !== forecastDate) throw new Error("OPEN_METEO_INVALID_RESPONSE");
  const daily = payload.daily;
  const numberAt = (key: string): number | null => {
    const value = (daily[key] as unknown[] | undefined)?.[0];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    timezone: payload.timezone,
    weather_code: numberAt("weather_code"),
    temperature_2m_max: numberAt("temperature_2m_max"),
    temperature_2m_min: numberAt("temperature_2m_min"),
    precipitation_probability_max: numberAt("precipitation_probability_max"),
  };
};

const getForecastForCandidate = async (
  admin: WeatherSupabaseClient, candidate: Candidate,
): Promise<WeatherResult> => {
  const requestId = candidate.cardId;
  const traceId = crypto.randomUUID();
  let diagnosticCode: string | undefined;
  const diagnosticFields = () => diagnosticCode
    ? { diagnostic_code: diagnosticCode, trace_id: traceId }
    : {};
  const { data: previous } = await admin.from("weather_daily_forecasts").select("*")
    .eq("place_id", candidate.placeId).eq("forecast_date", candidate.forecastDate).maybeSingle();
  const now = new Date();
  const cachedTimezone = typeof previous?.timezone === "string" ? previous.timezone : null;
  const currentLocalDate = cachedTimezone ? dateAtTimezone(now, cachedTimezone) : now.toISOString().slice(0, 10);
  const daysAhead = dateDistance(currentLocalDate, candidate.forecastDate);
  if (daysAhead < 0) return { request_id: requestId, place_id: candidate.placeId, forecast_date: candidate.forecastDate, status: "ineligible", message: "行程日期已過" };
  if (daysAhead > 10) return { request_id: requestId, place_id: candidate.placeId, forecast_date: candidate.forecastDate, status: "long_range", message: `尚未開放天氣預報，預計 ${daysAhead - 10} 天後提供` };
  if (cachedTimezone && daysAhead === 0 && candidate.arrivalTime && timeAtTimezone(now, cachedTimezone) >= candidate.arrivalTime) {
    return { request_id: requestId, place_id: candidate.placeId, forecast_date: candidate.forecastDate, status: "ineligible", message: "已超過景點到達時間" };
  }
  const usable = previous?.fetched_at && Date.parse(previous.fetched_at) > now.getTime() - 48 * 3600000 &&
    typeof previous.timezone === "string" && previous.timezone.length > 0;
  const ageSinceSuccess = previous?.fetched_at ? now.getTime() - Date.parse(previous.fetched_at) : Number.POSITIVE_INFINITY;
  const ageSinceAttempt = previous?.last_refresh_attempt_at ? now.getTime() - Date.parse(previous.last_refresh_attempt_at) : Number.POSITIVE_INFINITY;
  const failedRecently = Boolean(previous?.last_refresh_failed_at && Date.parse(previous.last_refresh_failed_at) > now.getTime() - 3600000);
  const failedAndRetryAllowed = Boolean(previous?.last_refresh_failed_at) && !failedRecently;
  const shouldRefresh = failedRecently ? false : (!usable || failedAndRetryAllowed ||
    (!previous?.last_refresh_failed_at && ageSinceSuccess >= 6 * 3600000 &&
      (ageSinceSuccess >= 24 * 3600000 || ageSinceAttempt >= 6 * 3600000)));

  if (shouldRefresh) {
    try {
      const coords = await getCoordinates(admin, candidate.placeId, traceId);
      const { data: token, error: leaseError } = await admin.rpc("tc_weather_claim_lease", {
        p_place_id: candidate.placeId, p_forecast_date: candidate.forecastDate,
      });
      if (leaseError) throw new Error("WEATHER_LEASE_FAILED");
      if (typeof token === "string" && token) {
        try {
          const forecast = await fetchForecast(coords.latitude, coords.longitude, candidate.forecastDate);
          if (candidate.arrivalTime && dateAtTimezone(now, forecast.timezone) === candidate.forecastDate &&
            timeAtTimezone(now, forecast.timezone) >= candidate.arrivalTime) {
            await admin.rpc("tc_weather_release_lease", {
              p_place_id: candidate.placeId, p_forecast_date: candidate.forecastDate, p_token: token,
              p_success: false, p_error: "ARRIVAL_TIME_PASSED",
            });
            return { request_id: requestId, place_id: candidate.placeId, forecast_date: candidate.forecastDate, status: "ineligible", message: "已超過景點到達時間" };
          }
          const { error: releaseError } = await admin.rpc("tc_weather_release_lease", {
            p_place_id: candidate.placeId, p_forecast_date: candidate.forecastDate, p_token: token,
            p_success: true, p_forecast: { ...forecast, ...coords },
          });
          if (releaseError) throw new Error("WEATHER_CACHE_WRITE_FAILED");
        } catch (error) {
          const errorCode = safeErrorCode(error);
          diagnosticCode = errorCode;
          logWeatherDiagnostic("forecast_refresh_failed", traceId, "forecast_fetch_or_cache_write", {
            error_code: errorCode,
          });
          const { error: releaseError } = await admin.rpc("tc_weather_release_lease", {
            p_place_id: candidate.placeId, p_forecast_date: candidate.forecastDate, p_token: token,
            p_success: false, p_error: errorCode,
          });
          if (releaseError) {
            logWeatherDiagnostic("forecast_lease_release_failed", traceId, "forecast_lease_release", {
              error_code: "WEATHER_LEASE_RELEASE_FAILED",
              database_code: releaseError.code ?? null,
            });
          }
        }
      }
    } catch (error) {
      diagnosticCode = safeErrorCode(error);
      logWeatherDiagnostic("forecast_refresh_failed", traceId, "coordinate_or_lease", {
        error_code: diagnosticCode,
      });
    }
  }

  const { data: latest } = await admin.from("weather_daily_forecasts").select("*")
    .eq("place_id", candidate.placeId).eq("forecast_date", candidate.forecastDate).maybeSingle();
  const { data: currentCoordinates } = await admin.from("weather_place_coordinates")
    .select("latitude, longitude, status, expires_at")
    .eq("place_id", candidate.placeId).maybeSingle();
  const coordinatesMatch = currentCoordinates?.status === "valid" &&
    isCoordinate(currentCoordinates.latitude, currentCoordinates.longitude) &&
    currentCoordinates.expires_at && Date.parse(currentCoordinates.expires_at) > Date.now() &&
    latest?.latitude === currentCoordinates.latitude && latest?.longitude === currentCoordinates.longitude;
  const stillUsable = Boolean(coordinatesMatch && latest?.fetched_at &&
    Date.parse(latest.fetched_at) > Date.now() - 48 * 3600000 &&
    typeof latest.timezone === "string" && latest.timezone.length > 0);
  if (!stillUsable) return {
    request_id: requestId, place_id: candidate.placeId, forecast_date: candidate.forecastDate,
    status: "unavailable", message: "暫時無法取得天氣",
    ...diagnosticFields(),
  };
  const isStale = Date.parse(latest.fetched_at) <= Date.now() - 24 * 3600000;
  return {
    request_id: requestId, place_id: candidate.placeId, forecast_date: candidate.forecastDate,
    status: isStale ? "stale" : "fresh", fetched_at: latest.fetched_at, timezone: latest.timezone,
    weather: {
      weather_code: latest.weather_code,
      temperature_2m_max: latest.temperature_2m_max,
      temperature_2m_min: latest.temperature_2m_min,
      precipitation_probability_max: latest.precipitation_probability_max,
    },
    ...(latest.last_refresh_failed_at && isStale ? { message: "更新失敗，顯示上次資料" } : {}),
  };
};

const handleRequest = async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const traceId = crypto.randomUUID();
  let stage = "environment_configuration";
  try {
    const url = env("SUPABASE_URL");
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY");
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) as WeatherSupabaseClient;
    const cronSecret = Deno.env.get("WEATHER_CRON_SECRET");
    const providedCronSecret = request.headers.get("x-weather-cron-secret");
    stage = "request_authorization";
    if (providedCronSecret) {
      if (!cronSecret || providedCronSecret !== cronSecret) return json({ error: "UNAUTHORIZED" }, 401);
      const { data: trips, error } = await admin.from("trips").select("id, departure_date, content").limit(500);
      if (error) return json({ error: "TRIP_SCAN_FAILED" }, 500);
      const candidates: Candidate[] = [];
      for (const trip of trips ?? []) {
        const content = isRecord(trip.content) ? trip.content : {};
        const daysData = isRecord(content.daysData) ? content.daysData : {};
        for (const [dayKey, cards] of Object.entries(daysData)) {
          const dayNumber = Number(dayKey);
          if (!Number.isInteger(dayNumber) || dayNumber < 1 || !Array.isArray(cards)) continue;
          for (const card of cards) {
            const candidate = makeCandidate(trip.id, trip.departure_date, dayNumber, card);
            if (candidate) {
              const daysAhead = dateDistance(new Date().toISOString().slice(0, 10), candidate.forecastDate);
              if (daysAhead >= 0 && daysAhead <= 10) candidates.push(candidate);
            }
          }
        }
      }
      const results: WeatherResult[] = [];
      const unique = new Map<string, Candidate>();
      for (const candidate of candidates) {
        const key = `${candidate.placeId}|${candidate.forecastDate}`;
        unique.set(key, preferSharedTargetCandidate(unique.get(key), candidate));
      }
      const targets = [...unique.values()];
      for (let batchOffset = 0; batchOffset < targets.length; batchOffset += 10) {
        const batch = targets.slice(batchOffset, batchOffset + 10);
        for (let concurrencyOffset = 0; concurrencyOffset < batch.length; concurrencyOffset += 5) {
          const group = batch.slice(concurrencyOffset, concurrencyOffset + 5);
          const groupResults = await Promise.all(group.map(async (candidate) => {
            const { data: trip } = await admin.from("trips").select("id, departure_date, content").eq("id", candidate.tripId).maybeSingle();
            if (!trip || !getStoredCandidate(trip as Record<string, unknown>, candidate)) return null;
            const result = await getForecastForCandidate(admin, candidate);
            await admin.rpc("tc_weather_mark_scheduled_refresh", {
              p_place_id: candidate.placeId,
              p_forecast_date: candidate.forecastDate,
            });
            return result;
          }));
          results.push(...groupResults.filter((result): result is WeatherResult => result !== null));
        }
      }
      return json({ results });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization) return json({ error: "UNAUTHORIZED" }, 401);
    const scoped = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }) as WeatherSupabaseClient;
    stage = "request_body_validation";
    const body = await request.json();
    if (!isRecord(body) || typeof body.trip_id !== "string" || !body.trip_id.trim()) return json({ error: "INVALID_REQUEST" }, 400);
    stage = "trip_read";
    const { data: trip, error: tripError } = await scoped.from("trips").select("id, departure_date, content").eq("id", body.trip_id).maybeSingle();
    if (tripError || !trip) return json({ error: "TRIP_NOT_READABLE" }, 403);
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    const candidates: Candidate[] = [];
    for (const item of requestedItems.slice(0, 100)) {
      if (!isRecord(item) || !Number.isInteger(item.day_number) || !isValidDate(item.forecast_date) ||
        typeof item.card_id !== "string" || typeof item.place_id !== "string") continue;
      const candidate: Candidate = {
        tripId: trip.id, dayNumber: item.day_number as number, cardId: item.card_id,
        placeId: item.place_id, forecastDate: item.forecast_date, arrivalTime: "",
      };
      const verified = getStoredCandidate(trip as Record<string, unknown>, candidate);
      if (verified) candidates.push(verified);
    }
    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const key = `${candidate.placeId}|${candidate.forecastDate}`;
      unique.set(key, preferSharedTargetCandidate(unique.get(key), candidate));
    }
    const uniqueResults = new Map<string, WeatherResult>();
    const targets = [...unique.entries()].slice(0, 10);
    for (let offset = 0; offset < targets.length; offset += 5) {
      const group = targets.slice(offset, offset + 5);
      const groupResults = await Promise.all(group.map(async ([key, candidate]) =>
        [key, await getForecastForCandidate(admin, candidate)] as const));
      for (const [key, result] of groupResults) uniqueResults.set(key, result);
    }
    const results = candidates.map((candidate) => {
      const result = uniqueResults.get(`${candidate.placeId}|${candidate.forecastDate}`);
      return result ? { ...result, request_id: candidate.cardId } : {
        request_id: candidate.cardId, place_id: candidate.placeId, forecast_date: candidate.forecastDate,
        status: "unavailable" as const, message: "未取得有效天氣回應，請稍後重試",
      };
    });
    return json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WEATHER_SERVICE_FAILED";
    const missingVariable = /^Missing ([A-Z0-9_]+)$/.exec(message)?.[1];
    logWeatherDiagnostic(
      missingVariable ? "environment_variable_missing" : "request_failed",
      traceId,
      stage,
      missingVariable
        ? { variable: missingVariable, configured: false, error_code: "WEATHER_SERVICE_NOT_CONFIGURED" }
        : { error_code: safeErrorCode(error) },
    );
    return json({ error: missingVariable ? "WEATHER_SERVICE_NOT_CONFIGURED" : "WEATHER_SERVICE_FAILED" }, 500);
  }
};

if (import.meta.main) Deno.serve(handleRequest);
export { getCoordinates, safeErrorCode };
