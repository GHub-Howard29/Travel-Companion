import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20261103150000_v3110_trip_excel_create_rpc.sql",
  "utf8",
);
const normalized = migration.toLowerCase();
const upgradeMigration = await readFile(
  "supabase/migrations/20261106160000_v3110_trip_excel_request_recovery.sql",
  "utf8",
);
const normalizedUpgrade = upgradeMigration.toLowerCase();

const upgradeRequired = [
  "begin;",
  "commit;",
  "to_regclass('private.tc_trip_excel_create_requests')",
  "if v_table is null then",
  "where user_id is null",
  "v_table",
  "con.contype = 'f'",
  "con.conrelid = v_table",
  "con.confrelid = 'auth.users'::regclass",
  "drop constraint %i",
  "alter column user_id set not null",
  "public.tc_get_trip_excel_create_request",
  "where request_id = p_request_id",
  "and user_id = v_user_id",
  "'status', 'not_found'",
  "'status', 'trip_deleted'",
  "security definer",
  "set search_path = ''",
  "private.tc_is_super_admin()",
  "revoke all on function",
  "grant execute on function",
  "from public, anon, authenticated, service_role",
  "to authenticated",
];

for (const fragment of upgradeRequired) {
  assert.ok(
    normalizedUpgrade.includes(fragment.toLowerCase()),
    "Upgrade migration is missing required safeguard or behavior: " + fragment,
  );
}

assert.ok(
  normalizedUpgrade.includes("for v_constraint in") &&
    normalizedUpgrade.includes("execute format(") &&
    normalizedUpgrade.includes("drop constraint %i"),
  "Upgrade must discover and safely drop matching Auth foreign keys.",
);
assert.ok(
  normalizedUpgrade.includes("con.conrelid = v_table") &&
    normalizedUpgrade.includes("con.confrelid = 'auth.users'::regclass"),
  "Upgrade must restrict FK removal to this registry referencing auth.users.",
);
assert.doesNotMatch(
  upgradeMigration,
  /drop constraint\s+tc_trip_excel_create_requests_user_id_fkey/i,
  "Upgrade must discover the actual Auth FK name, not assume a generated constraint name.",
);

const required = [
  "begin;",
  "commit;",
  "security definer",
  "set search_path = ''",
  "auth.uid()",
  "private.tc_is_super_admin()",
  "private.tc_trip_excel_create_requests",
  "user_id uuid not null,",
  "keep the original owner uuid as an immutable identity marker",
  "public.tc_get_trip_excel_create_request",
  "where request_id = p_request_id",
  "and user_id = v_user_id",
  "'status', 'not_found'",
  "'status', 'trip_deleted'",
  "on conflict (request_id) do nothing",
  "payload_hash",
  "public.admin_profiles",
  "public.admin_users",
  "join auth.users",
  "include_in_new_trip = true",
  "jsonb_array_length(v_participants) = 0",
  "tc_excel_default_participants_missing",
  "extensions.digest(",
  "public.trips",
  "public.other_info_items",
  "private.trip_participant_email_maps",
  "other-info-attractions",
  "other-info-other",
  "special-info-guided",
  "generate_series(1, v_day_count)",
  "tc_excel_request_payload_mismatch",
  "tc_excel_super_admin_required",
  "revoke all on function",
  "grant execute on function",
  "from public, anon, authenticated, service_role",
  "to authenticated",
];

for (const fragment of required) {
  assert.ok(
    normalized.includes(fragment.toLowerCase()),
    "Migration is missing required safeguard or behavior: " + fragment,
  );
}

assert.equal(
  /unique\s*\([^)]*title[^)]*departure_date|unique\s*\([^)]*departure_date[^)]*title/i.test(migration),
  false,
  "TRIP title/date must not become a uniqueness key.",
);
assert.equal(
  /drop policy\s+trips_insert_policy|create policy\s+trips_insert_policy/i.test(migration),
  false,
  "Excel RPC must not alter the general Trips INSERT RLS policy.",
);
assert.equal(
  normalized.split("insert into public.trips").length - 1,
  1,
  "The RPC should have one Trip insert location.",
);
assert.equal(
  normalized.split("insert into public.other_info_items").length - 1,
  1,
  "The RPC should create exactly one special Other Info row.",
);
assert.equal(
  normalized.split("insert into private.trip_participant_email_maps").length - 1,
  1,
  "The RPC must store participant email mappings privately in the same transaction.",
);

const contentStart = normalized.indexOf(
  "jsonb_build_object(",
  normalized.indexOf("insert into public.trips"),
);
const contentEnd = normalized.indexOf("),\n    v_user_id", contentStart);
assert.ok(contentStart >= 0 && contentEnd > contentStart, "Could not locate public Trip content JSON.");
const publicContent = normalized.slice(contentStart, contentEnd);
assert.equal(
  publicContent.includes("participantemailmap"),
  false,
  "Private participant emails must never be embedded in public Trip content.",
);

const tripIdPosition = normalized.indexOf("v_trip_id := 'trip-'");
const privateMapPosition = normalized.indexOf("insert into private.trip_participant_email_maps");
const tripInsertPosition = normalized.indexOf("insert into public.trips");
assert.ok(
  tripIdPosition >= 0 && tripIdPosition < privateMapPosition && privateMapPosition < tripInsertPosition,
  "Private email mapping must be inserted after Trip ID generation and before Trip insertion.",
);

