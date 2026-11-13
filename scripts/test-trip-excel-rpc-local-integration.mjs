import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import {
  EXCEL_RPC_DATASET_ID,
  validateExcelRpcDataset,
} from "./lib/excel-rpc-test-dataset.mjs";

const root = process.cwd();
const fixtureDir = path.resolve(root, "supabase", "test-fixtures", EXCEL_RPC_DATASET_ID);
const targetCaseId = process.argv.slice(1).filter((arg) => !arg.startsWith("--") && !arg.toLowerCase().endsWith(".mjs")).at(-1) ?? "multi-day-time-preservation";
const runId = randomUUID();
const email = `excel-rpc-local-${runId}@example.invalid`;
const requestId = randomUUID();
const recoveryRequestIds = new Set([requestId]);
const displayName = "Local Excel RPC Integration Test";
const createdTripIds = new Set();
let authUserId = null;
let adminUserCreated = false;
let cleanupErrors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function assertLoopback(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname), "Safety stop: local integration test only accepts loopback Supabase.");
}
async function readCase() {
  const [manifestText, casesText] = await Promise.all([
    readFile(path.join(fixtureDir, "manifest.json"), "utf8"),
    readFile(path.join(fixtureDir, "cases.json"), "utf8"),
  ]);
  const dataset = validateExcelRpcDataset({
    manifest: JSON.parse(manifestText),
    cases: JSON.parse(casesText).cases,
    directoryName: EXCEL_RPC_DATASET_ID,
  });
  const testCase = dataset.cases.find((item) => item.caseId === targetCaseId);
  assert(testCase, `Unknown Excel RPC case: ${targetCaseId}`);
  return testCase;
}
function localSupabaseStatus() {
  const container = "supabase_auth_travel-companion";
  const inspect = execFileSync(
    "docker",
    ["inspect", container, "--format", "{{range .Config.Env}}{{println .}}{{end}}"],
    { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, windowsHide: true },
  );
  const config = {};
  for (const line of inspect.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) config[line.slice(0, separator)] = line.slice(separator + 1);
  }
  const apiUrl = config.API_EXTERNAL_URL;
  const jwtSecret = config.GOTRUE_JWT_SECRET;
  assert(apiUrl && jwtSecret, "Local Auth container is missing required API/JWT configuration.");
  assertLoopback(apiUrl);
  const apiKeyConfig = execFileSync(
    "docker",
    ["exec", "supabase_kong_travel-companion", "sh", "-c", "grep -oE 'sb_publishable_[A-Za-z0-9_-]+' /home/kong/kong.yml | head -1"],
    { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true },
  );
  const anonKey = apiKeyConfig.trim();
  assert(anonKey.startsWith("sb_publishable_"), "Local Kong configuration is missing its publishable anon API key.");
  const status = runLocalSql("select 'local-supabase-status' as marker;");
  assert(status.ok, `Local Supabase database is unavailable (${status.errorClass ?? "unknown"}).`);
  const url = new URL(apiUrl);
  url.pathname = url.pathname.replace(/\/auth\/v1\/?$/, "").replace(/\/$/, "");
  return { url: url.toString().replace(/\/$/, ""), anonKey, jwtSecret };
}
function signLocalAccessToken(jwtSecret, userId, userEmail) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "supabase",
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    email: userEmail,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
}
function runLocalSql(sql) {
  assert(typeof sql === "string" && sql.trim(), "Local SQL must be non-empty.");
  try {
    const executable = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
    const output = execFileSync(
      process.execPath,
      [executable, "db", "query", "--local", "--output-format", "json", sql],
      { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    );
    return { ok: true, output };
  } catch (error) {
    const details = [error?.code, error?.stderr?.toString?.("utf8"), error?.message].filter(Boolean).join(" ");
    const errorClass = /ENOENT|not recognized/i.test(details)
      ? "executable-not-found"
      : /docker|npipe|pipe/i.test(details)
        ? "docker-runtime"
        : /permission|denied|forbidden/i.test(details)
          ? "permission"
          : /syntax|column|relation|constraint|foreign key/i.test(details)
            ? "sql-or-schema"
            : "cli-or-process";
    return { ok: false, errorClass };
  }
}
async function checkedRequest(url, key, token, method, body) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    const pathname = new URL(url).pathname;
    throw new Error(`Local integration API ${method} ${pathname} failed (HTTP ${response.status}): ${responseText.slice(0, 500)}`);
  }
  return responseText ? JSON.parse(responseText) : null;
}
async function recoverRequest(requestId, context) {
  return checkedRequest(
    `${context.url}/rest/v1/rpc/tc_get_trip_excel_create_request`,
    context.anonKey,
    context.accessToken,
    "POST",
    { p_request_id: requestId },
  );
}
async function rejectedRequest(url, key, token, body, expectedCode) {
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  assert(!response.ok, `Expected RPC rejection ${expectedCode}, but request succeeded.`);
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch { /* retain empty error payload */ }
  assert(payload.message === expectedCode || payload.code === expectedCode, `Expected ${expectedCode}; received ${payload.message ?? payload.code ?? `HTTP ${response.status}`}.`);
}
function readSqlRows(sql) {
  const result = runLocalSql(sql);
  assert(result.ok, `Local SQL assertion failed (${result.errorClass ?? "unknown"}).`);
  return JSON.parse(result.output);
}
async function runLocalSqlFile(sql) {
  const filename = path.join(tmpdir(), `tc-excel-rpc-${randomUUID()}.sql`);
  try {
    await writeFile(filename, sql, { encoding: "utf8", flag: "wx" });
    execFileSync(
      "docker",
      ["exec", "-i", "supabase_db_travel-companion", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { cwd: root, input: sql, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    );
    return { ok: true };
  } catch (error) {
    const details = [error?.code, error?.stderr?.toString?.("utf8"), error?.message].filter(Boolean).join(" ");
    const errorClass = /docker|npipe|pipe/i.test(details) ? "docker-runtime" : /permission|denied|forbidden/i.test(details) ? "permission" : /syntax|column|relation|constraint|foreign key/i.test(details) ? "sql-or-schema" : "psql-or-process";
    return { ok: false, errorClass };
  } finally {
    await unlink(filename).catch(() => {});
  }
}
async function invoke(testCase, context, options = {}) {
  const callRequestId = options.requestId ?? requestId;
  const cards = (options.cards ?? testCase.cards).map((card) => ({
    day: card.day,
    time: card.time,
    ...(card.departureTime !== undefined ? { departureTime: card.departureTime } : {}),
    title: card.title,
    type: card.type,
    ...(card.desc !== undefined ? { desc: card.desc } : {}),
  }));
  return checkedRequest(
    `${context.url}/rest/v1/rpc/tc_create_trip_from_excel`,
    context.anonKey,
    context.accessToken,
    "POST",
    {
      p_request_id: callRequestId,
      p_title: options.title ?? testCase.title,
      p_departure_date: testCase.departureDate,
      p_cards: cards,
      p_currency_code: testCase.currencyCode,
      p_currency_symbol: testCase.currencySymbol,
    },
  );
}
async function verifyTrip(testCase, tripId, context) {
  const query = new URLSearchParams({ id: `eq.${tripId}`, select: "id,departure_date,content" });
  const rows = await checkedRequest(
    `${context.url}/rest/v1/trips?${query}`,
    context.anonKey,
    context.accessToken,
    "GET",
  );
  assert(Array.isArray(rows) && rows.length === 1, "Created Trip could not be read back.");
  const trip = rows[0];
  assert(trip.departure_date === testCase.departureDate, "Departure date mismatch.");
  const content = trip.content ?? {};
  const daysData = content.daysData ?? {};
  assert(Array.isArray(content.days) && content.days.length === testCase.dayCount, "Trip day count mismatch.");
  assert(daysData.mode === "guided", "Trip day data mode mismatch.");
  for (let day = 1; day <= testCase.dayCount; day += 1) {
    const actual = daysData[String(day)];
    assert(Array.isArray(actual), `Day ${day} missing; empty days must remain present.`);
    const expected = testCase.cards.filter((card) => card.day === day);
    assert(actual.length === expected.length, `Day ${day} card count mismatch.`);
    for (let index = 0; index < expected.length; index += 1) {
      const a = actual[index];
      const e = expected[index];
      assert(
        a.time === e.time &&
        a.departureTime === (e.departureTime ?? e.time) &&
        a.title === e.title &&
        a.type === e.type &&
        a.desc === (e.desc ?? ""),
        `Day ${day} card ${index + 1} content/time mismatch.`,
      );
    }
  }
  const infoQuery = new URLSearchParams({
    trip_id: `eq.${tripId}`,
    client_item_id: `eq.${tripId}-guided-special-info`,
    select: "title",
  });
  const info = await checkedRequest(
    `${context.url}/rest/v1/other_info_items?${infoQuery}`,
    context.anonKey,
    context.accessToken,
    "GET",
  );
  assert(Array.isArray(info) && info.length === 1 && info[0].title === "領隊導遊聯絡資訊", "Special Other Info row missing.");
}
async function cleanup(context) {
  if (!context) return;
  const requestIdsSql = [...recoveryRequestIds].map((id) => `'${id}'`).join(", ");
  if (requestIdsSql) {
    const requestLookup = runLocalSql(`select trip_id from private.tc_trip_excel_create_requests where request_id in (${requestIdsSql}) and user_id = '${authUserId ?? "00000000-0000-0000-0000-000000000000"}';`);
    if (requestLookup.ok) {
      for (const match of requestLookup.output.matchAll(/trip-[a-f0-9-]{36}/gi)) createdTripIds.add(match[0]);
    } else {
      cleanupErrors.push(`Lookup generated Trip IDs failed (${requestLookup.errorClass ?? "unknown"}).`);
    }
  }
  for (const tripId of createdTripIds) {
    const relatedCleanup = await runLocalSqlFile(`begin; delete from public.other_info_items where trip_id = '${tripId}'; delete from private.trip_participant_email_maps where trip_id = '${tripId}'; delete from public.trips where id = '${tripId}'; commit;`);
    if (!relatedCleanup.ok) cleanupErrors.push(`Cleanup generated Trip rows failed (${relatedCleanup.errorClass}).`);
  }
  if (requestIdsSql || (adminUserCreated && authUserId)) {
    const cleanupSql = `begin; ${requestIdsSql ? `delete from private.tc_trip_excel_create_requests where request_id in (${requestIdsSql}) and user_id = '${authUserId ?? "00000000-0000-0000-0000-000000000000"}';` : ""} ${adminUserCreated && authUserId ? `delete from public.admin_profiles where user_id = '${authUserId}'::uuid and email = '${email}'; delete from public.admin_users where email = '${email}' and role = 'super_admin'; delete from auth.users where id = '${authUserId}'::uuid and email = '${email}';` : ""} commit;`;
    const cleanupResult = await runLocalSqlFile(cleanupSql);
    if (!cleanupResult.ok) cleanupErrors.push(`Cleanup Local RPC temporary rows failed (${cleanupResult.errorClass}).`);
  }
  context.accessToken = null;
}
async function main() {
  assert(process.platform === "win32", "This integration runner requires the Windows local test environment.");
  if (process.argv.includes("--sql-smoke")) {
    const smoke = runLocalSql("select 1 as local_sql_smoke");
    assert(smoke.ok, `Local Supabase CLI SQL smoke test failed (${smoke.errorClass ?? "unknown"}).`);
    console.log("Local Supabase CLI SQL smoke test passed.");
    return;
  }
  const status = localSupabaseStatus();
  const context = {
    url: status.url,
    anonKey: status.anonKey,
    accessToken: null,
  };
  const testCase = await readCase();

  try {
    const userIdSql = readSqlRows("select gen_random_uuid() as user_id;");
    authUserId = userIdSql[0]?.user_id;
    assert(authUserId, "Could not allocate a temporary local Auth user ID.");
    const profileSql = `begin; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', '${authUserId}'::uuid, 'authenticated', 'authenticated', '${email}', crypt('${randomUUID()}-Aa1!', gen_salt('bf', 10)), now(), '', '', '', '', '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb, '{}'::jsonb, now(), now()); insert into public.admin_users (email, role, trip_id) values ('${email}', 'super_admin', ''); insert into public.admin_profiles (user_id, email, display_name, include_in_new_trip, sort_order) values ('${authUserId}'::uuid, '${email}', '${displayName}', true, 0); commit;`;
    const profileResult = await runLocalSqlFile(profileSql);
    if (!profileResult.ok) throw new Error(`Temporary local Auth/Admin identity creation failed (${profileResult.errorClass ?? "unknown"}).`);
    adminUserCreated = true;

    context.accessToken = signLocalAccessToken(status.jwtSecret, authUserId, email);
    const userCheck = await checkedRequest(
      `${context.url}/auth/v1/user`,
      context.anonKey,
      context.accessToken,
      "GET",
    );
    assert(userCheck.id === authUserId && userCheck.email === email, "Signed local JWT identity does not match the temporary Auth user.");

    const calls = await Promise.allSettled([
      invoke(testCase, context),
      invoke(testCase, context),
    ]);
    for (const call of calls) {
      if (call.status === "fulfilled" && call.value?.trip_id) createdTripIds.add(call.value.trip_id);
    }
    const firstResult = calls[0];
    const secondResult = calls[1];
    if (firstResult.status === "rejected") throw firstResult.reason;
    if (secondResult.status === "rejected") throw secondResult.reason;
    const first = firstResult.value;
    const second = secondResult.value;
    assert(first?.trip_id && second?.trip_id, "Concurrent RPC response missing Trip ID.");
    assert(first.trip_id === second.trip_id, "Same request UUID produced different Trip IDs.");
    const replayFlags = [first.idempotent_replay, second.idempotent_replay];
    assert(replayFlags.filter((value) => value === false).length === 1, "Exactly one concurrent call must create the Trip.");
    assert(replayFlags.filter((value) => value === true).length === 1, "Exactly one concurrent call must be an idempotent replay.");

    await verifyTrip(testCase, first.trip_id, context);

    const recovery = await recoverRequest(requestId, context);
    assert(recovery?.status === "CREATED", "Recovery endpoint did not return CREATED for a completed request.");
    assert(recovery.trip_id === first.trip_id, "Recovery endpoint returned a different Trip ID.");
    assert(recovery.idempotent_replay === true, "Recovery endpoint did not mark the recovered result as an idempotent replay.");

    const missingRequestId = randomUUID();
    const missingRecovery = await recoverRequest(missingRequestId, context);
    assert(missingRecovery?.status === "NOT_FOUND", "Recovery endpoint did not return NOT_FOUND for an unknown request UUID.");

    const distinctRequestId = randomUUID();
    recoveryRequestIds.add(distinctRequestId);
    const distinctResult = await invoke(testCase, context, { requestId: distinctRequestId });
    if (distinctResult?.trip_id) createdTripIds.add(distinctResult.trip_id);
    assert(distinctResult?.trip_id, "Different request UUID response missing Trip ID.");
    assert(distinctResult.trip_id !== first.trip_id, "Identical payload with a different request UUID was incorrectly deduplicated.");
    assert(distinctResult.idempotent_replay === false, "Different request UUID unexpectedly returned an idempotent replay.");
    await verifyTrip(testCase, distinctResult.trip_id, context);

    const registryCheck = runLocalSql(
      `select count(*) as row_count from private.tc_trip_excel_create_requests where request_id = '${requestId}' and trip_id = '${first.trip_id}' and user_id = '${authUserId}';`,
    );
    const registryPayload = registryCheck.ok ? JSON.parse(registryCheck.output) : null;
    const registryRows = Array.isArray(registryPayload) ? Number(registryPayload[0]?.row_count ?? 0) : 0;
    assert(registryRows === 1, "Expected exactly one private request registry row for the created Trip.");

    await rejectedRequest(
      `${context.url}/rest/v1/rpc/tc_create_trip_from_excel`,
      context.anonKey,
      context.accessToken,
      {
        p_request_id: requestId,
        p_title: `${testCase.title} payload mismatch`,
        p_departure_date: testCase.departureDate,
        p_cards: testCase.cards.map(({ day, time, departureTime, title, type, desc }) => ({ day, time, ...(departureTime !== undefined ? { departureTime } : {}), title, type, ...(desc !== undefined ? { desc } : {}) })),
        p_currency_code: testCase.currencyCode,
        p_currency_symbol: testCase.currencySymbol,
      },
      "TC_EXCEL_REQUEST_PAYLOAD_MISMATCH",
    );

    const rollbackRequestId = randomUUID();
    const rollbackTitle = `Excel RPC rollback ${runId}`;
    const rollbackCards = testCase.cards.map(({ day, time, departureTime, title, type, desc }) => ({ day, time, ...(departureTime !== undefined ? { departureTime } : {}), title, type, ...(desc !== undefined ? { desc } : {}) }));
    const rollbackBaseline = readSqlRows(`select (select count(*) from public.other_info_items where created_by = '${authUserId}' and title = '領隊導遊聯絡資訊') as other_info_rows, (select count(*) from private.trip_participant_email_maps) as participant_maps;`);
    const rollbackSql = `begin; set local request.jwt.claims = '{"sub":"${authUserId}","email":"${email}"}'; set local role authenticated; select public.tc_create_trip_from_excel('${rollbackRequestId}'::uuid, '${rollbackTitle}', '${testCase.departureDate}'::date, '${JSON.stringify(rollbackCards).replace(/'/g, "''")}'::jsonb, '${testCase.currencyCode}', '${testCase.currencySymbol}'); reset role; do $$ begin raise exception 'TC_TEST_FORCE_ROLLBACK'; end $$;`;
    const rollbackResult = await runLocalSqlFile(rollbackSql);
    assert(!rollbackResult.ok, "Forced rollback SQL unexpectedly committed.");
    const rollbackRows = readSqlRows(
      `select (select count(*) from private.tc_trip_excel_create_requests where request_id = '${rollbackRequestId}') as request_rows, (select count(*) from public.trips where title = '${rollbackTitle}') as trip_rows, (select count(*) from public.other_info_items where created_by = '${authUserId}' and title = '領隊導遊聯絡資訊') as other_info_rows, (select count(*) from private.trip_participant_email_maps) as participant_maps;`,
    );
    assert(Number(rollbackRows[0]?.request_rows) === 0, "Rollback left a request registry row.");
    assert(Number(rollbackRows[0]?.trip_rows) === 0, "Rollback left a Trip row.");
    assert(Number(rollbackRows[0]?.other_info_rows) === Number(rollbackBaseline[0]?.other_info_rows), "Rollback left an additional Other Info row.");
    assert(Number(rollbackRows[0]?.participant_maps) === Number(rollbackBaseline[0]?.participant_maps), "Rollback left an additional participant map row.");

    console.log(JSON.stringify({
      passed: true,
      database: "local loopback only",
      caseId: testCase.caseId,
      dayCount: testCase.dayCount,
      cardCount: testCase.cards.length,
      sameTripId: true,
      idempotentReplayFlags: replayFlags,
      registryRows,
    }, null, 2));
  } finally {
    await cleanup(context);
    context.accessToken = null;
    if (cleanupErrors.length) {
      console.error(JSON.stringify({ cleanup: "failed", errors: cleanupErrors }));
      process.exitCode = 1;
    } else {
      console.log("Local Excel RPC temporary test identity and generated rows cleaned.");
    }
  }
}
main().catch((error) => {
  console.error(`[trip-excel-rpc-local-integration] ${error?.message ?? error}`);
  process.exitCode = 1;
});
