import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = "http://127.0.0.1:54321";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const statusEnv = execFileSync("C:\\nvm\\v22.23.2\\npx.cmd", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: true });
const envValue = (name) => {
  const match = statusEnv.match(new RegExp(`^${name}=\\\"([^\\\"]+)\\\"$`, "m"));
  if (!match) throw new Error(`Missing local Supabase status value: ${name}`);
  return match[1];
};
const serviceKey = envValue("SERVICE_ROLE_KEY");
const jwtSecret = envValue("JWT_SECRET");
const suffix = randomUUID().slice(0, 8);
const tripId = `p0-isolated-${suffix}`;
const emailA = `p0-isolated-a-${suffix}@example.invalid`;
const emailB = `p0-isolated-b-${suffix}@example.invalid`;
const userA = randomUUID();
const userB = randomUUID();
const clientA = randomUUID();
const clientB = randomUUID();

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signJwt = (userId, email) => {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "supabase-demo",
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_verified: true,
    phone_verified: false,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret).update(input).digest("base64url");
  return `${input}.${signature}`;
};
const client = (userId, email, clientId) => createClient(baseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    headers: {
      Authorization: `Bearer ${signJwt(userId, email)}`,
      "x-travel-companion-client-id": clientId,
    },
  },
});
const a = client(userA, emailA, clientA);
const aSecondTab = client(userA, emailA, randomUUID());
const b = client(userB, emailB, clientB);
const check = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const queryLocal = (sql) => {
  const path = join(tmpdir(), `p0-query-${randomUUID()}.sql`);
  try {
    writeFileSync(path, sql, { encoding: "utf8", flag: "wx" });
    const output = execFileSync("C:\\nvm\\v22.23.2\\npx.cmd", ["supabase", "db", "query", "--local", "--file", path, "--output", "json"], { encoding: "utf8", shell: true });
    const marker = output.indexOf("{\\n  \\\"boundary\\\"");
    if (marker < 0) throw new Error(`Unexpected local SQL query output: ${output}`);
    const payload = JSON.parse(output.slice(marker));
    return payload.rows ?? [];
  } finally {
    try { unlinkSync(path); } catch { /* best-effort cleanup */ }
  }
};

