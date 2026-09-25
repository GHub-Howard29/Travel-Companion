import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  isPlace,
  isRecord,
  isValidIsoDate,
  isValidTime,
  normalizeTransitVehicle,
  parseDurationSeconds,
  resolveSupabaseRuntimeKey,
} from "./validation.ts";
import { runCommonsPrecisionContinuationEngine, runCommonsPrecisionEngine } from "./commonsPrecisionEngine.ts";
import { executeCommonsPrecisionRequest } from "./commonsPrecisionFetch.ts";
import {
  COMMONS_PRECISION_MAX_DURATION_MS,
  COMMONS_PRECISION_MAX_INSPECTED,
  COMMONS_PRECISION_MAX_REQUESTS,
  projectCommonsPrecisionResponse,
  type CommonsPrecisionPublicResponse,
} from "./commonsPrecision.ts";
import {
  COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS,
  COMMONS_PRECISION_ENTITY_CACHE_TTL_MS,
  createCommonsPrecisionCandidateCacheKey,
  createCommonsPrecisionEntityCacheKey,
  createCommonsPrecisionNoSuitableCacheKey,
} from "./commonsPrecisionCache.ts";
import {
  acquireCommonsPrecisionOperationLock,
  claimCommonsAiCandidateSlot,
  acquireCommonsPrecisionUpstreamLock,
  claimCommonsPrecisionUpstreamSlot,
  readCommonsPrecisionCache,
  recordCommonsPrecisionUsage,
  releaseCommonsPrecisionOperationLock,
  releaseCommonsPrecisionUpstreamLock,
  writeCommonsPrecisionCache,
} from "./commonsPrecisionDatabase.ts";
import { getCommonsPrecisionTaipeiDateKey } from "./commonsPrecisionQuota.ts";
import { requestCommonsAiCandidates, type CommonsAiLanguage } from "./commonsAiCandidates.ts";
import { createCommonsPrecisionUsageDelta } from "./commonsPrecisionUsage.ts";
import {
  hashAdoptedCommonsQuery,
  importCommonsPrecisionTokenKey,
  openCommonsPrecisionNextPageToken,
  sealCommonsPrecisionNextPageToken,
} from "./commonsPrecisionSession.ts";
import type { WikidataEntityEvidence } from "./commonsPrecisionWikimedia.ts";
import {
  COMMONS_PRECISION_REGRESSION_FIXTURE_HEADER,
  getCommonsPrecisionRegressionFixture,
  isLoopbackSupabaseRuntime,
} from "./commonsPrecisionRegressionFixture.ts";

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_COMPUTE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const ROUTE_DAILY_LIMIT = 100;
const PLACE_PHOTO_MONTHLY_LIMIT = 1_000;
const MAX_PLACE_PHOTO_CANDIDATES = 5;
const MAX_COMMONS_CANDIDATES = 6;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-travel-companion-client-id, x-travel-companion-regression-fixture",
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

