import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY;
const email = process.env.LEASE_TEST_EMAIL;
const password = process.env.LEASE_TEST_PASSWORD;
const tripId = process.env.LEASE_TEST_TRIP_ID;

if (!anonKey || !email || !password || !tripId) {
  throw new Error("Set SUPABASE_ANON_KEY, LEASE_TEST_EMAIL, LEASE_TEST_PASSWORD and LEASE_TEST_TRIP_ID.");
}

const supabase = createClient(url, anonKey);
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

const cardId = `lease-test-${crypto.randomUUID()}`;
const clientA = crypto.randomUUID();
const clientB = crypto.randomUUID();

const claim = async (clientId) => {
  const { data, error } = await supabase.rpc("tc_claim_itinerary_card_edit_lease", {
    p_trip_id: tripId,
    p_card_id: cardId,
    p_client_id: clientId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
};

const release = async (clientId) => {
  const { error } = await supabase.rpc("tc_release_itinerary_card_edit_lease", {
    p_trip_id: tripId,
    p_card_id: cardId,
    p_client_id: clientId,
  });
  if (error) throw error;
};

try {
  const first = await claim(clientA);
  assert.equal(first.acquired, true, "第一個 client 應取得租約");

  const secondWhileOwned = await claim(clientB);
  assert.equal(secondWhileOwned.acquired, false, "另一個 client 不可搶走有效租約");
  assert.equal(secondWhileOwned.owner_client_id, clientA);

  await release(clientA);
  const secondAfterRelease = await claim(clientB);
  assert.equal(secondAfterRelease.acquired, true, "第一個 client 主動釋放後第二個應可接手");

  await supabase.from("itinerary_card_edit_leases")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("trip_id", tripId)
    .eq("card_id", cardId);
  const firstAfterExpiry = await claim(clientA);
  assert.equal(firstAfterExpiry.acquired, true, "租約逾時後另一個 client 應可接手");

  console.log("Itinerary card edit lease claim / mutual exclusion / release / expiry passed.");
} finally {
  await release(clientA);
  await release(clientB);
  await supabase.auth.signOut();
}