const provision = async (id, email) => {
  const response = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, email, email_confirm: true, password: `P0-${randomUUID()}-Aa9!` }),
  });
  if (!response.ok) throw new Error(`Auth provisioning failed ${response.status}: ${await response.text()}`);
};
const service = createClient(baseUrl, serviceKey, { auth: { persistSession: false } });
const readOnlyService = createClient(baseUrl, serviceKey, { auth: { persistSession: false } });
try {
  await provision(userA, emailA);
  await provision(userB, emailB);
  const managerInsertA = await service.from("admin_users").insert({ email: emailA, role: "trip_editor", trip_id: tripId });
  check(managerInsertA, "provision editor A");
  const managerInsertB = await service.from("admin_users").insert({ email: emailB, role: "trip_editor", trip_id: tripId });
  check(managerInsertB, "provision editor B");

  const seed = await service.from("trips").insert({
    id: tripId,
    title: "P0 isolated integration fixture",
    departure_date: "2027-01-01",
    participants: [],
    currency_config: { code: "JPY", symbol: "￥" },
    sidebar_config: [],
    content: { days: [1], daysData: { "1": [{ id: "seed-card", title: "seed" }] } },
    is_public: false,
  });
  check(seed, "seed isolated trip");

  const revisionBefore = check(await a.from("app_data_revision").select("revision").eq("singleton", true).single(), "read initial revision").revision;
  const readA = check(await a.from("trips").select("id,updated_at,content").eq("id", tripId).single(), "A read trip");
  const readB = check(await b.from("trips").select("id,updated_at,content").eq("id", tripId).single(), "B read trip");
  assert.equal(readA.updated_at, readB.updated_at, "both clients start on same trip version");

  // CRUD smoke: A inserts/updates/deletes trip content and verifies persistence.
  const addPayload = { days: [1], daysData: { "1": [{ id: "seed-card", title: "seed" }, { id: "card-added", title: "added" }] } };
  const addResult = check(await a.from("trips").update({ content: addPayload }).eq("id", tripId).eq("updated_at", readA.updated_at).select("updated_at,content").single(), "A add card CAS");
  assert.equal(addResult.content.daysData["1"].length, 2);
  const afterAdd = check(await a.from("trips").select("updated_at,content").eq("id", tripId).single(), "A read after add");
  assert.equal(afterAdd.content.daysData["1"][1].id, "card-added");
  const editPayload = { days: [1], daysData: { "1": [{ id: "seed-card", title: "seed edited" }, { id: "card-added", title: "added" }] } };
  const editResult = check(await a.from("trips").update({ content: editPayload }).eq("id", tripId).eq("updated_at", afterAdd.updated_at).select("updated_at,content").single(), "A edit card CAS");
  assert.equal(editResult.content.daysData["1"][0].title, "seed edited");
  const afterEdit = check(await a.from("trips").select("updated_at,content").eq("id", tripId).single(), "A read after edit");
  const deletePayload = { days: [1], daysData: { "1": [{ id: "seed-card", title: "seed edited" }] } };
  const deleteResult = check(await a.from("trips").update({ content: deletePayload }).eq("id", tripId).eq("updated_at", afterEdit.updated_at).select("updated_at,content").single(), "A delete card CAS");
  assert.equal(deleteResult.content.daysData["1"].length, 1);
  const afterDelete = check(await a.from("trips").select("updated_at,content").eq("id", tripId).single(), "A read after delete");
  assert.equal(afterDelete.content.daysData["1"].some((item) => item.id === "card-added"), false);

  // A and B both hold the same expected row version: first wins, second must affect zero rows.
  const staleB = readB.updated_at;
  const winner = check(await a.from("trips").update({ title: "A wins" }).eq("id", tripId).eq("updated_at", afterDelete.updated_at).select("updated_at").single(), "A CAS winner");
  const stale = await b.from("trips").update({ title: "B stale write" }).eq("id", tripId).eq("updated_at", staleB).select("id").maybeSingle();
  if (stale.error) throw stale.error;
  assert.equal(stale.data, null, "B stale CAS must update no row");
  const finalTrip = check(await b.from("trips").select("title,updated_at").eq("id", tripId).single(), "B verify winner persists");
  assert.equal(finalTrip.title, "A wins");

  // Unrelated trip advance should move global revision but not conflict with current trip.
  const unrelatedId = `${tripId}-other`;
  const unrelatedSeed = await service.from("trips").insert({
    id: unrelatedId, title: "Unrelated fixture", departure_date: "2027-01-02",
    participants: [], currency_config: { code: "JPY", symbol: "￥" }, sidebar_config: [],
    content: { days: [1], daysData: { "1": [] } }, is_public: false,
  });
  check(unrelatedSeed, "seed unrelated trip");
  const revisionAfter = check(await a.from("app_data_revision").select("revision,source_client_id").eq("singleton", true).single(), "read revision after changes");
  assert.ok(Number(revisionAfter.revision) > Number(revisionBefore), "global revision advances");
  const journalA = check(await readOnlyService.from("trip_change_journal").select("trip_id,revision,source_client_id").eq("trip_id", tripId).order("revision", { ascending: false }).limit(10), "read source journal");
  assert.ok(journalA.some((row) => row.source_client_id === clientA), "A source client id recorded in journal");

  // Same user, second tab/client id is still recognized as own source.
  const ownSourceUpdate = await aSecondTab.from("trips").update({ title: "A second tab update" }).eq("id", tripId).eq("updated_at", finalTrip.updated_at).select("updated_at").single();
  check(ownSourceUpdate, "same-user second-client update");
  const journalSecondClient = check(await readOnlyService.from("trip_change_journal").select("source_client_id").eq("trip_id", tripId).order("revision", { ascending: false }).limit(5), "read second client journal");
  assert.ok(journalSecondClient.some((row) => row.source_client_id !== null && row.source_client_id !== clientA), "second tab source id is distinct and recorded");

  console.log(JSON.stringify({
    result: "PASS",
    scope: "local Supabase REST/RLS integration; two independent JWT clients and two source-client IDs",
    tripId,
    cardCrud: "add/edit/delete persisted and re-read",
    cas: "stale same-trip write rejected; winner retained",
    revision: `advanced ${revisionBefore} -> ${revisionAfter.revision}`,
    journalSource: "client IDs recorded",
    unrelatedTrip: "global revision advanced; current trip CAS remains isolated",
  }, null, 2));
} finally {
  // Only delete rows created by this test's unique p0-isolated UUID prefix.
  await service.from("trips").delete().like("id", `${tripId}%`);
  await service.from("admin_users").delete().eq("trip_id", tripId);
  await service.auth.admin.deleteUser(userA).catch(() => undefined);
  await service.auth.admin.deleteUser(userB).catch(() => undefined);
}