const getSupabaseRuntimeKeys = () => ({
  publishableKey: resolveSupabaseRuntimeKey(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  ),
  secretKey: resolveSupabaseRuntimeKey(
    Deno.env.get("SUPABASE_SECRET_KEYS"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
});

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getPlaceKey = (place: { placeId: string }) => `place:${place.placeId.trim()}`;

const cleanMetadataText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return text || undefined;
};

const metadataValue = (metadata: Record<string, unknown>, key: string): string | undefined => {
  const field = metadata[key];
  return isRecord(field) ? cleanMetadataText(field.value) : undefined;
};

const isAllowedCommonsLicense = (license: string): boolean =>
  /^(?:CC0(?: 1\.0)?|Public domain|CC BY (?:1\.0|2\.0|2\.5|3\.0|4\.0))$/i.test(license.trim());

const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeCommonsThumbnailUrl = (value: string): string => {
  const url = new URL(value);
  if (url.hostname === "thumb.wikimedia.org") url.hostname = "upload.wikimedia.org";
  return url.toString();
};

const getCommonsDerivativeUrl = (value: string, width: number): string | undefined => {
  const normalized = normalizeCommonsThumbnailUrl(value);
  const url = new URL(normalized);
  if (url.hostname !== "upload.wikimedia.org" || !/\/\d+px-[^/]+$/.test(url.pathname)) return undefined;
  url.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
  return url.toString();
};

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
  const { publishableKey, secretKey } = getSupabaseRuntimeKeys();
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
    if (body.action === "placeAutocomplete") {
      const apiKey = requiredEnv("GOOGLE_MAPS_API_KEY");
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

    if (body.action === "placePhotos") {
      const rawPlaceIds = Array.isArray(body.placeIds) ? body.placeIds : [];
      const placeIds = [...new Set(rawPlaceIds.filter((value): value is string =>
        typeof value === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(value)
      ))].slice(0, MAX_PLACE_PHOTO_CANDIDATES);
      if (placeIds.length === 0) return json({ photos: [] });

      const { data: claimed, error: claimError } = await clients.admin.rpc(
        "tc_claim_place_photo_slots",
        { requested_slots: placeIds.length, maximum_requests: PLACE_PHOTO_MONTHLY_LIMIT },
      );
      if (claimError) throw claimError;
      if (!claimed) return json({ photos: [], limitReached: true });

      const apiKey = requiredEnv("GOOGLE_MAPS_API_KEY");
      const photos = (await Promise.all(placeIds.map(async (placeId) => {
        try {
          const detailsResponse = await fetch(`${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
            headers: {
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "photos",
            },
            signal: AbortSignal.timeout(8_000),
          });
          if (!detailsResponse.ok) return null;
          const details = await detailsResponse.json();
          const photo = isRecord(details) && Array.isArray(details.photos) && isRecord(details.photos[0])
            ? details.photos[0]
            : null;
          if (!photo || typeof photo.name !== "string" ||
            !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)) return null;

          const mediaUrl = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
          mediaUrl.searchParams.set("maxWidthPx", "320");
          mediaUrl.searchParams.set("maxHeightPx", "180");
          mediaUrl.searchParams.set("skipHttpRedirect", "true");
          mediaUrl.searchParams.set("key", apiKey);
          const mediaResponse = await fetch(mediaUrl, { signal: AbortSignal.timeout(8_000) });
          if (!mediaResponse.ok) return null;
          const media = await mediaResponse.json();
          if (!isRecord(media) || !isHttpsUrl(media.photoUri)) return null;

          const authorAttributions = Array.isArray(photo.authorAttributions)
            ? photo.authorAttributions.flatMap((entry) => {
                if (!isRecord(entry) || typeof entry.displayName !== "string") return [];
                return [{
                  displayName: entry.displayName.slice(0, 200),
                  uri: isHttpsUrl(entry.uri) ? entry.uri : undefined,
                }];
              }).slice(0, 3)
            : [];
          return {
            placeId,
            photoUri: media.photoUri,
            authorAttributions,
          };
        } catch {
          return null;
        }
      }))).filter((photo) => photo !== null);
      return json({ photos, limitReached: false });
    }

    if (body.action === "commonsSuggestSearchTerms") {
      if (typeof body.rawInput !== "string" || body.rawInput.trim().length < 2 || body.rawInput.trim().length > 240) {
        return json({ error: "請輸入 2 至 240 個字的公開地點文字。", state: "ai-invalid-response" }, 400);
      }
      const targetLanguage = body.targetLanguage === "en" || body.targetLanguage === "ja" || body.targetLanguage === "zh-Hant"
        ? body.targetLanguage as CommonsAiLanguage : "zh-Hant";
      const excludedQueries = Array.isArray(body.excludedQueries)
        ? body.excludedQueries.filter((value): value is string => typeof value === "string").slice(0, 6)
        : [];
      const apiKey = requiredEnv("GEMINI_API_KEY");
      if (!await claimCommonsAiCandidateSlot(clients.admin)) {
        return json({ error: "今日候選詞額度已用完，可直接搜尋原始輸入。", state: "ai-quota-reached" }, 429);
      }
      try {
        const candidates = await requestCommonsAiCandidates({ rawInput: body.rawInput, targetLanguage, excludedQueries, apiKey });
        return json({ state: candidates.length > 0 ? "results" : "no-ai-candidate", candidates });
      } catch (error) {
        const state = error instanceof Error && ["ai-quota-reached", "ai-invalid-response", "ai-unavailable"].includes(error.message)
          ? error.message : "ai-unavailable";
        return json({ error: state === "ai-invalid-response" ? "候選詞回應格式不正確，可直接搜尋原始輸入。" : "候選詞暫時無法使用，可直接搜尋原始輸入。", state }, state === "ai-quota-reached" ? 429 : 502);
      }
    }

    if (body.action === "commonsPhotoSearch") {
      if (typeof body.query !== "string" || body.query.trim().length < 2 || body.query.trim().length > 120) {
        return json({ error: "請輸入至少 2 個字的照片搜尋詞。" }, 400);
      }
      const offset = body.offset === undefined ? 0 : body.offset;
      if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 10_000) {
        return json({ error: "照片搜尋分頁資訊無效。" }, 400);
      }
      const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: body.query.trim(),
        gsrnamespace: "6",
        gsrlimit: String(MAX_COMMONS_CANDIDATES),
        prop: "imageinfo",
        iiprop: "url|mime|thumbmime|mediatype|size|sha1|timestamp|extmetadata",
        iiurlwidth: "640",
        iiextmetadatalanguage: "en",
        iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|Restrictions",
        format: "json",
        origin: "*",
      });
      if (Number(offset) > 0) {
        params.set("continue", "gsroffset||");
        params.set("gsroffset", String(offset));
      }
      const response = await fetch(`${COMMONS_API_URL}?${params}`, {
        headers: { "User-Agent": "Travel-Companion/3.9.0 (Wikimedia Commons photo selector)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 429) return json({ error: "照片來源目前忙碌，請稍後再試。" }, 429);
      if (!response.ok) return json({ error: "照片搜尋暫時無法使用。" }, 502);
      const payload = await response.json();
      const pages = isRecord(payload) && isRecord(payload.query) && isRecord(payload.query.pages)
        ? Object.values(payload.query.pages)
        : [];
      const candidates = pages.flatMap((page) => {
        if (!isRecord(page) || typeof page.title !== "string" || !page.title.startsWith("File:") ||
          !Array.isArray(page.imageinfo) || !isRecord(page.imageinfo[0])) return [];
        const info = page.imageinfo[0];
        const metadata = isRecord(info.extmetadata) ? info.extmetadata : {};
        const license = metadataValue(metadata, "LicenseShortName") ?? metadataValue(metadata, "UsageTerms");
        const creator = metadataValue(metadata, "Artist");
        const credit = metadataValue(metadata, "Credit")?.slice(0, 500);
        const restrictions = metadataValue(metadata, "Restrictions");
        const licenseUrl = metadataValue(metadata, "LicenseUrl");
        const isPublicDomain = license?.toLowerCase() === "public domain" || license?.toLowerCase().startsWith("cc0");
        const isCcBy = /^CC BY (?:1\.0|2\.0|2\.5|3\.0|4\.0)$/i.test(license ?? "");
        const cropImageUrl = typeof info.thumburl === "string" ? getCommonsDerivativeUrl(info.thumburl, 1280) : undefined;
        if (info.mediatype !== "BITMAP" || !["image/jpeg", "image/png", "image/webp"].includes(String(info.thumbmime)) ||
          !license || !creator || !isAllowedCommonsLicense(license) || restrictions ||
          !isHttpsUrl(info.thumburl) || !cropImageUrl || !isHttpsUrl(info.descriptionurl) ||
          (!isPublicDomain && !isHttpsUrl(licenseUrl)) || (isCcBy && !credit)) return [];
        return [{
          fileTitle: page.title,
          thumbnailUrl: normalizeCommonsThumbnailUrl(info.thumburl),
          cropImageUrl,
          thumbnailMime: info.thumbmime,
          sourcePageUrl: info.descriptionurl,
          creator: creator.slice(0, 500),
          credit,
          license: license.slice(0, 100),
          licenseUrl: isHttpsUrl(licenseUrl) ? licenseUrl : undefined,
          sourceSha1: typeof info.sha1 === "string" ? info.sha1 : undefined,
          sourceRevisionAt: typeof info.timestamp === "string" ? info.timestamp : undefined,
          width: typeof info.width === "number" ? info.width : 0,
          height: typeof info.height === "number" ? info.height : 0,
        }];
      }).slice(0, MAX_COMMONS_CANDIDATES);
      const rawNextOffset = isRecord(payload) && isRecord(payload.continue)
        ? payload.continue.gsroffset
        : null;
      const parsedNextOffset = (typeof rawNextOffset === "number" || typeof rawNextOffset === "string") &&
          Number.isInteger(Number(rawNextOffset)) && Number(rawNextOffset) >= 0
        ? Number(rawNextOffset)
        : null;
      const nextOffset = parsedNextOffset ?? (candidates.length === MAX_COMMONS_CANDIDATES && Number(offset) < 10_000
        ? Number(offset) + MAX_COMMONS_CANDIDATES
        : null);
      return json({ candidates, nextOffset });
    }

    if (body.action === "commonsPrecisionSearch") {
      if (typeof body.query !== "string" || body.query.trim().length < 2 || body.query.trim().length > 120) {
        return json({ error: "請輸入 2 至 120 個字的照片搜尋詞。" }, 400);
      }
      const language = typeof body.language === "string" && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(body.language.trim())
        ? body.language.trim()
        : "zh-Hant";
      const query = body.query.normalize("NFKC").replace(/\s+/g, " ").trim();
      const regressionFixture = isLoopbackSupabaseRuntime(Deno.env.get("SUPABASE_URL") ?? "")
        ? getCommonsPrecisionRegressionFixture(
          request.headers.get(COMMONS_PRECISION_REGRESSION_FIXTURE_HEADER),
        )
        : null;
      if (regressionFixture) return json(regressionFixture);
      const queryHash = await sha256(query);
      const scopedQueryHash = queryHash;
      const adoptedQueryHash = await hashAdoptedCommonsQuery(query);
      const nextPageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : undefined;
      if (body.nextPageToken !== undefined && (!nextPageToken || nextPageToken.length > 4096)) {
        return json({ error: "照片搜尋 session 已失效，請重新搜尋。", state: "session-expired" }, 400);
      }
      const candidateKey = createCommonsPrecisionCandidateCacheKey({ queryHash: scopedQueryHash, language });
      const noSuitableKey = createCommonsPrecisionNoSuitableCacheKey({ queryHash: scopedQueryHash, language });
      const lockKey = `lock:commons-precision-v2:${await sha256(`${scopedQueryHash}:${language.toLowerCase()}`)}`;
      const startedAtMs = Date.now();
      const cached = nextPageToken ? null : await readCommonsPrecisionCache<CommonsPrecisionPublicResponse>(clients.admin, candidateKey, "candidate-results");
      if (cached) {
        await recordCommonsPrecisionUsage(clients.admin, getCommonsPrecisionTaipeiDateKey(Date.now()), createCommonsPrecisionUsageDelta({
          state: "results", upstreamRequests: 0, durationMs: Math.min(20_000, Date.now() - startedAtMs), candidateCacheHit: true,
        }));
        return json(cached);
      }
      const cachedEmpty = nextPageToken ? null : await readCommonsPrecisionCache<CommonsPrecisionPublicResponse>(clients.admin, noSuitableKey, "no-suitable-image");
      if (cachedEmpty) {
        await recordCommonsPrecisionUsage(clients.admin, getCommonsPrecisionTaipeiDateKey(Date.now()), createCommonsPrecisionUsageDelta({
          state: "no-suitable-image", upstreamRequests: 0, durationMs: Math.min(20_000, Date.now() - startedAtMs), noSuitableCacheHit: true,
        }));
        return json(cachedEmpty);
      }
      if (!await acquireCommonsPrecisionOperationLock(clients.admin, lockKey)) {
        return json({ error: "精準照片搜尋正在處理中，請稍後由管理者重新操作。", state: "in-progress" }, 409);
      }
      try {
        const contactUrl = requiredEnv("WIKIMEDIA_CONTACT_URL");
        const tokenSecret = requiredEnv("COMMONS_PRECISION_TOKEN_SECRET");
        const tokenKey = await importCommonsPrecisionTokenKey(new TextEncoder().encode(tokenSecret));
        const transport = {
          request: async (plan) => {
            const token = crypto.randomUUID();
            if (!await acquireCommonsPrecisionUpstreamLock(clients.admin, token)) return { state: "in-progress" };
            try {
              if (!await claimCommonsPrecisionUpstreamSlot(clients.admin)) return { state: "project-quota-reached" };
              return await executeCommonsPrecisionRequest(plan, contactUrl);
            } finally {
              await releaseCommonsPrecisionUpstreamLock(clients.admin, token);
            }
          },
        };
        let result;
        if (nextPageToken) {
          const opened = await openCommonsPrecisionNextPageToken(nextPageToken, tokenKey, { nowMs: Date.now(), adoptedQueryHash });
          if (opened.status !== "valid") return json({ error: "照片搜尋 session 已失效，請重新搜尋。", state: "session-expired" }, 400);
          const entityEvidence = opened.session.qid
            ? await readCommonsPrecisionCache<WikidataEntityEvidence>(clients.admin, createCommonsPrecisionEntityCacheKey(opened.session.qid), "entity-evidence")
            : undefined;
          if (opened.session.qid && !entityEvidence) return json({ error: "照片搜尋 session 已失效，請重新搜尋。", state: "session-expired" }, 400);
          result = await runCommonsPrecisionContinuationEngine({
            query,
            entityEvidence,
            tier: opened.session.tier,
            layer: opened.session.layer,
            continuation: opened.session.continuation,
            seenPageIds: opened.session.seenPageIds,
            initialRequestCount: opened.session.requestCount,
            initialDurationMs: opened.session.durationMs,
          }, transport);
        } else {
          result = await runCommonsPrecisionEngine({ query, language }, transport);
          if (result.entityEvidence) {
            await writeCommonsPrecisionCache(clients.admin, {
              key: createCommonsPrecisionEntityCacheKey(result.entityEvidence.qid), kind: "entity-evidence", payload: result.entityEvidence,
              expiresAt: new Date(Date.now() + COMMONS_PRECISION_ENTITY_CACHE_TTL_MS),
            });
          }
        }
        const hasSessionBudget = result.sessionRequestCount < COMMONS_PRECISION_MAX_REQUESTS &&
          result.sessionDurationMs < COMMONS_PRECISION_MAX_DURATION_MS &&
          result.seenPageIds.length < COMMONS_PRECISION_MAX_INSPECTED;
        const sealedNextPageToken = hasSessionBudget && result.response.state === "results" &&
          result.response.candidates.length === 6 && result.continuation
          ? await sealCommonsPrecisionNextPageToken({
              ...(result.qid ? { qid: result.qid } : {}),
              tier: result.continuation.tier,
              adoptedQueryHash,
              layer: result.continuation.layer,
              continuation: result.continuation.value,
              seenPageIds: result.seenPageIds,
              requestCount: result.sessionRequestCount,
              durationMs: result.sessionDurationMs,
            }, tokenKey, Date.now())
          : undefined;
        const response = projectCommonsPrecisionResponse({
          ...result.response,
          nextPageToken: sealedNextPageToken,
        });
        if (!nextPageToken && !response.nextPageToken && response.state === "results") {
          await writeCommonsPrecisionCache(clients.admin, {
            key: candidateKey, kind: "candidate-results", payload: response,
            expiresAt: new Date(Date.now() + COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS),
          });
        } else if (!nextPageToken && response.state === "no-suitable-image" && !response.nextPageToken) {
          await writeCommonsPrecisionCache(clients.admin, {
            key: noSuitableKey, kind: "no-suitable-image", payload: response,
            expiresAt: new Date(Date.now() + COMMONS_PRECISION_CANDIDATE_CACHE_TTL_MS),
          });
        }
        await recordCommonsPrecisionUsage(clients.admin, getCommonsPrecisionTaipeiDateKey(Date.now()), createCommonsPrecisionUsageDelta({
          state: response.state,
          upstreamRequests: result.requestCount,
          durationMs: result.durationMs,
          allCandidatesRejected: result.allCandidatesRejected,
          upstreamStatus: result.upstreamStatus,
        }));
        if (response.state === "in-progress") return json({ error: "精準照片搜尋正在處理中，請稍後由管理者重新操作。", state: response.state }, 409);
        return json(response);
      } finally {
        await releaseCommonsPrecisionOperationLock(clients.admin, lockKey);
      }
    }

    if (body.action !== "routeEstimate" || !isPlace(body.origin) || !isPlace(body.destination) ||
      !["drive", "walk", "transit"].includes(String(body.mode))) {
      return json({ error: "路線查詢資料格式不正確。" }, 400);
    }
    if (getPlaceKey(body.origin) === getPlaceKey(body.destination)) {
      return json({ error: "起點與終點不可為同一地點。" }, 400);
    }

    const mode = String(body.mode);
    const apiKey = requiredEnv("GOOGLE_MAPS_API_KEY");
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
