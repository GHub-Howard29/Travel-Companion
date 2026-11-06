import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import process from "node:process";
import { EXCEL_RPC_DATASET_ID, normalizeExcelRpcDatasetCases, validateExcelRpcDataset } from "./lib/excel-rpc-test-dataset.mjs";
import { applyFixtureImport, normalizeFixtureRows } from "./lib/testdata-download-apply.mjs";

process.env.SUPABASE_TELEMETRY_DISABLED = "1";
const root = process.cwd();
const fixturesRoot = path.resolve(root, "supabase", "test-fixtures");
const tables = ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"];

function runGit(args) {
  return execFileSync("git.exe", args, { cwd: root, encoding: "utf8", shell: true }).trim();
}
function runCli(args) {
  return execFileSync("npx.cmd", ["supabase", ...args], { cwd: root, encoding: "utf8", shell: true, maxBuffer: 30 * 1024 * 1024 });
}
function assertLocalOnly() {
  const output = runCli(["status", "-o", "json"]);
  const status = JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1));
  const url = status.API_URL ?? status.api_url;
  if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("安全停止：下載只允許寫入本機 loopback Supabase。");
  }
}
function quote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export function withoutDatabaseTimestamps(row) {
  const { created_at: _createdAt, updated_at: _updatedAt, ...rest } = row;
  return canonical(rest);
}
export function sameFixtureRows(left, right, { ignoreTimestamps = false } = {}) {
  const normalize = (rows) => rows.map(ignoreTimestamps ? withoutDatabaseTimestamps : canonical).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return tables.every((table) => JSON.stringify(normalize(left[table])) === JSON.stringify(normalize(right[table])));
}
function detectSensitive(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => detectSensitive(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/email|phone|password|token|secret|api.?key|attachment|uploaded_by|owner_user_id|created_by/i.test(key) &&
          item !== null && item !== "" && item !== false) throw new Error(`Fixture 疑似含敏感欄位：${location}.${key}`);
      detectSensitive(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/.test(value))) {
    throw new Error(`Fixture 疑似含個資或憑證：${location}`);
  }
}
async function readRemoteBaseline(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  if (!manifest || typeof manifest.fixtureId !== "string" || !manifest.fixtureId.trim() || manifest.fixtureId !== path.basename(directory) ||
      manifest.schemaVersion !== 1 || !["active", "regression_pending"].includes(manifest.status) ||
      !Array.isArray(manifest.tables) || manifest.tables.length !== tables.length ||
      tables.some((table) => !manifest.tables.includes(table))) {
    throw new Error(`遠端 fixture manifest 結構無效：${path.basename(directory)}`);
  }
  if (!data.trips || data.trips.length !== 1 || data.trips[0].id !== manifest.fixtureId ||
      data.trips[0].content?.testPurpose !== "three-way-sync" ||
      Object.hasOwn(data.trips[0], "participants") ||
      JSON.stringify(normalizeFixtureRows(data)) !== JSON.stringify(data)) {
    throw new Error(`遠端 fixture 的測試標記或帳號／參與者排除格式無效：${manifest.fixtureId}`);
  }
  for (const table of tables) {
    if (!Array.isArray(data[table]) || manifest.counts?.[table] !== data[table].length) throw new Error(`遠端 fixture ${manifest.fixtureId} 的 ${table} 筆數不符。`);
  }
  if (["checklists", "expenses", "exchange_purchases", "other_info_items"].some((table) => data[table].some((row) => row.trip_id !== manifest.fixtureId))) {
    throw new Error(`遠端 fixture ${manifest.fixtureId} 含有其他行程資料。`);
  }
  if (data.checklists.some((row) => row.trip_id !== manifest.fixtureId)) {
    throw new Error(`遠端 fixture ${manifest.fixtureId} checklist 超出該測試行程範圍。`);
  }
  return { manifest, data };
}
async function fetchCurrentData(fixtureId) {
  const id = quote(fixtureId);
  const sql = `select json_build_object(
    'trips', coalesce((select json_agg(to_jsonb(t)) from (select id,title,departure_date,currency_config,sidebar_config,content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
    'checklists', coalesce((select json_agg(to_jsonb(c)) from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
    'checklist_items', coalesce((select json_agg(to_jsonb(i)) from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
    'expenses', coalesce((select json_agg(to_jsonb(e)) from (select trip_id,title,amount,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
    'exchange_purchases', coalesce((select json_agg(to_jsonb(e)) from (select id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at from public.exchange_purchases where trip_id=${id}) e),'[]'::json),
    'other_info_items', coalesce((select json_agg(to_jsonb(o)) from (select id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at from public.other_info_items where trip_id=${id}) o),'[]'::json)
  ) as payload`;
  const file = path.join(os.tmpdir(), `tc-test-download-read-${process.pid}-${Date.now()}.sql`);
  try {
    await writeFile(file, sql, { flag: "wx" });
    const output = runCli(["db", "query", "--local", "--output-format", "json", "--file", file]);
    const start = output.indexOf("[");
    const rows = JSON.parse(output.slice(start, output.lastIndexOf("]") + 1));
    return rows[0].payload;
  } finally { await rm(file, { force: true }); }
}
async function downloadOne(entry) {
  const directory = path.join(fixturesRoot, entry.name);
  const { manifest, data } = await readRemoteBaseline(directory);
  const actual = await fetchCurrentData(entry.name);
  const currentTrip = actual.trips?.[0];
  if (currentTrip && currentTrip.content?.testPurpose !== "three-way-sync") {
    throw new Error(`本機同 ID 行程不是指定測試資料，拒絕覆寫：${entry.name}`);
  }
  if (sameFixtureRows(actual, data, { ignoreTimestamps: true })) {
    return { fixtureId: entry.name, result: "unchanged", data: null, manifest: null };
  }
  return { fixtureId: entry.name, result: "downloaded", manifest, data };
}
async function prepareExcelRpcDatasetDownload() {
  const directory = path.join(fixturesRoot, EXCEL_RPC_DATASET_ID);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const cases = JSON.parse(await readFile(path.join(directory, "cases.json"), "utf8")).cases;
  const dataset = validateExcelRpcDataset({ manifest, cases, directoryName: EXCEL_RPC_DATASET_ID });
  const localCasesPath = path.resolve(root, "supabase", ".temp", "excel-rpc-test-cases.json");
  let localCases;
  try {
    localCases = JSON.parse(await readFile(localCasesPath, "utf8")).cases;
    localCases = normalizeExcelRpcDatasetCases(localCases);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sameContent = localCases !== undefined &&
    JSON.stringify(localCases) === JSON.stringify(dataset.cases);
  return {
    datasetId: EXCEL_RPC_DATASET_ID,
    result: sameContent ? "unchanged" : "downloaded",
    localCasesPath,
    cases: dataset.cases,
    manifest: dataset.manifest,
  };
}
export async function runDownload() {
  if (process.platform !== "win32") throw new Error("此下載入口目前只支援專案 Windows 節點。");
  if (runGit(["branch", "--show-current"]) !== "develop") throw new Error("下載只允許在 develop 分支。");
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream !== "origin/develop") throw new Error("develop upstream 必須是 origin/develop。");
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error("下載前 Git 工作樹必須乾淨；請先保存／提交其他變更。");
  assertLocalOnly();

  let excelPlan;
  try {
    excelPlan = await prepareExcelRpcDatasetDownload();
  } catch (error) {
    excelPlan = {
      datasetId: EXCEL_RPC_DATASET_ID,
      result: "error",
      error: error.message,
    };
  }
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const fixturePlans = [];
  for (const entry of entries.filter((item) => item.isDirectory() && item.name !== EXCEL_RPC_DATASET_ID)) {
    const manifestPath = path.join(fixturesRoot, entry.name, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (manifest?.status === "deleted" || manifest?.status === "archived" || manifest?.status === "released") continue;
    if (!manifest || manifest.fixtureId !== entry.name) {
      throw new Error(`測試 fixture 目錄與 manifest ID 不一致：${entry.name}`);
    }
    fixturePlans.push(await downloadOne(entry));
  }

  const changedFixtures = fixturePlans
    .filter((item) => item.result === "downloaded")
    .map(({ manifest, data }) => ({ manifest, data, previousData: null }));
  if (changedFixtures.length) {
    await applyFixtureImport(changedFixtures, { runCli: (args) => runCli(args) });
  }

  if (excelPlan.result === "downloaded") {
    try {
      await mkdir(path.dirname(excelPlan.localCasesPath), { recursive: true });
      const temp = excelPlan.localCasesPath + `.tmp-${process.pid}-${Date.now()}`;
      try {
        await writeFile(temp, JSON.stringify({ cases: excelPlan.cases }, null, 2) + "\n", { flag: "wx" });
        await rename(temp, excelPlan.localCasesPath);
      } finally {
        await rm(temp, { force: true });
      }
    } catch (error) {
      excelPlan = { datasetId: EXCEL_RPC_DATASET_ID, result: "error", error: error.message };
    }
  }

  const results = [excelPlan, ...fixturePlans].map(({ data, cases, manifest, localCasesPath, ...summary }) => summary);
  const fixtureChangedCount = changedFixtures.length;
  const excelChanged = excelPlan.result === "downloaded";
  const excelFailed = excelPlan.result === "error";
  console.log("[testdata-download] 下載檢查完成");
  console.log(`- 資料庫測試行程：${fixtureChangedCount === 0 ? "無需更新" : `已更新 ${fixtureChangedCount} 組`}`);
  console.log(`- Excel RPC 測試案例：${excelChanged ? "已更新" : excelFailed ? `未更新：${excelPlan.error}` : "內容相同，無需更新"}`);
  console.log(`- 本機資料庫寫入：${fixtureChangedCount > 0 ? "已完成交易式匯入" : "未執行（內容相同）"}`);
  console.log(JSON.stringify({
    success: !excelFailed,
    downloaded: fixtureChangedCount > 0 || excelChanged,
    databaseFixturesApplied: fixtureChangedCount,
    excelCasesUpdated: excelChanged,
    excelCasesError: excelFailed ? excelPlan.error : null,
    results,
  }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runDownload().catch((error) => {
    console.error(`[testdata-download] 下載失敗：${error.message}`);
    if (error?.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