assert.ok(
  /join\s+auth\.users\s+u\s+on\s+u\.id\s*=\s*p\.user_id/i.test(migration),
  "Participant defaults must be tied to the Auth user ID.",
);
assert.match(migration, /idempotent_replay/);
assert.match(migration, /return v_existing\.response_payload/);
assert.match(migration, /response_payload = v_result/);

const app = await readFile("src/App.tsx", "utf8");
const modal = await readFile("src/components/TripEditorModal.tsx", "utf8");
assert.match(modal, /onCreateFromExcel/);
assert.match(modal, /EXCEL_PENDING_REQUEST_KEY/);
assert.match(modal, /getExcelRequestFingerprint/);
assert.match(modal, /sessionStorage\.setItem/);
assert.match(modal, /sessionStorage\.removeItem/);
assert.match(modal, /上次建立結果尚未確認，請檢視資料後使用同一份 Excel 重試/);
assert.match(modal, /defaultCurrencyCode/);
assert.match(modal, /defaultCurrencySymbol/);
assert.match(modal, /getPendingExcelRequest/);
assert.match(modal, /decideTripExcelRetry/);
assert.match(modal, /writePendingExcelRequest\(pendingForRecovery\)/);
const cloudService = await readFile("src/services/tripCloudService.ts", "utf8");
assert.match(cloudService, /content\.days\.every\(\(day\) =>/);
assert.match(cloudService, /daysData may contain legacy metadata/);
assert.doesNotMatch(
  cloudService,
  /Object\.values\(content\.daysData\)\.every\(Array\.isArray\)/,
  "Trip parsing must allow metadata keys such as daysData.mode while validating declared day arrays.",
);
const retryPolicy = await readFile("src/services/tripExcelCreateRetry.ts", "utf8");
assert.match(retryPolicy, /TRIP_EXCEL_CREATE_COOLDOWN_MS = 60_000/);
assert.match(retryPolicy, /TRIP_EXCEL_CREATE_MAX_MANUAL_RETRIES = 1/);
assert.match(retryPolicy, /resultUnconfirmed/);
assert.match(modal, /selectedCurrencyCode = defaultCurrencyCode\.trim\(\)/);
assert.match(modal, /selectedCurrencySymbol = defaultCurrencySymbol\.trim\(\)/);
assert.match(modal, /系統預設幣別：/);
assert.doesNotMatch(modal, /isExcelCurrencyConfirmed|預設幣別已變更|currentDefaultCurrencyCode !== currencyCode|確認幣別並建立 TRIP/);
assert.match(app, /defaultCurrencyCode=\{DEFAULT_TRIP_CURRENCY\.code\}/);
assert.match(app, /defaultCurrencySymbol=\{DEFAULT_TRIP_CURRENCY\.symbol\}/);
assert.match(app, /import \{[\s\S]*?DEFAULT_TRIP_CURRENCY[\s\S]*?from "\.\/types"/);
assert.match(modal, /trip\?\.currencyConfig\.code \?\? defaultCurrencyCode/);
assert.match(modal, /trip\?\.currencyConfig\.symbol \?\? defaultCurrencySymbol/);
const tripTypes = await readFile("src/types/trip.ts", "utf8");
assert.match(tripTypes, /export const DEFAULT_TRIP_CURRENCY = \{/);
assert.match(tripTypes, /code: "TWD"/);
assert.match(tripTypes, /symbol: "NT\$"/);
assert.match(
  tripTypes,
  /Shared default used by the existing manual-create form and Excel V1/,
  "Manual Trip creation and Excel V1 must retain one shared default currency source.",
);
assert.doesNotMatch(modal, /Excel 建立尚未開放/);

const service = await readFile("src/services/tripExcelCreateService.ts", "utf8");
for (const fragment of [
  "supabase.auth.getSession()",
  "supabase.auth.refreshSession()",
  "supabase.auth.getUser()",
  'eq("role", "super_admin")',
  'rpc("tc_create_trip_from_excel"',
  "requestId",
  "idempotent_replay",
  '"tc_get_trip_excel_create_request"',
  "lookupPayload.status === \"NOT_FOUND\"",
  "lookupPayload.status === \"TRIP_DELETED\"",
  "RESULT_UNCONFIRMED",
]) {
  assert.ok(service.includes(fragment), "Excel create service is missing: " + fragment);
}
assert.match(service, /item\.time/);
assert.match(service, /item\.departureTime/);
assert.ok(
  service.indexOf("supabase.auth.getSession()") <
    service.indexOf("supabase.auth.refreshSession()") &&
    service.indexOf("supabase.auth.refreshSession()") <
      service.indexOf("supabase.auth.getUser()") &&
    service.indexOf("supabase.auth.getUser()") <
      service.indexOf('.from("admin_users")') &&
    service.indexOf('.from("admin_users")') <
      service.indexOf('rpc("tc_create_trip_from_excel"'),
  "Session refresh, refreshed-user verification, Super Admin check and RPC must run in order.",
);
assert.match(service, /refreshedSession\.user\.id !== expectedUserId/);
assert.match(service, /normalizeEmail\(refreshedSession\.user\.email\)/);
assert.doesNotMatch(service, /signInWithOAuth|signInWithIdToken/);
assert.doesNotMatch(service, /typeColor:\s*item\.typeColor/);
assert.doesNotMatch(service, /location:\s*item\.location/);

assert.match(app, /onCreateFromExcel=\{handleTripExcelCreate\}/);
assert.match(app, /refreshTripOptionsAndSelect\(result\.tripId\)/);

console.log("Trip Excel RPC verification passed: database safeguards, Super Admin/session checks, system-default currency, dedicated RPC wiring, and authoritative refresh.");
