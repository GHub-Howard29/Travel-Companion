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
    `Migration is missing required safeguard or behavior: ${fragment}`,
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

// The public Trip JSON must not contain the private participant email map.
const contentStart = normalized.indexOf("jsonb_build_object(", normalized.indexOf("insert into public.trips"));
const contentEnd = normalized.indexOf("),\n    v_user_id", contentStart);
assert.ok(contentStart >= 0 && contentEnd > contentStart, "Could not locate public Trip content JSON.");
const publicContent = normalized.slice(contentStart, contentEnd);
assert.equal(
  publicContent.includes("participantemailmap"),
  false,
  "Private participant emails must never be embedded in public Trip content.",
);

// Private participant mappings must be persisted only after a server-generated Trip ID exists,
// and before the public Trip insert, so every write remains atomic.
const tripIdPosition = normalized.indexOf("v_trip_id := 'trip-'");
const privateMapPosition = normalized.indexOf("insert into private.trip_participant_email_maps");
const tripInsertPosition = normalized.indexOf("insert into public.trips");
assert.ok(
  tripIdPosition >= 0 && tripIdPosition < privateMapPosition && privateMapPosition < tripInsertPosition,
  "Private email mapping must be inserted after Trip ID generation and before Trip insertion.",
);

// Keep the email map sourced from the same Auth-backed Super Admin intersection as the UI.
assert.ok(
  /join\s+auth\.users\s+u\s+on\s+u\.id\s*=\s*p\.user_id/i.test(migration),
  "Participant defaults must be tied to the Auth user ID.",
);

// The modal must remain preview-only until database-backed integration tests are available.
const modal = await readFile("src/components/TripEditorModal.tsx", "utf8");
assert.match(modal, /Excel 建立尚未開放/);
assert.match(modal, /disabled\s*\n\s*className=.*bg-slate-300/s);

console.log("Trip Excel RPC static verification passed: auth boundary, idempotency, private email storage, atomic write ordering, and preview-only UI.");
