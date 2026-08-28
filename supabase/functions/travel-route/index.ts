import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  isPlace,
  isRecord,
  isValidIsoDate,
  isValidTime,
  normalizeTransitVehicle,
  parseDurationSeconds,
} from "./validation.ts";

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_COMPUTE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const ROUTE_DAILY_LIMIT = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requiredEnv = (name: string, fallbackName?: string): string => {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getPlaceKey = (place: { placeId: string }) => `place:${place.placeId.trim()}`;

const getTransitVehicle = (route: Record<string, unknown>): string => {
  const legs = Array.isArray(route.legs) ? route.legs : [];
  for (const leg of legs) {
    if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
    for (const step of leg.steps) {
      if (!isRecord(step) || !isRecord(step.transitDetails)) continue;
      const transitLine = step.transitDetails.transitLine;
      if (!isRecord(transitLine) || !isRecord(transitLine.vehicle)) continue;
      return normalizeTransitVehicle(transitLine.vehicle.type);
    }
  }
  return "other";
};

const getReferenceDeparture = (
  tripDepartureDate: string,
  activeDay: number,
  departureTime: string,
  useDaytimeFallback: boolean,
): string | null => {
  const tripDate = new Date(`${tripDepartureDate}T00:00:00Z`);
  if (Number.isNaN(tripDate.getTime())) return null;
  tripDate.setUTCDate(tripDate.getUTCDate() + Math.max(0, activeDay - 1));
  const targetWeekday = tripDate.getUTCDay();

  const now = new Date();
  const earliest = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [hourText, minuteText] = (useDaytimeFallback ? "12:00" : departureTime).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;

  const candidate = new Date(earliest);
  candidate.setUTCHours(hour, minute, 0, 0);
  while (candidate.getUTCDay() !== targetWeekday || candidate <= earliest) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
};

const getAuthorizedClients = async (request: Request, tripId: string) => {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const publishableKey = requiredEnv("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email) return null;

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });
  const { data: roles, error: roleError } = await admin
    .from("admin_users")
    .select("role, trip_id")
    .ilike("email", email);
  if (roleError) throw roleError;

  const isAuthorized = (roles ?? []).some((role) =>
    role.role === "super_admin" ||
    (role.role === "trip_editor" && role.trip_id === tripId)
  );
  return isAuthorized ? { admin } : null;
};

