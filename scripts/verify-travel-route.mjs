import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isPlace,
  isValidIsoDate,
  isValidTime,
  normalizeTransitVehicle,
  parseDurationSeconds,
  resolveSupabaseRuntimeKey,
} from "../supabase/functions/travel-route/validation.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const functionSource = readFileSync(
  resolve(projectRoot, "supabase/functions/travel-route/index.ts"),
  "utf8",
);
const clientSource = readFileSync(
  resolve(projectRoot, "src/services/travelRouteService.ts"),
  "utf8",
);
const itineraryPageSource = readFileSync(
  resolve(projectRoot, "src/components/ItineraryPage.tsx"),
  "utf8",
);
const reservationMigration = readFileSync(
  resolve(projectRoot, "supabase/migrations/20261127100000_route_estimate_keyed_reservation.sql"),
  "utf8",
);
const reservationSqlRegression = readFileSync(
  resolve(projectRoot, "scripts/test-route-estimate-reservation.sql"),
  "utf8",
);

assert.equal(isPlace({ placeId: "ChIJ_valid-place" }), true);
assert.equal(isPlace({ placeId: "short" }), false);
assert.equal(isValidTime("00:00"), true);
assert.equal(isValidTime("23:59"), true);
assert.equal(isValidTime("24:00"), false);
assert.equal(isValidTime("99:99"), false);
assert.equal(isValidIsoDate("2028-02-29"), true);
assert.equal(isValidIsoDate("2027-02-29"), false);
assert.equal(isValidIsoDate("2026-02-31"), false);
assert.equal(parseDurationSeconds("1260s"), 1260);
assert.equal(parseDurationSeconds("1.5s"), 2);
assert.equal(parseDurationSeconds("0s"), null);
assert.equal(normalizeTransitVehicle("BUS"), "bus");
assert.equal(normalizeTransitVehicle("SUBWAY"), "subway");
assert.equal(normalizeTransitVehicle("HEAVY_RAIL"), "rail");

