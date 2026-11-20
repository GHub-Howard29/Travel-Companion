import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const required = [
  "TC_ADR001_URL",
  "TC_ADR001_ANON_KEY",
  "TC_ADR001_ACCESS_TOKEN",
  "TC_ADR001_USER_ID",
  "TC_ADR001_TRIP_ID",
  "TC_ADR001_CLIENT_ID",
  "TC_ADR001_MODE",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing worker input: ${key}`);
}

const client = createClient(process.env.TC_ADR001_URL, process.env.TC_ADR001_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${process.env.TC_ADR001_ACCESS_TOKEN}` } },
});
const verified = await client.auth.getUser();
if (verified.error || !verified.data.user) throw verified.error ?? new Error("Worker Auth JWT is not valid.");
const mode = process.env.TC_ADR001_MODE;
const tripId = process.env.TC_ADR001_TRIP_ID;
const clientId = process.env.TC_ADR001_CLIENT_ID;

let result;
if (mode === "save") {
  const daysData = JSON.parse(process.env.TC_ADR001_DAYS_DATA ?? "null");
  const expectedVersion = Number(process.env.TC_ADR001_EXPECTED_VERSION);
  assert(Number.isInteger(expectedVersion) && expectedVersion > 0, "Worker expected version invalid.");
  const { data: rows, error: rpcError } = await client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: clientId,
    p_expected_version: expectedVersion,
    p_days_data: daysData,
    p_operation_id: process.env.TC_ADR001_OPERATION_ID,
  });
  if (rpcError) {
    result = { ok: false, errorCode: rpcError.code ?? null, errorMessage: rpcError.message };
  } else {
    result = { ok: true, saved: rows?.[0]?.saved === true, currentVersion: rows?.[0]?.current_version ?? null };
  }
} else if (mode === "claim") {
  const { data: rows, error: rpcError } = await client.rpc("tc_claim_itinerary_trip_edit_lease", {
    p_trip_id: tripId,
    p_client_id: clientId,
  });
  if (rpcError) {
    result = { ok: false, errorCode: rpcError.code ?? null, errorMessage: rpcError.message };
  } else {
    result = {
      ok: true,
      acquired: rows?.[0]?.acquired === true,
      ownerUserId: rows?.[0]?.owner_user_id ?? null,
      ownerClientId: rows?.[0]?.owner_client_id ?? null,
    };
  }
} else {
  throw new Error("Unsupported worker mode.");
}

console.log(JSON.stringify({ mode, userId: verified.data.user.id, ...result }));
