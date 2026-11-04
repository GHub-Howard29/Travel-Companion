import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { classifyBaselineSync, checksumFixture } from "./lib/testdata-clock-sync.mjs";
import { applyFixtureImport } from "./lib/testdata-download-apply.mjs";
import { classifyInitialDownload } from "./lib/testdata-download-policy.mjs";

process.env.SUPABASE_TELEMETRY_DISABLED = "1";
const root = process.cwd();
const fixturesRoot = path.resolve(root, "supabase", "test-fixtures");
const appliedPath = path.resolve(root, "supabase", ".temp", "testdata-applied-state.json");
const tables = ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"];
const tripPattern = /^tc-test-[a-z0-9][a-z0-9-]{2,60}$/;

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
async function loadState() {
  try {
    const state = JSON.parse(await readFile(appliedPath, "utf8"));
    if (state.schemaVersion !== 1 || !state.fixtures) throw new Error("本機 applied state 格式錯誤。");
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, fixtures: {} };
    throw error;
  }
}
async function saveState(state) {
  await mkdir(path.dirname(appliedPath), { recursive: true });
  const temp = appliedPath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    await rename(temp, appliedPath);
  } finally { await rm(temp, { force: true }); }
}
function quote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function withoutDatabaseTimestamps(row) {
  const { created_at: _createdAt, updated_at: _updatedAt, ...rest } = row;
  return canonical(rest);
}
function sameFixtureRows(left, right, { ignoreTimestamps = false } = {}) {
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
  if (typeof value === "string" && (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(value) ||
      /\\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,})\\b/.test(value))) {
    throw new Error(`Fixture 疑似含個資或憑證：${location}`);
  }
}
async function readRemoteBaseline(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  const baselineAt = manifest.baselineAt ?? manifest.exportedAt;
  if (!tripPattern.test(manifest.fixtureId) || manifest.fixtureId !== path.basename(directory) ||
      manifest.schemaVersion !== 1 || !Number.isInteger(manifest.version) || manifest.version < 1 ||
      typeof manifest.sourceHost !== "string" || !manifest.sourceHost.trim() ||
      !["active", "regression_pending"].includes(manifest.status) || !Array.isArray(manifest.tables) ||
      manifest.tables.length !== tables.length || tables.some((table) => !manifest.tables.includes(table)) ||
      !Number.isFinite(Date.parse(baselineAt)) || !/^[a-f0-9]{64}$/.test(manifest.checksum) ||
      checksumFixture(data) !== manifest.checksum) {
    throw new Error(`遠端 fixture manifest/checksum 驗證失敗：${path.basename(directory)}`);
  }
  if ((manifest.version === 1 && (manifest.parentVersion !== undefined || manifest.parentChecksum !== undefined)) ||
      (manifest.version > 1 && (manifest.parentVersion !== manifest.version - 1 || !/^[a-f0-9]{64}$/.test(manifest.parentChecksum ?? "")))) {
    throw new Error(`遠端 fixture ${manifest.fixtureId} parent revision 欄位無效。`);
  }
  manifest.baselineAt = new Date(baselineAt).toISOString();
  if (!data.trips || data.trips.length !== 1 || data.trips[0].id !== manifest.fixtureId ||
      data.trips[0].content?.__testFixture !== true || !Array.isArray(data.trips[0].participants) || data.trips[0].participants.length !== 0) {
    throw new Error(`遠端 fixture 不是合格的單筆合成行程：${manifest.fixtureId}`);
  }
  for (const table of tables) {
    if (!Array.isArray(data[table]) || manifest.counts?.[table] !== data[table].length) throw new Error(`遠端 fixture ${manifest.fixtureId} 的 ${table} 筆數不符。`);
  }
  if (["checklists", "expenses", "exchange_purchases", "other_info_items"].some((table) => data[table].some((row) => row.trip_id !== manifest.fixtureId))) {
    throw new Error(`遠端 fixture ${manifest.fixtureId} 含有其他行程資料。`);
  }
  if (data.checklists.some((row) => row.scope !== "shared")) throw new Error(`遠端 fixture ${manifest.fixtureId} 不允許私人 checklist。`);
  const checklistIds = new Set(data.checklists.map((row) => row.id));
  if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) throw new Error(`遠端 fixture ${manifest.fixtureId} checklist 關聯無效。`);
  for (const table of ["expenses", "exchange_purchases", "other_info_items"]) {
    const keys = data[table].map((row) => row.client_item_id).filter((value) => value !== null && value !== undefined);
    if (new Set(keys).size !== keys.length) throw new Error(`遠端 fixture ${manifest.fixtureId} 的 ${table} 有重複 client_item_id。`);
  }
  detectSensitive(data);
  return { manifest, data };
}
async function fetchCurrentData(fixtureId) {
  const id = quote(fixtureId);
  const sql = `select json_build_object(
    'trips', coalesce((select json_agg(to_jsonb(t)) from (select id,title,departure_date,participants,currency_config,sidebar_config,content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
    'checklists', coalesce((select json_agg(to_jsonb(c)) from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
    'checklist_items', coalesce((select json_agg(to_jsonb(i)) from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
    'expenses', coalesce((select json_agg(to_jsonb(e)) from (select trip_id,title,amount,payer,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
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
async function downloadOne(entry, state) {
  const directory = path.join(fixturesRoot, entry.name);
  const { manifest, data } = await readRemoteBaseline(directory);
  const localApplied = state.fixtures[entry.name];
  const localBaseline = localApplied
    ? await findAppliedBaseline(entry.name, localApplied)
    : null;
  const direction = classifyBaselineSync(
    localBaseline ? { baselineAt: localBaseline.baselineAt, checksum: localBaseline.checksum } : null,
    { baselineAt: manifest.baselineAt, checksum: manifest.checksum },
  );
  if (localApplied && localBaseline && (localApplied.version !== localBaseline.version || localApplied.checksum !== localBaseline.checksum)) {
    throw new Error(`Fixture ${entry.name} 本機 applied state 與查得基準不一致；拒絕下載。`);
  }
  if (localBaseline && localBaseline.version !== manifest.version &&
      (manifest.parentVersion !== localBaseline.version || manifest.parentChecksum !== localBaseline.checksum)) {
    throw new Error(`Fixture ${entry.name} 版本因果鏈不相符；時間較新也不得跳過 parent 保護。`);
  }
  const actual = await fetchCurrentData(entry.name);
  const databaseIsCurrent = sameFixtureRows(actual, data, { ignoreTimestamps: true });
  if (!localBaseline) {
    const policy = classifyInitialDownload({
      hasAppliedBaseline: false,
      databaseMatchesCurrent: databaseIsCurrent,
      localDatabaseEmpty: !actual.trips.length && tables.every((table) => actual[table].length === 0),
    });
    if (policy.action !== "adopt-current-baseline") {
      throw new Error(`Fixture ${entry.name} 缺少本機 applied baseline，初次接手判斷為 ${policy.action}；拒絕猜測或覆寫未知資料。`);
    }
    state.fixtures[entry.name] = { version: manifest.version, checksum: manifest.checksum, baselineAt: manifest.baselineAt };
    return { fixtureId: entry.name, result: "baseline-adopted" };
  }
  if (direction.action === "unchanged") {
    if (!databaseIsCurrent) throw new Error(`Fixture ${entry.name} 已記錄為相同基準，但本機資料不同；停止採認。`);
    state.fixtures[entry.name] = { version: manifest.version, checksum: manifest.checksum, baselineAt: manifest.baselineAt };
    return { fixtureId: entry.name, result: "unchanged" };
  }
  if (direction.action === "upload") return { fixtureId: entry.name, result: "local-is-newer", skipped: true };
  if (direction.action === "conflict") throw new Error(`Fixture ${entry.name} 同一基準時間但 checksum 不同；停止。`);

  let parentData = null;
  if (manifest.parentVersion) {
    if (!localBaseline || manifest.parentVersion !== localBaseline.version || manifest.parentChecksum !== localBaseline.checksum) {
      throw new Error(`Fixture ${entry.name} 缺少可證明的本機 parent version/checksum；拒絕依時間直接覆蓋。`);
    }
    const parent = await findParentFixtureData(manifest);
    parentData = parent.data;
    if (!sameFixtureRows(actual, parentData, { ignoreTimestamps: true })) throw new Error(`Fixture ${entry.name} 本機資料不等於已知 parent，可能有獨立修改；拒絕覆蓋。`);
  } else if (actual.trips.length || tables.some((table) => actual[table].length)) {
    throw new Error(`Fixture ${entry.name} 首次下載的本機目標不是空白；拒絕覆蓋。`);
  }

  await applyFixtureImport([{ manifest, data, previousData: parentData }], {
    runCli: (args) => runCli(args),
  });
  state.fixtures[entry.name] = {
    version: manifest.version,
    checksum: manifest.checksum,
    baselineAt: manifest.baselineAt,
  };
  return { fixtureId: entry.name, result: "downloaded", baselineAt: manifest.baselineAt };
}
async function findAppliedBaseline(fixtureId, applied) {
  if (applied.baselineAt && Number.isFinite(Date.parse(applied.baselineAt)) && /^[a-f0-9]{64}$/.test(applied.checksum)) {
    return { ...applied, baselineAt: new Date(applied.baselineAt).toISOString() };
  }
  const commits = runGit(["log", "--format=%H", "--", `supabase/test-fixtures/${fixtureId}/manifest.json`]).split(/\r?\n/).filter(Boolean);
  for (const commit of commits) {
    try {
      const manifest = JSON.parse(runGit(["show", `${commit}:supabase/test-fixtures/${fixtureId}/manifest.json`]));
      if (manifest.version !== applied.version || manifest.checksum !== applied.checksum) continue;
      const baselineAt = manifest.baselineAt ?? manifest.exportedAt;
      if (!Number.isFinite(Date.parse(baselineAt))) break;
      return { version: manifest.version, checksum: manifest.checksum, baselineAt: new Date(baselineAt).toISOString() };
    } catch { /* continue */ }
  }
  throw new Error(`Fixture ${fixtureId} 找不到本機 applied version/checksum 對應的歷史基準時間；拒絕猜測方向。`);
}
async function findParentFixtureData(manifest) {
  const commits = runGit(["log", "--format=%H", "--", `supabase/test-fixtures/${manifest.fixtureId}/manifest.json`]).split(/\r?\n/).filter(Boolean);
  for (const commit of commits) {
    try {
      const parentManifest = JSON.parse(runGit(["show", `${commit}:supabase/test-fixtures/${manifest.fixtureId}/manifest.json`]));
      if (parentManifest.version !== manifest.parentVersion || parentManifest.checksum !== manifest.parentChecksum) continue;
      const data = JSON.parse(runGit(["show", `${commit}:supabase/test-fixtures/${manifest.fixtureId}/data.json`]));
      return { manifest: parentManifest, data };
    } catch { /* continue */ }
  }
  throw new Error(`Fixture ${manifest.fixtureId} 找不到 checksum 相符的 parent 歷史版本。`);
}
async function main() {
  if (process.platform !== "win32") throw new Error("此下載入口目前只支援專案 Windows 節點。");
  if (runGit(["branch", "--show-current"]) !== "develop") throw new Error("下載只允許在 develop 分支。");
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream !== "origin/develop") throw new Error("develop upstream 必須是 origin/develop。");
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error("下載前 Git 工作樹必須乾淨；請先保存／提交其他變更。");
  assertLocalOnly();

  const state = await loadState();
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const results = [];
  for (const entry of entries.filter((item)=>item.isDirectory() && tripPattern.test(item.name))) {
    results.push(await downloadOne(entry, state));
  }
  if (results.some((item)=>item.result === "downloaded" || item.result === "unchanged")) await saveState(state);
  console.log(JSON.stringify({ downloaded: results.some((item)=>item.result==="downloaded"), database: "local loopback only", results }, null, 2));
}
main().catch((error)=>{ console.error(`[testdata-download] 停止：${error.message}`); process.exitCode=1; });