assert.equal(
  resolveSupabaseRuntimeKey(
    JSON.stringify({ default: "sb_publishable_current" }),
    "legacy-anon-key",
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  ),
  "sb_publishable_current",
);
assert.equal(
  resolveSupabaseRuntimeKey(
    undefined,
    "legacy-service-role-key",
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
  "legacy-service-role-key",
);
assert.throws(
  () => resolveSupabaseRuntimeKey(
    "not-json",
    "legacy-anon-key",
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  ),
  /Invalid SUPABASE_PUBLISHABLE_KEYS/,
);
assert.throws(
  () => resolveSupabaseRuntimeKey(
    JSON.stringify({ default: "" }),
    "legacy-service-role-key",
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
  /Invalid SUPABASE_SECRET_KEYS/,
);
assert.throws(
  () => resolveSupabaseRuntimeKey(
    undefined,
    undefined,
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
  /Missing SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY/,
);

assert.match(functionSource, /auth\.getUser\(token\)/);
assert.match(functionSource, /role\.role === "super_admin"/);
assert.match(functionSource, /role\.role === "trip_editor" && role\.trip_id === tripId/);
assert.match(functionSource, /Access-Control-Allow-Headers[\s\S]*x-travel-companion-client-id/);
assert.match(functionSource, /tc_claim_route_estimate_reservation/);
assert.match(functionSource, /tc_release_route_estimate_reservation/);
assert.match(functionSource, /tc_store_route_estimate_if_owner/);
assert.match(reservationMigration, /create or replace function public\.tc_store_route_estimate_if_owner/);
assert.match(reservationMigration, /from public\.route_estimate_reservations r[\s\S]*?r\.owner_token = p_owner_token[\s\S]*?r\.expires_at > clock_timestamp\(\)[\s\S]*?on conflict \(cache_key\) do update/i);
assert.match(reservationMigration, /grant execute on function public\.tc_store_route_estimate_if_owner[\s\S]*?to service_role/i);
assert.match(functionSource, /signal: AbortSignal\.timeout\(20_000\)/);
assert.match(functionSource, /const reservationTtlSeconds = 90/);
assert.match(functionSource, /fetch\(GOOGLE_COMPUTE_ROUTES_URL, \{[\s\S]*?AbortSignal\.timeout\(20_000\)/);
assert.match(reservationMigration, /cache_key text primary key/);
assert.match(reservationMigration, /on conflict \(cache_key\) do update[\s\S]*?where reservation\.expires_at <= now\(\)/i);
assert.match(reservationMigration, /where cache_key = p_cache_key\s+and owner_token = p_owner_token/i);
assert.match(reservationMigration, /expires_at > now\(\)/);
assert.match(reservationMigration, /grant execute on function public\.tc_claim_route_estimate_reservation[\s\S]*?to service_role/i);
assert.match(reservationMigration, /grant execute on function public\.tc_store_route_estimate_if_owner[\s\S]*?to service_role/i);
assert.match(reservationMigration, /grant execute on function public\.tc_release_route_estimate_reservation[\s\S]*?to service_role/i);
assert.match(reservationSqlRegression, /v_key text := repeat\('a', 64\)/);
assert.match(reservationSqlRegression, /v_expired_key text := repeat\('c', 64\)/);
assert.match(reservationSqlRegression, /TEST EXPIRED RESERVATION TAKEOVER SHOULD SUCCEED/);
assert.match(reservationSqlRegression, /ROLLBACK/);
assert.match(functionSource, /const waitDeadline = Date\.now\(\) \+ 30_000/);
assert.ok(functionSource.indexOf(".from(\"route_estimate_cache\")\n          .select") < functionSource.indexOf("tc_claim_route_estimate_reservation"),
  "Cache must be rechecked before claiming the keyed reservation");
assert.ok(functionSource.indexOf("tc_claim_route_estimate_reservation") < functionSource.indexOf("tc_claim_route_query_slot"),
  "The per-route reservation must be acquired before consuming the daily quota");
assert.match(functionSource, /if \(ownsReservation\) \{[\s\S]*tc_release_route_estimate_reservation/);
assert.doesNotMatch(functionSource, /SUPABASE_PUBLISHABLE_KEY(?!S)/);
assert.doesNotMatch(functionSource, /SUPABASE_SECRET_KEY(?!S)/);
assert.match(clientSource, /context instanceof Response/);

const routePanelStart = itineraryPageSource.indexOf("const queryTravelMode = async (mode: TravelMode) => {");
const routePanelEnd = itineraryPageSource.indexOf("const saveTravelEstimate = async () => {", routePanelStart);
assert.ok(routePanelStart >= 0 && routePanelEnd > routePanelStart, "Route panel query flow must exist");
const routePanelFlow = itineraryPageSource.slice(routePanelStart, routePanelEnd);
assert.match(routePanelFlow, /const requestGeneration = \+\+routeRequestGenerationRef\.current/);
assert.match(routePanelFlow, /if \(requestGeneration !== routeRequestGenerationRef\.current\) return/);
assert.match(routePanelFlow, /if \(requestGeneration === routeRequestGenerationRef\.current\) \{\s*setIsRouteLoading\(false\)/);
assert.match(itineraryPageSource, /routeRequestGenerationRef\.current \+= 1;[\s\S]{0,180}setIsRouteLoading\(false\);[\s\S]{0,180}setActiveTravelSegment\(\{ origin, destination/,
  "Opening another route segment must invalidate prior requests and reset panel loading");
assert.match(itineraryPageSource, /onClick=\{\(\) => \{\s*routeRequestGenerationRef\.current \+= 1;\s*setIsRouteLoading\(false\);\s*setActiveTravelSegment\(null\)/,
  "Closing the route panel must invalidate in-flight requests");
const previewRenderStart = itineraryPageSource.indexOf('<div className="mt-4 flex min-h-16 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700" aria-live="polite">');
const previewRenderEnd = itineraryPageSource.indexOf("{previewEstimate?.transitDaytimeFallback", previewRenderStart);
assert.ok(previewRenderStart >= 0 && previewRenderEnd > previewRenderStart, "Route preview render block must exist");
const previewRender = itineraryPageSource.slice(previewRenderStart, previewRenderEnd);
assert.ok(previewRender.indexOf("previewEstimate && previewEstimate.mode === selectedTravelMode") < previewRender.indexOf("isRouteLoading ?"),
  "An existing same-mode estimate must stay visible while refreshing");

console.log("Routes Edge input/auth contract and route-panel concurrency/display regression passed.");