const requestRoute = async (
  apiKey: string,
  input: {
    origin: { placeId: string };
    destination: { placeId: string };
    mode: string;
    departureTime?: string;
  },
): Promise<Record<string, unknown> | null> => {
  const body: Record<string, unknown> = {
    origin: { placeId: input.origin.placeId },
    destination: { placeId: input.destination.placeId },
    travelMode: ({ drive: "DRIVE", walk: "WALK", transit: "TRANSIT" } as Record<string, string>)[input.mode],
    computeAlternativeRoutes: false,
    languageCode: "zh-TW",
    units: "METRIC",
  };
  if (input.mode === "transit" && input.departureTime) body.departureTime = input.departureTime;

  const response = await fetch(GOOGLE_COMPUTE_ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.steps.transitDetails.transitLine.vehicle.type",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.routes) || !isRecord(payload.routes[0])) return null;
  return payload.routes[0];
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.tripId !== "string" ||
      body.tripId.trim().length < 1 || body.tripId.trim().length > 200) {
      return json({ error: "缺少旅程識別資訊。" }, 400);
    }

    const clients = await getAuthorizedClients(request, body.tripId);
    if (!clients) return json({ error: "只有本行程管理者可以查詢地圖服務。" }, 403);
    const apiKey = requiredEnv("GOOGLE_MAPS_API_KEY");

    if (body.action === "placeAutocomplete") {
      if (typeof body.input !== "string" || body.input.trim().length < 2 || body.input.trim().length > 120) {
        return json({ error: "請輸入至少 2 個字的地點名稱。" }, 400);
      }
      const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
        },
        body: JSON.stringify({
          input: body.input.trim(),
          languageCode: "zh-TW",
          includeQueryPredictions: false,
        }),
      });
      if (!response.ok) return json({ error: "地點搜尋暫時無法使用。" }, 502);
      const payload = await response.json();
      const suggestions = isRecord(payload) && Array.isArray(payload.suggestions) ? payload.suggestions : [];
      const candidates = suggestions.flatMap((suggestion) => {
        if (!isRecord(suggestion) || !isRecord(suggestion.placePrediction)) return [];
        const prediction = suggestion.placePrediction;
        if (typeof prediction.placeId !== "string" || !isRecord(prediction.text) || typeof prediction.text.text !== "string") return [];
        const structured = isRecord(prediction.structuredFormat) ? prediction.structuredFormat : null;
        const secondary = structured && isRecord(structured.secondaryText) && typeof structured.secondaryText.text === "string"
          ? structured.secondaryText.text
          : undefined;
        return [{ placeId: prediction.placeId, displayName: prediction.text.text, address: secondary }];
      });
      return json({ candidates });
    }

    if (body.action !== "routeEstimate" || !isPlace(body.origin) || !isPlace(body.destination) ||
      !["drive", "walk", "transit"].includes(String(body.mode))) {
      return json({ error: "路線查詢資料格式不正確。" }, 400);
    }
    if (getPlaceKey(body.origin) === getPlaceKey(body.destination)) {
      return json({ error: "起點與終點不可為同一地點。" }, 400);
    }

    const mode = String(body.mode);
    if (body.departureTime !== undefined && body.departureTime !== "" &&
      !isValidTime(body.departureTime)) {
      return json({ error: "出發時間格式不正確。" }, 400);
    }
    const departureTime = isValidTime(body.departureTime) ? body.departureTime : "12:00";
    const tripDepartureDate = isValidIsoDate(body.tripDepartureDate) ? body.tripDepartureDate : "";
    const activeDay = body.activeDay;
    if (!tripDepartureDate || typeof activeDay !== "number" ||
      !Number.isInteger(activeDay) || activeDay < 1 || activeDay > 366) {
      return json({ error: "旅程日期格式不正確。" }, 400);
    }
    const itineraryDate = new Date(`${tripDepartureDate}T00:00:00Z`);
    itineraryDate.setUTCDate(itineraryDate.getUTCDate() + activeDay - 1);
    const departureBucket = mode === "transit"
      ? `${itineraryDate.getUTCDay()}:${departureTime}`
      : null;
    const originKey = getPlaceKey(body.origin);
    const destinationKey = getPlaceKey(body.destination);
    const cacheKey = await sha256([body.tripId, originKey, destinationKey, mode, departureBucket ?? ""].join("|"));

    await clients.admin
      .from("route_estimate_cache")
      .delete()
      .eq("trip_id", body.tripId)
      .lte("expires_at", new Date().toISOString());

    const { data: cached } = await clients.admin
      .from("route_estimate_cache")
      .select("duration_seconds, distance_meters, transit_daytime_fallback, transit_vehicle, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached) {
      return json({
        durationSeconds: cached.duration_seconds,
        distanceMeters: cached.distance_meters,
        transitDaytimeFallback: cached.transit_daytime_fallback,
        transitVehicle: cached.transit_vehicle ?? undefined,
        cached: true,
        expiresAt: cached.expires_at,
      });
    }

    const { data: claimed, error: claimError } = await clients.admin.rpc(
      "tc_claim_route_query_slot",
      { maximum_requests: ROUTE_DAILY_LIMIT },
    );
    if (claimError) throw claimError;
    if (!claimed) return json({ error: "今日路線查詢已達 100 次上限，請明日再試。" }, 429);

    let daytimeFallback = false;
    let referenceDeparture = mode === "transit"
      ? getReferenceDeparture(tripDepartureDate, activeDay, departureTime, false)
      : undefined;
    let route = await requestRoute(apiKey, {
      origin: body.origin,
      destination: body.destination,
      mode,
      departureTime: referenceDeparture ?? undefined,
    });
    if (!route && mode === "transit") {
      daytimeFallback = true;
      referenceDeparture = getReferenceDeparture(tripDepartureDate, activeDay, departureTime, true);
      route = await requestRoute(apiKey, {
        origin: body.origin,
        destination: body.destination,
        mode,
        departureTime: referenceDeparture ?? undefined,
      });
    }
    if (!route) return json({ error: "目前查不到可用的路線結果。" }, 502);

    const durationSeconds = parseDurationSeconds(route.duration);
    const distanceMeters = typeof route.distanceMeters === "number" ? Math.round(route.distanceMeters) : null;
    if (!durationSeconds || distanceMeters === null || distanceMeters < 0) {
      return json({ error: "路線服務回傳資料不完整。" }, 502);
    }
    const transitVehicle = mode === "transit" ? getTransitVehicle(route) : null;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: cacheError } = await clients.admin.from("route_estimate_cache").upsert({
      cache_key: cacheKey,
      trip_id: body.tripId,
      travel_mode: mode,
      origin_key: originKey,
      destination_key: destinationKey,
      departure_bucket: departureBucket,
      duration_seconds: durationSeconds,
      distance_meters: distanceMeters,
      transit_daytime_fallback: daytimeFallback,
      transit_vehicle: transitVehicle,
      expires_at: expiresAt,
    });
    if (cacheError) console.warn("Failed to cache route estimate", cacheError);

    return json({
      durationSeconds,
      distanceMeters,
      transitDaytimeFallback: daytimeFallback,
      transitVehicle: transitVehicle ?? undefined,
      cached: false,
      expiresAt,
    });
  } catch (error) {
    console.error("travel-route failed", error);
    return json({ error: "地圖服務暫時無法使用。" }, 500);
  }
});
