import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

const root = process.cwd();
const baseUrl = "http://127.0.0.1:54321";
const suffix = randomUUID();
const tripId = `adr001-sr11-${suffix}`;
const emailA = `adr001-sr11-a-${suffix}@example.invalid`;
const emailB = `adr001-sr11-b-${suffix}@example.invalid`;
const passwordA = `ADR001-A-${randomUUID()}-Aa9!`;
const passwordB = `ADR001-B-${randomUUID()}-Bb8!`;
const clientIdA = randomUUID();
const clientIdB = randomUUID();
const operationId = randomUUID();
const options = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
};
let admin;
const createdUserIds = [];
const signedInClients = [];

function requireLoopback(value) {
  const parsed = new URL(value);
  assert(["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname),
    "Safety stop: Supabase URL must be loopback.");
  assert.equal(parsed.origin, baseUrl, "Safety stop: unexpected local Supabase origin.");
}
function readStatusEnv() {
  const cli = `${root}\\node_modules\\supabase\\dist\\supabase.js`;
  const output = execFileSync(process.execPath, [cli, "status", "-o", "env"], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="([^"]*)"$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}
function unwrap(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function createUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Auth createUser returned no user for ${email}`);
  createdUserIds.push(data.user.id);
  return data.user;
}
async function signIn(email, password) {
  const client = createClient(baseUrl, status.ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw error ?? new Error("Auth API returned no session/user.");
  assert(data.session.access_token, "Auth API did not return an access token.");
  assert(data.session.refresh_token, "Auth API did not return a refresh token.");
  client.realtime.setAuth(data.session.access_token);
  signedInClients.push(client);
  return { client, user: data.user, session: data.session };
}

function startConcurrencyWorker(workerEnv) {
  const workerPath = `${root}\\scripts\\test-adr001-concurrency-worker.mjs`;
  const child = spawn(process.execPath, [workerPath], {
    cwd: root,
    env: { ...process.env, ...workerEnv },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const result = new Promise((resolve, reject) => {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Concurrency worker exited ${code}: ${stderr.slice(-2000)}`));
        return;
      }
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        resolve(JSON.parse(lines.at(-1) ?? ""));
      } catch (error) {
        reject(new Error(`Invalid concurrency worker output: ${error.message}; stderr=${stderr.slice(-1000)}`));
      }
    });
  });
  return {
    result,
    terminate: () => { if (!child.killed) child.kill(); },
  };
}
async function runConcurrentWorkers(workerConfigs) {
  const workers = workerConfigs.map((config) => startConcurrencyWorker(config));
  let timeout;
  try {
    return await Promise.race([
      Promise.all(workers.map((worker) => worker.result)),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Concurrent workers timed out after 30 seconds.")), 30000);
      }),
    ]);
  } catch (error) {
    for (const worker of workers) worker.terminate();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const status = readStatusEnv();
requireLoopback(status.API_URL ?? status.SUPABASE_URL ?? baseUrl);
assert(status.ANON_KEY, "Local ANON_KEY unavailable.");
assert(status.SERVICE_ROLE_KEY, "Local SERVICE_ROLE_KEY unavailable.");
assert.equal(status.API_URL ?? status.SUPABASE_URL ?? baseUrl, baseUrl,
  "Safety stop: local Supabase API URL mismatch.");
admin = createClient(baseUrl, status.SERVICE_ROLE_KEY, options);

let testStatus = "BLOCKED";
const countRows = (sql) => {
  const cli = `${root}\\node_modules\\supabase\\dist\\supabase.js`;
  const output = execFileSync(process.execPath, [cli, "db", "query", "--local", "--output-format", "json", sql], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  const first = output.indexOf("[");
  const last = output.lastIndexOf("]");
  if (first < 0 || last < first) throw new Error("Unable to parse local SQL count result.");
  return JSON.parse(output.slice(first, last + 1));
};
const beforeUsers = Number(countRows("select count(*) as count from auth.users")[0].count);
const beforeTrips = Number(countRows("select count(*) as count from public.trips")[0].count);
const beforeLeases = Number(countRows("select count(*) as count from public.itinerary_trip_edit_leases")[0].count);

try {
  const userA = await createUser(emailA, passwordA);
  const userB = await createUser(emailB, passwordB);
  assert.notEqual(userA.id, userB.id, "Auth API provisioned duplicate user identities.");

  unwrap(await admin.from("admin_users").insert([
    { email: emailA, role: "trip_editor", trip_id: tripId },
    { email: emailB, role: "trip_editor", trip_id: tripId },
  ]), "provision trip editor roles");

  unwrap(await admin.from("trips").insert({
    id: tripId,
    title: "ADR-001 SR-11 isolated dual Auth fixture",
    departure_date: "2099-12-31",
    participants: [],
    currency_config: { code: "JPY", symbol: "¥" },
    sidebar_config: [],
    content: { days: ["2099-12-31"], daysData: { "1": [] } },
    is_public: false,
  }), "seed isolated Trip");

  const seededVersion = Number(countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0]?.version);
  assert.equal(seededVersion, 1, "Trip insert trigger must initialize itinerary version to 1.");

  const [sessionA, sessionB] = await Promise.all([
    signIn(emailA, passwordA),
    signIn(emailB, passwordB),
  ]);
  assert.notEqual(sessionA.user.id, sessionB.user.id, "Sessions must belong to different users.");
  assert.notEqual(sessionA.session.access_token, sessionB.session.access_token, "Sessions must have distinct access JWTs.");
  assert.notEqual(sessionA.session.refresh_token, sessionB.session.refresh_token, "Sessions must have distinct refresh tokens.");

  const [verifiedA, verifiedB] = await Promise.all([
    sessionA.client.auth.getUser(),
    sessionB.client.auth.getUser(),
  ]);
  assert.equal(verifiedA.data.user?.id, userA.id, "Session A /auth/v1/user identity mismatch.");
  assert.equal(verifiedB.data.user?.id, userB.id, "Session B /auth/v1/user identity mismatch.");
  assert.equal(verifiedA.data.user?.role, "authenticated");
  assert.equal(verifiedB.data.user?.role, "authenticated");

  const claimA = unwrap(await sessionA.client.rpc("tc_claim_itinerary_trip_edit_lease", {
    p_trip_id: tripId, p_client_id: clientIdA,
  }), "A claim Lease");
  assert.equal(claimA[0]?.acquired, true, "Session A should acquire Lease.");

  const claimB = unwrap(await sessionB.client.rpc("tc_claim_itinerary_trip_edit_lease", {
    p_trip_id: tripId, p_client_id: clientIdB,
  }), "B competing claim Lease");
  assert.equal(claimB[0]?.acquired, false, "Session B must not take A's active Lease.");
  assert.equal(claimB[0]?.owner_user_id, userA.id, "Lease owner must remain Session A.");

  const saveB = await sessionB.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: clientIdB,
    p_expected_version: 1,
    p_days_data: { "1": [{ id: "forbidden-b", title: "B must not save" }] },
    p_operation_id: randomUUID(),
  });
  assert(saveB.error, "Session B save unexpectedly succeeded while A owns Lease.");

  const renewB = await sessionB.client.rpc("tc_renew_itinerary_trip_edit_lease", {
    p_trip_id: tripId, p_client_id: clientIdA,
  });
  assert(renewB.error || renewB.data === false, "Session B unexpectedly renewed A's Lease.");

  const releaseB = await sessionB.client.rpc("tc_release_itinerary_trip_edit_lease", {
    p_trip_id: tripId, p_client_id: clientIdA,
  });
  assert.equal(releaseB.error, null, "Session B release RPC should return a normal denial.");
  assert.equal(releaseB.data, false, "Session B unexpectedly released A's Lease.");

  const leaseAfterB = countRows(`select owner_user_id, owner_client_id from public.itinerary_trip_edit_leases where trip_id = '${tripId}'`)[0];
  assert.equal(leaseAfterB.owner_user_id, userA.id);
  assert.equal(leaseAfterB.owner_client_id, clientIdA);

  const versionAfterB = countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0];
  assert.equal(Number(versionAfterB.version), 1, "Denied B operations changed itinerary version.");

  const tripAfterB = countRows(`select content from public.trips where id = '${tripId}'`)[0];
  assert.deepEqual(tripAfterB.content.daysData, { "1": [] }, "Denied B save changed daysData.");

  const omittedDaysData = await sessionA.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId, p_client_id: clientIdA, p_expected_version: 1,
    p_operation_id: randomUUID(),
  });
  assert(omittedDaysData.error, "Save RPC unexpectedly resolved when p_days_data was omitted.");
  assert.match(omittedDaysData.error.message, /function|parameter|schema cache|Could not find/i,
    "Omitted p_days_data should be rejected at RPC parameter resolution.");

  const invalidInputs = [
    { name: "SQL NULL daysData", value: null },
    { name: "array daysData", value: [{ id: "invalid-array-shape" }] },
    { name: "scalar string daysData", value: "invalid-scalar" },
    { name: "scalar number daysData", value: 42 },
    { name: "scalar boolean daysData", value: false },
  ];
  for (const item of invalidInputs) {
    const result = await sessionA.client.rpc("tc_save_itinerary_days", {
      p_trip_id: tripId, p_client_id: clientIdA, p_expected_version: 1,
      p_days_data: item.value, p_operation_id: randomUUID(),
    });
    assert(result.error, `${item.name} unexpectedly passed Save input validation.`);
    assert.match(result.error.message, /ADR001_INVALID_SAVE_INPUT/);
  }

  const emptyDaysDataSave = unwrap(await sessionA.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId, p_client_id: clientIdA, p_expected_version: 1,
    p_days_data: {}, p_operation_id: randomUUID(),
  }), "valid empty daysData object");
  assert.equal(emptyDaysDataSave[0]?.saved, true, "Empty object daysData should be a valid object payload.");
  assert.equal(emptyDaysDataSave[0]?.current_version, 2, "Empty daysData Save should advance version once.");
  const afterEmptySave = countRows(`select content from public.trips where id = '${tripId}'`)[0];
  assert.deepEqual(afterEmptySave.content.daysData, {}, "Empty object daysData was not stored exactly.");

  const saveA = unwrap(await sessionA.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: clientIdA,
    p_expected_version: 2,
    p_days_data: { "1": [{ id: "allowed-a", title: "A save accepted" }] },
    p_operation_id: operationId,
  }), "A save with owning Lease");
  assert.equal(saveA[0]?.saved, true, "Session A owning Lease could not save.");
  assert.equal(saveA[0]?.current_version, 3, "A save should advance itinerary version once.");

  const saveRace = await runConcurrentWorkers([
    {
      TC_ADR001_URL: baseUrl,
      TC_ADR001_ANON_KEY: status.ANON_KEY,
      TC_ADR001_ACCESS_TOKEN: sessionA.session.access_token,
      TC_ADR001_USER_ID: userA.id,
      TC_ADR001_TRIP_ID: tripId,
      TC_ADR001_CLIENT_ID: clientIdA,
      TC_ADR001_MODE: "save",
      TC_ADR001_EXPECTED_VERSION: "3",
      TC_ADR001_DAYS_DATA: JSON.stringify({ "1": [{ id: "parallel-a", title: "parallel writer A" }] }),
      TC_ADR001_OPERATION_ID: randomUUID(),
    },
    {
      TC_ADR001_URL: baseUrl,
      TC_ADR001_ANON_KEY: status.ANON_KEY,
      TC_ADR001_ACCESS_TOKEN: sessionA.session.access_token,
      TC_ADR001_USER_ID: userA.id,
      TC_ADR001_TRIP_ID: tripId,
      TC_ADR001_CLIENT_ID: clientIdA,
      TC_ADR001_MODE: "save",
      TC_ADR001_EXPECTED_VERSION: "3",
      TC_ADR001_DAYS_DATA: JSON.stringify({ "1": [{ id: "parallel-b", title: "parallel writer B" }] }),
      TC_ADR001_OPERATION_ID: randomUUID(),
    },
  ]);
  assert(saveRace.every((result) => result.ok), "Concurrent Save worker returned an RPC error.");
  assert.equal(saveRace.filter((result) => result.saved === true).length, 1,
    "Concurrent same-Lease/same-version Save must have exactly one winner.");
  assert.equal(saveRace.filter((result) => result.saved === false).length, 1,
    "Concurrent stale Save must return CAS conflict.");
  const concurrentVersion = Number(countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0].version);
  assert.equal(concurrentVersion, 4, "Concurrent Save must advance the itinerary version only once.");
  const concurrentTrip = countRows(`select content from public.trips where id = '${tripId}'`)[0];
  const concurrentCardId = concurrentTrip.content.daysData["1"]?.[0]?.id;
  assert(["parallel-a", "parallel-b"].includes(concurrentCardId),
    "Concurrent Save final data does not match the sole winning writer.");

  const staleSave = unwrap(await sessionA.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: clientIdA,
    p_expected_version: 3,
    p_days_data: { "1": [{ id: "stale", title: "must not replace" }] },
    p_operation_id: randomUUID(),
  }), "A stale CAS save");
  assert.equal(staleSave[0]?.saved, false, "Stale expected version unexpectedly saved.");
  assert.equal(staleSave[0]?.current_version, 4, "Stale CAS should report current version.");

  const afterStale = countRows(`select content from public.trips where id = '${tripId}'`)[0];
  assert.deepEqual(afterStale.content.daysData, concurrentTrip.content.daysData,
    "Stale CAS changed the concurrent Save winner's data.");

  const directWrite = await sessionA.client.from("trips")
    .update({ content: { days: ["2099-12-31"], daysData: { "1": [{ id: "direct-write", title: "must be denied" }] } } })
    .eq("id", tripId);
  assert(directWrite.error, "Authenticated direct daysData update unexpectedly succeeded.");
  assert.match(directWrite.error.message, /ADR001_DAYS_DATA_SAVE_RPC_REQUIRED/);

  const forgedMarker = await sessionA.client.schema("private").from("itinerary_save_authorizations")
    .insert({ transaction_id: 1, backend_pid: 1, trip_id: tripId, user_id: userA.id, operation_id: randomUUID() });
  assert(forgedMarker.error, "Authenticated user unexpectedly wrote a private authorization marker.");

  const forgedLease = await sessionA.client.from("itinerary_trip_edit_leases")
    .insert({ trip_id: tripId, owner_user_id: userB.id, owner_client_id: clientIdB,
      acquired_at: new Date().toISOString(), expires_at: new Date(Date.now() + 45000).toISOString() });
  assert(forgedLease.error, "Authenticated user unexpectedly inserted a forged Lease.");

  const forbiddenVersionRead = await sessionA.client.from("itinerary_trip_versions")
    .select("version").eq("trip_id", tripId);
  assert(forbiddenVersionRead.error, "Authenticated user unexpectedly read private itinerary versions.");

  const historyBeforeMeta = Number(countRows(`select count(*) as count from private.itinerary_day_history where trip_id = '${tripId}'`)[0].count);
  const metadataUpdate = unwrap(await sessionA.client.from("trips")
    .update({ title: "ADR-001 metadata-only update" }).eq("id", tripId).select("id").single(),
  "metadata-only update without another Lease");
  assert.equal(metadataUpdate.id, tripId, "Metadata-only update was blocked by itinerary Lease.");

  const historyAfterMeta = Number(countRows(`select count(*) as count from private.itinerary_day_history where trip_id = '${tripId}'`)[0].count);
  assert.equal(historyAfterMeta, historyBeforeMeta, "Metadata-only update unexpectedly captured itinerary history.");

  const finalVersion = Number(countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0].version);
  assert.equal(finalVersion, 4, "Denied direct write or metadata update changed itinerary version.");

  const historyAfterSave = countRows(`select day, previous_items from private.itinerary_day_history where trip_id = '${tripId}' order by id`);
  assert.equal(Number(countRows(`select count(*) as count from private.itinerary_day_history where trip_id = '${tripId}'`)[0].count), 1,
    "Save RPC should create exactly one itinerary history record.");
  assert.equal(Number(historyAfterSave[0].day), 1);
  assert.deepEqual(historyAfterSave[0].previous_items, [], "History must capture the pre-save empty card list.");

  const leaseBeforeFailure = countRows(`select count(*) as count from public.itinerary_trip_edit_leases where trip_id = '${tripId}'`)[0];
  const versionBeforeFailure = Number(countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0].version);
  const historyBeforeFailure = Number(countRows(`select count(*) as count from private.itinerary_day_history where trip_id = '${tripId}'`)[0].count);
  const tripBeforeFailure = countRows(`select content from public.trips where id = '${tripId}'`)[0];

  const rollbackFunctionSql = `create or replace function private.tc_adr001_test_force_save_rollback()
    returns trigger language plpgsql set search_path = ''
    as $body$ begin
      if old.id = '${tripId}' and old.content -> 'daysData' is distinct from new.content -> 'daysData' then
        raise exception using errcode = 'P0001', message = 'ADR001_TEST_FORCED_TRIGGER_ROLLBACK';
      end if;
      return new;
    end; $body$;`;
  execFileSync(process.execPath, [`${root}\\node_modules\\supabase\\dist\\supabase.js`, "db", "query", "--local", rollbackFunctionSql], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  execFileSync(process.execPath, [`${root}\\node_modules\\supabase\\dist\\supabase.js`, "db", "query", "--local",
    "drop trigger if exists tc_adr001_test_force_save_rollback on public.trips"], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  execFileSync(process.execPath, [`${root}\\node_modules\\supabase\\dist\\supabase.js`, "db", "query", "--local",
    "create trigger tc_adr001_test_force_save_rollback before update of content on public.trips for each row execute function private.tc_adr001_test_force_save_rollback()"], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  const rollbackAttempt = await sessionA.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: clientIdA,
    p_expected_version: 4,
    p_days_data: { "1": [{ id: "rollback-card", title: "must rollback" }] },
    p_operation_id: randomUUID(),
  });
  assert(rollbackAttempt.error, "Forced trigger failure unexpectedly committed.");
  assert.match(rollbackAttempt.error.message, /ADR001_TEST_FORCED_TRIGGER_ROLLBACK/);

  execFileSync(process.execPath, [`${root}\\node_modules\\supabase\\dist\\supabase.js`, "db", "query", "--local",
    "drop trigger if exists tc_adr001_test_force_save_rollback on public.trips"], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  execFileSync(process.execPath, [`${root}\\node_modules\\supabase\\dist\\supabase.js`, "db", "query", "--local",
    "drop function if exists private.tc_adr001_test_force_save_rollback()"], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });

  const tripAfterRollback = countRows(`select content from public.trips where id = '${tripId}'`)[0];
  assert.deepEqual(tripAfterRollback.content.daysData, tripBeforeFailure.content.daysData,
    "Trigger failure did not roll back daysData.");
  assert.equal(Number(countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0].version),
    versionBeforeFailure, "Trigger failure did not roll back itinerary version.");
  assert.equal(Number(countRows(`select count(*) as count from private.itinerary_day_history where trip_id = '${tripId}'`)[0].count),
    historyBeforeFailure, "Trigger failure did not roll back history.");
  assert.equal(Number(countRows(`select count(*) as count from public.itinerary_trip_edit_leases where trip_id = '${tripId}'`)[0].count),
    Number(leaseBeforeFailure.count), "Trigger failure changed Lease ownership state.");

  const raceClientA = randomUUID();
  const raceClientB = randomUUID();
  execFileSync(process.execPath, [`${root}\\node_modules\\supabase\\dist\\supabase.js`, "db", "query", "--local",
    `update public.itinerary_trip_edit_leases set expires_at = clock_timestamp() - interval '1 second' where trip_id = '${tripId}'`], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  const claimRace = await runConcurrentWorkers([
    {
      TC_ADR001_URL: baseUrl, TC_ADR001_ANON_KEY: status.ANON_KEY,
      TC_ADR001_ACCESS_TOKEN: sessionA.session.access_token, TC_ADR001_USER_ID: userA.id,
      TC_ADR001_TRIP_ID: tripId, TC_ADR001_CLIENT_ID: raceClientA, TC_ADR001_MODE: "claim",
    },
    {
      TC_ADR001_URL: baseUrl, TC_ADR001_ANON_KEY: status.ANON_KEY,
      TC_ADR001_ACCESS_TOKEN: sessionB.session.access_token, TC_ADR001_USER_ID: userB.id,
      TC_ADR001_TRIP_ID: tripId, TC_ADR001_CLIENT_ID: raceClientB, TC_ADR001_MODE: "claim",
    },
  ]);
  assert(claimRace.every((result) => result.ok), "Concurrent Lease Claim worker returned an RPC error.");
  assert.equal(claimRace.filter((result) => result.acquired === true).length, 1,
    "Concurrent expired-Lease takeover must have exactly one winner.");
  assert.equal(claimRace.filter((result) => result.acquired === false).length, 1,
    "Concurrent expired-Lease takeover must have exactly one loser.");
  const claimWinner = claimRace.find((result) => result.acquired === true);
  const expectedWinnerClient = claimWinner.userId === userA.id ? raceClientA : raceClientB;
  const leaseAfterRace = countRows(`select owner_user_id, owner_client_id from public.itinerary_trip_edit_leases where trip_id = '${tripId}'`)[0];
  assert.equal(leaseAfterRace.owner_user_id, claimWinner.userId, "Concurrent Claim final owner mismatch.");
  assert.equal(leaseAfterRace.owner_client_id, expectedWinnerClient, "Concurrent Claim final client mismatch.");

  const oldOwnerSave = await sessionA.client.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: clientIdA,
    p_expected_version: 4,
    p_days_data: { "1": [{ id: "old-owner", title: "expired owner must be denied" }] },
    p_operation_id: randomUUID(),
  });
  assert(oldOwnerSave.error, "Expired previous Lease owner unexpectedly saved after concurrent takeover.");
  assert.match(oldOwnerSave.error.message, /ADR001_EDIT_LEASE_REQUIRED/);
  assert.equal(Number(countRows(`select version from public.itinerary_trip_versions where trip_id = '${tripId}'`)[0].version),
    4, "Expired owner Save changed itinerary version.");

  testStatus = "PASS";
  console.log(JSON.stringify({
    case: "SR-11",
    result: testStatus,
    scope: "local loopback Supabase only",
    authSessions: {
      independentUsers: true,
      distinctAccessTokens: true,
      distinctRefreshTokens: true,
      verifiedViaAuthGetUser: true,
      role: "authenticated",
      credentialsPrinted: false,
    },
    lease: {
      sessionAClaimed: true,
      sessionBClaimDenied: true,
      sessionBSaveDenied: true,
      sessionBRenewDenied: true,
      sessionBReleaseDenied: true,
      ownerPreserved: true,
      versionAndDaysDataUnchangedByB: true,
      sessionAValidSave: true,
    },
  }, null, 2));
} catch (error) {
  console.error(`SR-11 FAILED: ${error.stack ?? error}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(signedInClients.map(async (client) => client.auth.signOut()));
  const cli = `${root}\\node_modules\\supabase\\dist\\supabase.js`;
  // The rollback injector is temporary and must be removed even after an assertion fails.
  try {
    execFileSync(process.execPath, [cli, "db", "query", "--local",
      "drop trigger if exists tc_adr001_test_force_save_rollback on public.trips"], {
      cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
    });
    execFileSync(process.execPath, [cli, "db", "query", "--local",
      "drop function if exists private.tc_adr001_test_force_save_rollback()"], {
      cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
    });
  } catch (cleanupError) {
    console.error(`Temporary rollback injector cleanup failed: ${cleanupError.message}`);
    process.exitCode = 1;
  }
  if (admin) {
    // Restrict cleanup to this run's unique Trip and two unique test identities.
    await admin.from("itinerary_trip_edit_leases").delete().eq("trip_id", tripId);
    await admin.from("itinerary_trip_versions").delete().eq("trip_id", tripId);
    await admin.from("trips").delete().eq("id", tripId);
    await admin.from("admin_users").delete().eq("trip_id", tripId);
    await Promise.allSettled(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
  const afterUsers = Number(countRows("select count(*) as count from auth.users")[0].count);
  const afterTrips = Number(countRows("select count(*) as count from public.trips")[0].count);
  const afterLeases = Number(countRows("select count(*) as count from public.itinerary_trip_edit_leases")[0].count);
  assert.equal(afterUsers, beforeUsers, "Auth user count did not return to baseline.");
  assert.equal(afterTrips, beforeTrips, "Trip fixture count did not return to baseline.");
  assert.equal(afterLeases, beforeLeases, "Lease count did not return to baseline.");
  if (testStatus === "PASS") console.log("SR-11 cleanup PASS: Auth users, Trips and Lease counts returned to baseline.");
}
