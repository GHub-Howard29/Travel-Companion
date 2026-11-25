import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const baseUrl = "http://127.0.0.1:54321";
const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");
const manifestPath = join(tmpdir(), "travel-companion-adr002-s2-fixture.json");
const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };

function readStatusEnv() {
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

const status = readStatusEnv();
const apiUrl = status.API_URL ?? status.SUPABASE_URL;
assert.equal(apiUrl, baseUrl, "Safety stop: only http://127.0.0.1:54321 is allowed.");
assert.equal(new URL(apiUrl).hostname, "127.0.0.1", "Safety stop: Supabase must be loopback.");
assert(status.ANON_KEY && status.SERVICE_ROLE_KEY, "Local Supabase keys are unavailable.");
const admin = createClient(baseUrl, status.SERVICE_ROLE_KEY, options);

function queryRows(sql) {
  const output = execFileSync(process.execPath, [cli, "db", "query", "--local", "--output-format", "json", sql], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  const first = output.indexOf("[");
  const last = output.lastIndexOf("]");
  assert(first >= 0 && last > first, "Unable to parse local SQL query result.");
  return JSON.parse(output.slice(first, last + 1));
}

function unwrap(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message);
  return result.data;
}

function execSql(sql) {
  return execFileSync(process.execPath, [cli, "db", "query", "--local", sql], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
}

function quoteSql(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function countSnapshot() {
  const rows = queryRows(
    "select " +
    "(select count(*) from auth.users) as auth_users, " +
    "(select count(*) from public.trips) as trips, " +
    "(select count(*) from public.admin_users) as admin_users, " +
    "(select count(*) from public.itinerary_trip_edit_leases) as leases, " +
    "(select count(*) from public.trip_deletion_tombstones) as tombstones"
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
}

function syncDataSnapshot() {
  const tables = [
    ["trips", "public.trips"],
    ["checklists", "public.checklists"],
    ["checklist_items", "public.checklist_items"],
    ["expenses", "public.expenses"],
    ["exchange_purchases", "public.exchange_purchases"],
    ["other_info_items", "public.other_info_items"],
  ];
  const result = {};
  for (const [name, table] of tables) {
    const rows = queryRows(
      "select count(*) as count, " +
      "md5(coalesce(string_agg(to_jsonb(row_data)::text, E'\\n' order by to_jsonb(row_data)::text), '')) as digest " +
      "from " + table + " as row_data"
    );
    result[name] = { count: Number(rows[0].count), digest: rows[0].digest };
  }
  return result;
}

function readSyncClock() {
  const rows = queryRows(
    "select local_last_changed_at::text as local_last_changed_at, last_synced_at::text as last_synced_at " +
    "from tc_testdata.sync_state where singleton = true"
  );
  assert.equal(rows.length, 1, "Local testdata sync clock must exist exactly once.");
  return rows[0];
}

async function saveManifest(manifest) {
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function cleanupFixture(manifest) {
  assert(manifest && /^adr002-s2-[0-9a-f-]{36}$/.test(manifest.tripId), "Unsafe fixture Trip ID.");
  assert(Array.isArray(manifest.users) && manifest.users.length === 2, "Fixture must contain exactly two users.");
  for (const user of manifest.users) {
    assert(/^adr002-s2-[ab]-[0-9a-f-]{36}@example\.invalid$/.test(user.email), "Unsafe fixture email.");
  }

  const tripId = manifest.tripId;
  const fixtureTripRows = queryRows(
    "select id, title, departure_date::text as departure_date, is_public, content->'daysData'->'1' as fixture_cards " +
    "from public.trips where id = " + quoteSql(tripId)
  );
  if (fixtureTripRows.length > 0) {
    assert.equal(fixtureTripRows.length, 1, "Fixture Trip must be unique before cleanup.");
    assert.equal(fixtureTripRows[0].title, "ADR-002 S2 isolated workspace fixture", "Refusing to delete a Trip with an unexpected title.");
    assert.match(fixtureTripRows[0].departure_date, /^2099-12-31/);
    assert.equal(fixtureTripRows[0].is_public, false, "Refusing to delete a non-private Trip.");
    const fixtureCards = fixtureTripRows[0].fixture_cards;
    assert(Array.isArray(fixtureCards) && [0, 2].includes(fixtureCards.length), "Fixture Trip must contain either the original two synthetic cards or no cards after an authorized UI deletion test.");
    assert(fixtureCards.every((card) =>
      typeof card.id === "string" &&
      /^ADR-002 S2 合成卡片 [AB]$/.test(card.title) &&
      card.location === "" &&
      card.place === undefined &&
      card.coverPhoto === undefined
    ), "Refusing to delete unexpected or externally enriched fixture card data.");
  }
  execSql("delete from public.itinerary_trip_edit_leases where trip_id = " + quoteSql(tripId));
  execSql("delete from public.itinerary_trip_versions where trip_id = " + quoteSql(tripId));
  execSql("delete from public.trips where id = " + quoteSql(tripId));
  execSql("delete from public.trip_deletion_tombstones where trip_id = " + quoteSql(tripId));
  execSql("delete from public.admin_users where trip_id = " + quoteSql(tripId));

  for (const user of manifest.users) {
    if (user.id) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error && !/not found|does not exist/i.test(error.message)) throw new Error("delete fixture Auth user: " + error.message);
    }
  }

  const afterData = syncDataSnapshot();
  assert.deepEqual(afterData, manifest.baseline.syncData, "Six-table local testdata snapshot changed outside the fixture; sync clock will not be restored.");
  const afterCounts = countSnapshot();
  assert.deepEqual(afterCounts, manifest.baseline.counts, "Local Auth/Trip/admin/Lease/tombstone counts did not return to baseline.");

  const clock = manifest.baseline.syncClock;
  const updateClock = "update tc_testdata.sync_state set local_last_changed_at = " +
    quoteSql(clock.local_last_changed_at) + "::timestamptz, last_synced_at = " +
    (clock.last_synced_at === null ? "null" : quoteSql(clock.last_synced_at) + "::timestamptz") +
    " where singleton = true";
  execSql(updateClock);
  const restoredClock = readSyncClock();
  assert.equal(restoredClock.local_last_changed_at, clock.local_last_changed_at, "Local change clock did not return to baseline.");
  assert.equal(restoredClock.last_synced_at, clock.last_synced_at, "Local last_synced_at changed unexpectedly.");

  if (existsSync(manifestPath)) await unlink(manifestPath);
  const revision = queryRows("select revision from public.app_data_revision where singleton = true")[0]?.revision;
  console.log(JSON.stringify({
    result: "CLEANUP_PASS",
    tripRemoved: true,
    authUsersRemoved: true,
    rolesRemoved: true,
    tombstoneRemoved: true,
    sixSyncTablesRestoredExactly: true,
    syncClockRestored: true,
    baselineCountsRestored: true,
    currentAppDataRevision: Number(revision),
  }, null, 2));
}

async function prepare() {
  assert(!existsSync(manifestPath), "An S2 fixture manifest already exists. Clean it before preparing another fixture.");
  const suffix = randomUUID();
  const tripId = "adr002-s2-" + suffix;
  const users = [
    { email: "adr002-s2-a-" + suffix + "@example.invalid", password: "S2-A-" + randomUUID() + "-Aa9!" },
    { email: "adr002-s2-b-" + suffix + "@example.invalid", password: "S2-B-" + randomUUID() + "-Bb8!" },
  ];
  const manifest = {
    version: 1,
    tripId,
    users,
    status: "PREPARING",
    baseline: { counts: countSnapshot(), syncData: syncDataSnapshot(), syncClock: readSyncClock() },
  };
  assert.equal(queryRows("select count(*) as count from public.trips where id = " + quoteSql(tripId))[0].count, 0);
  assert.equal(queryRows("select count(*) as count from public.trip_deletion_tombstones where trip_id = " + quoteSql(tripId))[0].count, 0);
  await saveManifest(manifest);

  try {
    for (const user of users) {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email, password: user.password, email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("Auth API returned no fixture user.");
      user.id = data.user.id;
      await saveManifest(manifest);
    }
    assert.notEqual(users[0].id, users[1].id, "The two fixture users must have distinct identities.");

    unwrap(await admin.from("admin_users").insert(users.map((user) => ({
      email: user.email, role: "trip_editor", trip_id: tripId,
    }))), "create isolated trip_editor roles");

    unwrap(await admin.from("trips").insert({
      id: tripId,
      title: "ADR-002 S2 isolated workspace fixture",
      departure_date: "2099-12-31",
      participants: [],
      currency_config: { code: "JPY", symbol: "¥" },
      sidebar_config: [],
      content: {
        days: [1],
        daysData: {
          "1": [
            {
              id: randomUUID(),
              time: "08:00",
              departureTime: "08:30",
              title: "ADR-002 S2 合成卡片 A",
              type: "景點",
              typeColor: "bg-purple-50 text-purple-700 border-purple-200",
              desc: "僅供本機 S2 卡片編輯／排序驗證",
              location: "",
            },
            {
              id: randomUUID(),
              time: "09:00",
              departureTime: "09:30",
              title: "ADR-002 S2 合成卡片 B",
              type: "景點",
              typeColor: "bg-purple-50 text-purple-700 border-purple-200",
              desc: "僅供本機 S2 卡片編輯／排序驗證",
              location: "",
            },
          ],
        },
      },
      is_public: false,
    }), "create isolated private Trip");

    const current = countSnapshot();
    assert.equal(current.auth_users, manifest.baseline.counts.auth_users + 2);
    assert.equal(current.trips, manifest.baseline.counts.trips + 1);
    assert.equal(current.admin_users, manifest.baseline.counts.admin_users + 2);
    assert.equal(current.leases, manifest.baseline.counts.leases);
    assert.equal(current.tombstones, manifest.baseline.counts.tombstones);
    manifest.status = "READY";
    await saveManifest(manifest);

    console.log(JSON.stringify({
      result: "FIXTURE_READY",
      scope: "local loopback Supabase only",
      tripId,
      users: users.map((user) => ({ id: user.id, email: user.email, password: user.password })),
      baselineCounts: manifest.baseline.counts,
      fixtureCounts: current,
      manifestPath,
      cleanupCommand: "node scripts/adr002-s2-local-fixture.mjs cleanup",
    }, null, 2));
  } catch (error) {
    try {
      await cleanupFixture(manifest);
    } catch (cleanupError) {
      console.error("FIXTURE_CLEANUP_FAILED: " + cleanupError.stack);
    }
    throw error;
  }
}

async function verifySessions(manifest) {
  assert.equal(manifest.status, "READY", "S2 fixture is not ready.");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
      clear: () => memory.clear(),
    },
  });

  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const cloudService = await vite.ssrLoadModule("/src/services/tripCloudService.ts");
    const repository = await vite.ssrLoadModule("/src/services/tripRepository.ts");
    const sessions = await Promise.all(manifest.users.map(async (user) => {
      const client = createClient(baseUrl, status.ANON_KEY, options);
      const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
      if (error || !data.session || !data.user) throw error ?? new Error("Fixture login returned no session.");
      const verifiedUser = unwrap(await client.auth.getUser(), "verify fixture Auth session");
      assert.equal(verifiedUser.user.id, user.id, "Auth session user ID mismatch.");
      const trips = unwrap(await client.from("trips").select("id,title,is_public").eq("id", manifest.tripId), "read fixture Trip");
      const roles = unwrap(await client.from("admin_users").select("role,trip_id").eq("email", user.email), "read fixture role");
      assert(trips.some((trip) => trip.id === manifest.tripId), "Authenticated user cannot read fixture Trip.");
      assert(roles.some((role) => role.role === "trip_editor" && role.trip_id === manifest.tripId), "Authenticated user cannot read its fixture trip_editor role.");

      const cloudRecords = await cloudService.getCloudTripRecordsStrict(client);
      assert(cloudRecords.some((record) => record.meta.id === manifest.tripId), "Production cloud service did not hydrate the private fixture Trip.");
      const tripMetas = await repository.getTripMetas(
        client,
        "http://127.0.0.1:5173/Travel-Companion/",
        cloudRecords,
      );
      assert(tripMetas.some((trip) => trip.id === manifest.tripId), "Production Trip repository did not include the private fixture Trip.");

      await client.auth.signOut();
      return { userId: data.user.id, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
    }));
    assert.notEqual(sessions[0].userId, sessions[1].userId);
    assert.notEqual(sessions[0].accessToken, sessions[1].accessToken);
    assert.notEqual(sessions[0].refreshToken, sessions[1].refreshToken);
    console.log(JSON.stringify({
      result: "DUAL_SESSION_AND_PRODUCTION_REPOSITORY_PASS",
      distinctUserIds: true,
      distinctAccessTokens: true,
      distinctRefreshTokens: true,
      bothUsersCanReadPrivateFixtureTrip: true,
      bothUsersHaveTripEditorRole: true,
      productionCloudServiceIncludesFixture: true,
      productionTripRepositoryIncludesFixture: true,
      credentialsPrinted: false,
    }, null, 2));
  } finally {
    await vite.close();
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
}

const action = process.argv[2];
if (action === "prepare") {
  await prepare();
} else if (action === "verify") {
  assert(existsSync(manifestPath), "No S2 fixture manifest exists.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await verifySessions(manifest);
} else if (action === "cleanup") {
  assert(existsSync(manifestPath), "No S2 fixture manifest exists.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await cleanupFixture(manifest);
} else if (action === "credentials") {
  assert(existsSync(manifestPath), "No S2 fixture manifest exists.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.status, "READY", "S2 fixture is not ready.");
  console.log(JSON.stringify({ tripId: manifest.tripId, users: manifest.users.map(({ id, email, password }) => ({ id, email, password })) }, null, 2));
} else {
  throw new Error("Usage: node scripts/adr002-s2-local-fixture.mjs prepare|credentials|cleanup");
}
