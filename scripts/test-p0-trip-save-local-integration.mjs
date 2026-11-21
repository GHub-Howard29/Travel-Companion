import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const runId = randomUUID();
const emailA = `p0-local-a-${runId}@example.invalid`;
const emailB = `p0-local-b-${runId}@example.invalid`;
const tripId = `p0-local-${runId}`;
const userA = randomUUID();
const userB = randomUUID();
const sourceClientA = randomUUID();
const sourceClientB = randomUUID();
let status;

function assertLoopback(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname), "Safety stop: local loopback only.");
}
function localSql(sql) {
  const executable = `${root}\\node_modules\\supabase\\dist\\supabase.js`;
  const output = execFileSync(process.execPath, [executable, "db", "query", "--local", "--output-format", "json", sql], {
    cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  });
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  return start >= 0 && end >= start ? JSON.parse(output.slice(start, end + 1)) : [];
}
function localSqlFile(sql) {
  execFileSync("docker", ["exec", "-i", "supabase_db_travel-companion", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    cwd: root, input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  });
}
function localSupabaseStatus() {
  const inspect = execFileSync("docker", ["inspect", "supabase_auth_travel-companion", "--format", "{{range .Config.Env}}{{println .}}{{end}}"], {
    cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, windowsHide: true,
  });
  const config = Object.fromEntries(inspect.split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)];
  }));
  assertLoopback(config.API_EXTERNAL_URL);
  assert(config.GOTRUE_JWT_SECRET, "Local Supabase JWT secret missing.");
  const kong = execFileSync("docker", ["exec", "supabase_kong_travel-companion", "sh", "-c", "grep -oE 'sb_publishable_[A-Za-z0-9_-]+' /home/kong/kong.yml | head -1"], {
    cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true,
  }).trim();
  assert(kong.startsWith("sb_publishable_"), "Local publishable API key unavailable.");
  const url = new URL(config.API_EXTERNAL_URL);
  url.pathname = url.pathname.replace(/\/auth\/v1\/?$/, "").replace(/\/$/, "");
  return { url: url.toString().replace(/\/$/, ""), anonKey: kong, jwtSecret: config.GOTRUE_JWT_SECRET };
}
function signLocalAccessToken(jwtSecret, userId, userEmail) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ iss: "supabase", aud: "authenticated", role: "authenticated", sub: userId, email: userEmail,
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, iat: now, exp: now + 3600 });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
}
async function request(context, method, path, body, expectedStatus) {
  const response = await fetch(`${context.url}${path}`, {
    method,
    headers: { apikey: context.anonKey, Authorization: `Bearer ${context.token}`, "Content-Type": "application/json", Prefer: "return=representation", "x-travel-companion-client-id": context.sourceClientId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${method} ${path} expected HTTP ${expectedStatus}, got ${response.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  assert.equal(process.platform, "win32", "Windows local Supabase integration only.");
  status = localSupabaseStatus();
  const initialTripCount = Number(localSql("select count(*) as count from public.trips")[0].count);
  const userCountBefore = Number(localSql("select count(*) as count from auth.users")[0].count);
  const revisionBefore = BigInt(localSql("select revision from public.app_data_revision where singleton=true")[0].revision);

  try {
    localSqlFile(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values
      ('00000000-0000-0000-0000-000000000000','${userA}'::uuid,'authenticated','authenticated','${emailA}',crypt('${randomUUID()}-Aa1!',gen_salt('bf',10)),now(),'','','','', '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
      ('00000000-0000-0000-0000-000000000000','${userB}'::uuid,'authenticated','authenticated','${emailB}',crypt('${randomUUID()}-Bb2!',gen_salt('bf',10)),now(),'','','','', '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
      insert into public.admin_users(email,role,trip_id) values ('${emailA}','trip_editor','${tripId}');
      commit;`);
    const contextA = { ...status, token: signLocalAccessToken(status.jwtSecret, userA, emailA), sourceClientId: sourceClientA };
    const contextB = { ...status, token: signLocalAccessToken(status.jwtSecret, userB, emailB), sourceClientId: sourceClientB };
    const authA = await request(contextA, "GET", "/auth/v1/user", undefined, 200);
    const authB = await request(contextB, "GET", "/auth/v1/user", undefined, 200);
    assert.equal(authA.id, userA);
    assert.equal(authB.id, userB);

    const tripPayload = {
      id: tripId,
      title: "P0 local save isolation fixture",
      departure_date: "2027-12-01",
      participants: [],
      currency_config: { code: "JPY", symbol: "¥" },
      sidebar_config: [],
      content: { days: ["2027-12-01"], daysData: { mode: "guided", "1": [{ id: randomUUID(), title: "baseline", type: "景點" }] } },
      is_public: false,
    };
    const inserted = await request(contextA, "POST", "/rest/v1/trips?select=id,updated_at,content,is_public", tripPayload, 201);
    assert.equal(inserted.length, 1);
    const baselineUpdatedAt = inserted[0].updated_at;

    const otherTripId = `p0-revision-${runId}`;
    localSqlFile(`insert into public.admin_users(email,role,trip_id) values ('${emailA}','trip_editor','${otherTripId}');`);
    const unrelatedPayload = { ...tripPayload, id: otherTripId, title: "P0 unrelated revision fixture" };
    const unrelated = await request(contextA, "POST", "/rest/v1/trips?select=id", unrelatedPayload, 201);
    assert.equal(unrelated[0].id, otherTripId);
    const revisionRowAfterOtherTrip = localSql("select revision, source_client_id from public.app_data_revision where singleton=true")[0];
    const revisionAfterOtherTrip = BigInt(revisionRowAfterOtherTrip.revision);
    assert(revisionAfterOtherTrip > revisionBefore, "Unrelated Trip insert must advance global revision.");
    assert.equal(revisionRowAfterOtherTrip.source_client_id, sourceClientA, "Revision source client must match the request header.");

    const freshCurrent = await request(contextA, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,updated_at,content`, undefined, 200);
    assert.equal(freshCurrent[0].updated_at, baselineUpdatedAt, "Unrelated Trip revision must not modify current Trip CAS version.");

    const editBody = { content: { ...freshCurrent[0].content, note: "saved-after-unrelated-revision" } };
    const saved = await request(contextA, "PATCH", `/rest/v1/trips?id=eq.${tripId}&updated_at=eq.${encodeURIComponent(baselineUpdatedAt)}&select=id,updated_at,content`, editBody, 200);
    assert.equal(saved.length, 1, "Save must succeed when only an unrelated Trip revision advanced.");
    const authoritativeAfterSave = await request(contextA, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,updated_at,content`, undefined, 200);
    assert.equal(authoritativeAfterSave[0].content.note, "saved-after-unrelated-revision");
    assert.notEqual(authoritativeAfterSave[0].updated_at, baselineUpdatedAt);

    const snapshotForB = await request(contextB, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,updated_at,content`, undefined, 200);
    assert.equal(snapshotForB.length, 0, "Unprivileged second context must not read the private Trip.");

    // Grant a second editor only after the read-isolation assertion; now both clients may race.
    localSqlFile(`insert into public.admin_users(email,role,trip_id) values ('${emailB}','trip_editor','${tripId}');`);
    const aSnapshot = await request(contextA, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,updated_at,content`, undefined, 200);
    const bSnapshot = await request(contextB, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,updated_at,content`, undefined, 200);
    assert.equal(aSnapshot.length, 1);
    assert.equal(bSnapshot.length, 1);
    const expectedVersion = aSnapshot[0].updated_at;

    const concurrent = await Promise.all([
      request(contextA, "PATCH", `/rest/v1/trips?id=eq.${tripId}&updated_at=eq.${encodeURIComponent(expectedVersion)}&select=id,updated_at,content`, { content: { ...aSnapshot[0].content, concurrentWriter: "A" } }, 200),
      request(contextB, "PATCH", `/rest/v1/trips?id=eq.${tripId}&updated_at=eq.${encodeURIComponent(expectedVersion)}&select=id,updated_at,content`, { content: { ...bSnapshot[0].content, concurrentWriter: "B" } }, 200),
    ]);
    const winners = concurrent.filter((rows) => Array.isArray(rows) && rows.length === 1);
    const losers = concurrent.filter((rows) => Array.isArray(rows) && rows.length === 0);
    assert.equal(winners.length, 1, "Exactly one concurrent compare-and-set writer must win.");
    assert.equal(losers.length, 1, "Stale updated_at writer must receive an empty representation.");
    const finalRows = await request(contextA, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,updated_at,content`, undefined, 200);
    assert.equal(finalRows.length, 1);
    assert(["A", "B"].includes(finalRows[0].content.concurrentWriter));

    // Verify insert/update/delete card payload survives authoritative readback.
    const addContent = { ...finalRows[0].content, daysData: { ...finalRows[0].content.daysData, "1": [
      { id: "p0-card-add", title: "added", type: "景點" },
      { id: "p0-card-edit", title: "edited", type: "餐飲" },
    ] } };
    const add = await request(contextA, "PATCH", `/rest/v1/trips?id=eq.${tripId}&updated_at=eq.${encodeURIComponent(finalRows[0].updated_at)}&select=id,updated_at,content`, { content: addContent }, 200);
    assert.equal(add.length, 1);
    const modifyContent = { ...add[0].content, daysData: { ...add[0].content.daysData, "1": [
      { id: "p0-card-add", title: "added", type: "景點" },
      { id: "p0-card-edit", title: "edited-and-saved", type: "餐飲" },
    ] } };
    const modify = await request(contextA, "PATCH", `/rest/v1/trips?id=eq.${tripId}&updated_at=eq.${encodeURIComponent(add[0].updated_at)}&select=id,updated_at,content`, { content: modifyContent }, 200);
    assert.equal(modify.length, 1);
    const deleteContent = { ...modify[0].content, daysData: { ...modify[0].content.daysData, "1": [
      { id: "p0-card-edit", title: "edited-and-saved", type: "餐飲" },
    ] } };
    const remove = await request(contextA, "PATCH", `/rest/v1/trips?id=eq.${tripId}&updated_at=eq.${encodeURIComponent(modify[0].updated_at)}&select=id,updated_at,content`, { content: deleteContent }, 200);
    assert.equal(remove.length, 1);
    const reread = await request(contextA, "GET", `/rest/v1/trips?id=eq.${tripId}&select=id,content,updated_at`, undefined, 200);
    assert.equal(reread[0].content.daysData["1"].length, 1);
    assert.equal(reread[0].content.daysData["1"][0].id, "p0-card-edit");

    console.log(JSON.stringify({ passed: true, scope: "local Supabase loopback only", contexts: 2,
      unrelatedTripRevision: revisionAfterOtherTrip.toString(), unrelatedRevisionSave: "PASS", privateRls: "PASS",
      concurrentCas: "exactly one winner / one stale writer", cardAddModifyDeleteReadback: "PASS",
      baselineTripCount: initialTripCount, fixtureTripCount: 2 }, null, 2));
  } finally {
    if (status) {
      const cleanup = [`delete from public.trips where id in ('${tripId}','p0-revision-${runId}');`,
        `delete from public.admin_users where email in ('${emailA}','${emailB}') and role='trip_editor' and trip_id='${tripId}';`,
        `delete from auth.users where id in ('${userA}'::uuid,'${userB}'::uuid) and email in ('${emailA}','${emailB}');`].join(" ");
      try {
        localSqlFile(`begin; ${cleanup} commit;`);
        const afterTripCount = Number(localSql("select count(*) as count from public.trips")[0].count);
        const afterUserCount = Number(localSql("select count(*) as count from auth.users")[0].count);
        assert.equal(afterTripCount, initialTripCount, "Local test Trip count did not return to baseline.");
        assert.equal(afterUserCount, userCountBefore, "Local Auth user count did not return to baseline.");
        console.log("P0 temporary local users and Trip fixtures cleaned; baseline counts restored.");
      } catch (error) {
        console.error(`LOCAL P0 CLEANUP FAILED: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => { console.error(`P0 local save integration failed: ${error.stack ?? error}`); process.exitCode = 1; });
