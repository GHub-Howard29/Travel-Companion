import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  EXCEL_RPC_DATASET_ID,
  checksumExcelRpcDataset,
  createLocalExcelRpcExecution,
  validateExcelRpcDataset,
} from "./lib/excel-rpc-test-dataset.mjs";

process.env.SUPABASE_TELEMETRY_DISABLED = "1";
const root = process.cwd();
const fixtureDir = path.resolve(root, "supabase", "test-fixtures", EXCEL_RPC_DATASET_ID);
const executionStatePath = path.resolve(root, "supabase", ".temp", "excel-rpc-executions.json");
const localCasesPath = path.resolve(root, "supabase", ".temp", "excel-rpc-test-cases.json");

function runCli(args) {
  return execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, shell: process.platform === "win32",
  });
}
function runGit(args) {
  return execFileSync(process.platform === "win32" ? "git.exe" : "git", args, {
    cwd: root, encoding: "utf8", shell: process.platform === "win32",
  }).trim();
}
function assertLocalOnly() {
  const status = JSON.parse(runCli(["status", "-o", "json"]));
  const url = status.API_URL ?? status.api_url;
  if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("安全停止：只允許目前節點 loopback Supabase。");
}
async function readDataset({ local = false } = {}) {
  const [manifestText, caseText] = await Promise.all([
    readFile(path.join(fixtureDir, "manifest.json"), "utf8"),
    readFile(local ? localCasesPath : path.join(fixtureDir, "cases.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const cases = JSON.parse(caseText).cases;
  return validateExcelRpcDataset({
    manifest,
    cases,
    directoryName: EXCEL_RPC_DATASET_ID,
    verifyManifestDigest: !local,
  });
}
async function prepareLocalCases() {
  await mkdir(path.dirname(localCasesPath), { recursive: true });
  try {
    await readFile(localCasesPath, "utf8");
    throw new Error("本機案例編輯副本已存在，為避免覆蓋使用者修改而停止。");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const source = await readFile(path.join(fixtureDir, "cases.json"), "utf8");
  await writeFile(localCasesPath, source, { flag: "wx" });
  return localCasesPath;
}
async function loadExecutionState() {
  try {
    const state = JSON.parse(await readFile(executionStatePath, "utf8"));
    if (state.schemaVersion !== 1 || !state.cases || typeof state.cases !== "object") throw new Error("本機 Excel RPC execution state 格式錯誤。");
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, cases: {} };
    throw error;
  }
}
async function saveExecutionState(state) {
  await mkdir(path.dirname(executionStatePath), { recursive: true });
  const temp = executionStatePath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    await rename(temp, executionStatePath);
  } finally { await rm(temp, { force: true }); }
}
async function readLocalEnvironment() {
  const candidates = [path.resolve(root, ".env.local"), path.resolve(root, ".env")];
  const values = {};
  for (const file of candidates) {
    try {
      const content = await readFile(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/);
        if (match && !values[match[1]]) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return values;
}
async function assertRpcReady() {
  const migrations = runCli(["migration", "list", "--local"]);
  if (!migrations.includes("20261103150000")) throw new Error("本機尚未套用 Excel RPC migration 20261103150000。");
  const environment = await readLocalEnvironment();
  const url = environment.VITE_SUPABASE_URL;
  const anonKey = environment.VITE_SUPABASE_ANON_KEY;
  const accessToken = process.env.TC_LOCAL_SUPABASE_ACCESS_TOKEN;
  if (!url || !anonKey || !accessToken) {
    throw new Error("本機 RPC 重建需要 .env.local 的 VITE_SUPABASE_URL／VITE_SUPABASE_ANON_KEY，以及環境變數 TC_LOCAL_SUPABASE_ACCESS_TOKEN（本機 Super Admin JWT）。未提供 token，停止且不寫入資料。");
  }
  const parsedUrl = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) throw new Error("RPC 重建只允許 .env.local 指向 loopback Supabase。");
  return { url: url.replace(/\/$/, ""), anonKey, accessToken };
}
async function localRestRequest(context, resource, query = "") {
  const url = `${context.url}/rest/v1/${resource}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${context.accessToken}`,
      "x-travel-companion-client-id": randomUUID(),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local Supabase verification failed (HTTP ${response.status}): ${body.slice(0, 800)}`);
  }
  return response.json();
}
async function invokeExcelRpc(testCase, requestId, context) {
  const cards = testCase.cards.map((card) => ({
    day: card.day, time: card.time,
    ...(card.departureTime !== undefined ? { departureTime: card.departureTime } : {}),
    title: card.title, type: card.type,
    ...(card.desc !== undefined ? { desc: card.desc } : {}),
  }));
  const response = await fetch(`${context.url}/rest/v1/rpc/tc_create_trip_from_excel`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${context.accessToken}`,
      "Content-Type": "application/json",
      "x-travel-companion-client-id": randomUUID(),
    },
    body: JSON.stringify({
      p_request_id: requestId,
      p_title: testCase.title,
      p_departure_date: testCase.departureDate,
      p_cards: cards,
      p_currency_code: testCase.currencyCode,
      p_currency_symbol: testCase.currencySymbol,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local Excel RPC failed (HTTP ${response.status}): ${body.slice(0, 800)}`);
  }
  return response.json();
}
async function verifyCreatedTrip(testCase, tripId, context) {
  const query = new URLSearchParams({
    id: `eq.${tripId}`,
    select: "id,departure_date,content",
  });
  const trips = await localRestRequest(context, "trips", query.toString());
  if (!Array.isArray(trips) || trips.length !== 1) throw new Error(`Trip ${tripId} cannot be read back after RPC.`);
  const trip = trips[0];
  if (trip.departure_date !== testCase.departureDate) throw new Error("RPC stored a different departure date.");
  const content = trip.content ?? {};
  const daysData = content.daysData ?? {};
  if (!Array.isArray(content.days) || content.days.length !== testCase.dayCount || daysData.mode !== "guided") {
    throw new Error("RPC stored an unexpected days/daysData structure.");
  }
  for (let day = 1; day <= testCase.dayCount; day += 1) {
    const actual = daysData[String(day)];
    if (!Array.isArray(actual)) throw new Error(`RPC omitted day ${day}; empty days must be preserved.`);
    const expected = testCase.cards.filter((card) => card.day === day);
    if (actual.length !== expected.length) throw new Error(`RPC card count differs on day ${day}.`);
    for (let index = 0; index < expected.length; index += 1) {
      const actualCard = actual[index];
      const expectedCard = expected[index];
      const expectedEnd = expectedCard.departureTime ?? expectedCard.time;
      if (actualCard.time !== expectedCard.time ||
          actualCard.departureTime !== expectedEnd ||
          actualCard.title !== expectedCard.title ||
          actualCard.type !== expectedCard.type ||
          actualCard.desc !== (expectedCard.desc ?? "")) {
        throw new Error(`RPC did not preserve date/time/card content for case ${testCase.caseId}, day ${day}, card ${index + 1}.`);
      }
    }
  }
  const infoQuery = new URLSearchParams({
    trip_id: `eq.${tripId}`,
    client_item_id: `eq.${tripId}-guided-special-info`,
    select: "title,content",
  });
  const specialInfo = await localRestRequest(context, "other_info_items", infoQuery.toString());
  if (!Array.isArray(specialInfo) || specialInfo.length !== 1 || specialInfo[0].title !== "領隊導遊聯絡資訊") {
    throw new Error("RPC special Other Info item was not stored.");
  }
}
async function executeCase(testCase, { replay = false, reuseExisting = false, expectNewTrip = false, context } = {}) {
  const state = await loadExecutionState();
  const previous = state.cases[testCase.caseId];
  if (replay && !previous?.requestId) throw new Error(`Case ${testCase.caseId} has no local request to replay.`);
  const shouldReuse = replay || (reuseExisting && Boolean(previous?.requestId));
  const requestId = shouldReuse
    ? previous.requestId
    : createLocalExcelRpcExecution({ caseId: testCase.caseId }).requestId;
  const response = await invokeExcelRpc(testCase, requestId, context);
  if (!response?.trip_id || response.title !== testCase.title ||
      response.card_count !== testCase.cards.length || response.day_count !== testCase.dayCount) {
    throw new Error(`Excel RPC case ${testCase.caseId} returned an unexpected result.`);
  }
  const record = {
    requestId, tripId: response.trip_id, title: response.title,
    departureDate: testCase.departureDate, createdAt: response.created_at,
    cardCount: response.card_count, dayCount: response.day_count,
    idempotentReplay: response.idempotent_replay === true,
  };
  if ((replay || (reuseExisting && previous?.requestId)) &&
      (record.tripId !== previous.tripId || record.idempotentReplay !== true)) {
    throw new Error("Idempotent replay did not return the previously created local Trip.");
  }
  if (expectNewTrip && previous?.tripId && record.tripId === previous.tripId) {
    throw new Error("A new request UUID unexpectedly reused the previous Trip ID.");
  }
  await verifyCreatedTrip(testCase, record.tripId, context);
  state.cases[testCase.caseId] = record;
  await saveExecutionState(state);
  return record;
}
async function executeConcurrentCase(testCase, context) {
  const requestId = createLocalExcelRpcExecution({ caseId: testCase.caseId }).requestId;
  const [first, second] = await Promise.all([
    invokeExcelRpc(testCase, requestId, context),
    invokeExcelRpc(testCase, requestId, context),
  ]);
  for (const response of [first, second]) {
    if (!response?.trip_id || response.title !== testCase.title ||
        response.card_count !== testCase.cards.length || response.day_count !== testCase.dayCount) {
      throw new Error(`Concurrent Excel RPC case ${testCase.caseId} returned an unexpected result.`);
    }
  }
  if (first.trip_id !== second.trip_id ||
      [first.idempotent_replay, second.idempotent_replay].filter((value) => value === true).length !== 1 ||
      [first.idempotent_replay, second.idempotent_replay].filter((value) => value === false).length !== 1) {
    throw new Error("Concurrent same-request calls did not return one Trip with exactly one idempotent replay.");
  }
  await verifyCreatedTrip(testCase, first.trip_id, context);
  const registryQuery = new URLSearchParams({ request_id: `eq.${requestId}`, select: "request_id,trip_id" });
  const registry = await localRestRequest(context, "tc_trip_excel_create_requests", registryQuery.toString());
  if (!Array.isArray(registry) || registry.length !== 1 || registry[0].trip_id !== first.trip_id) {
    throw new Error("Concurrent same-request calls did not leave exactly one request registry row for the returned Trip.");
  }
  return { requestId, tripId: first.trip_id, idempotentReplayFlags: [first.idempotent_replay, second.idempotent_replay], registryRows: registry.length };
}

async function main() {
  const command = process.argv[2] ?? "validate";
  if (process.platform !== "win32") throw new Error("Excel RPC dataset command requires the Windows local test environment.");
  if (command === "validate") {
    const dataset = await readDataset();
    console.log(JSON.stringify({
      valid: true, datasetId: dataset.manifest.datasetId, version: dataset.manifest.version,
      cases: dataset.cases.map(({ caseId, dayCount, cards }) => ({ caseId, dayCount, cardCount: cards.length })),
      checksum: checksumExcelRpcDataset(dataset.cases),
    }, null, 2));
    return;
  }
  if (command === "prepare") {
    const file = await prepareLocalCases();
    console.log(JSON.stringify({ prepared: true, file, next: "編輯這份 .temp 案例檔後執行 validate-local，再輸入 /上傳資料庫。" }, null, 2));
    return;
  }
  if (command === "validate-local") {
    const dataset = await readDataset({ local: true });
    console.log(JSON.stringify({
      valid: true, datasetId: dataset.manifest.datasetId, source: localCasesPath,
      cases: dataset.cases.map(({ caseId, dayCount, cards }) => ({ caseId, dayCount, cardCount: cards.length })),
      checksum: checksumExcelRpcDataset(dataset.cases),
    }, null, 2));
    return;
  }
  assertLocalOnly();
  const context = await assertRpcReady();
  const dataset = await readDataset();
  if (command === "rebuild") {
    const results = [];
    for (const testCase of dataset.cases) {
      results.push(await executeCase(testCase, { reuseExisting: true, context }));
    }
    const executionState = await loadExecutionState();
    for (const testCase of dataset.cases) {
      const pairCaseId = testCase.expected?.pairCaseId;
      if (!pairCaseId) continue;
      const current = executionState.cases[testCase.caseId];
      const paired = executionState.cases[pairCaseId];
      if (!paired || current.tripId === paired.tripId || current.requestId === paired.requestId) {
        throw new Error(`Duplicate title/date case pair ${testCase.caseId} / ${pairCaseId} did not produce independent local Trips and request IDs.`);
      }
    }
    console.log(JSON.stringify({ rebuilt: results.length, database: "local loopback only", requestMode: "existing request UUID reused per local case; first run creates one", results }, null, 2));
    return;
  }
  if (command === "concurrent") {
    const caseId = process.argv[3];
    const testCase = dataset.cases.find((item) => item.caseId === caseId);
    if (!testCase) throw new Error(`Unknown dataset case: ${caseId}`);
    const result = await executeConcurrentCase(testCase, context);
    console.log(JSON.stringify({ command, database: "local loopback only", result }, null, 2));
    return;
  }
  if (["replay", "new-request"].includes(command)) {
    const caseId = process.argv[3];
    const testCase = dataset.cases.find((item) => item.caseId === caseId);
    if (!testCase) throw new Error(`Unknown dataset case: ${caseId}`);
    const result = await executeCase(testCase, {
      replay: command === "replay",
      expectNewTrip: command === "new-request",
      context,
    });
    console.log(JSON.stringify({ command, database: "local loopback only", result }, null, 2));
    return;
  }
  throw new Error("使用方式：node scripts/excel-rpc-test-dataset.mjs validate|prepare|validate-local|rebuild|concurrent <caseId>|replay <caseId>|new-request <caseId>");
}
main().catch((error) => { console.error(`[excel-rpc-test-dataset] 停止：${error?.stderr?.toString().trim() || error.message || error}`); process.exitCode = 1; });
