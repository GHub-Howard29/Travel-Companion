import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20261103150000_v3110_trip_excel_create_rpc.sql",
  "utf8",
);
const normalized = migration.toLowerCase();

const required = [
  "begin;",
  "commit;",
  "security definer",
  "set search_path = ''",
  "auth.uid()",
  "private.tc_is_super_admin()",
  "private.tc_trip_excel_create_requests",
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
assert.match(modal, /isExcelCurrencyConfirmed/);
assert.match(modal, /EXCEL_PENDING_REQUEST_KEY/);
assert.match(modal, /getExcelRequestFingerprint/);
assert.match(modal, /sessionStorage\.setItem/);
assert.match(modal, /sessionStorage\.removeItem/);
assert.match(modal, /請先使用同一份 Excel 確認建立結果/);
assert.match(modal, /defaultCurrencyCode/);
assert.match(modal, /defaultCurrencySymbol/);
assert.match(modal, /getExcelRequestFingerprint/);
assert.match(modal, /確認幣別並建立 TRIP/);
assert.match(app, /defaultCurrencyCode="TWD"/);
assert.match(app, /defaultCurrencySymbol="NT\$"/);
assert.doesNotMatch(modal, /Excel 建立尚未開放/);

const service = await readFile("src/services/tripExcelCreateService.ts", "utf8");
for (const fragment of [
  "supabase.auth.getSession()",
  "supabase.auth.getUser()",
  'eq("role", "super_admin")',
  'rpc("tc_create_trip_from_excel"',
  "requestId",
  "idempotent_replay",
]) {
  assert.ok(service.includes(fragment), "Excel create service is missing: " + fragment);
}
assert.match(service, /item\.time/);
assert.match(service, /item\.departureTime/);
assert.doesNotMatch(service, /typeColor:\s*item\.typeColor/);
assert.doesNotMatch(service, /location:\s*item\.location/);

assert.match(app, /onCreateFromExcel=\{handleTripExcelCreate\}/);
assert.match(app, /refreshTripOptionsAndSelect\(result\.tripId\)/);

console.log("Trip Excel RPC verification passed: database safeguards, Super Admin/session checks, explicit currency confirmation, dedicated RPC wiring, and authoritative refresh.");
