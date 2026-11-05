import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { classifyBaselineSync, createBaselineRecord } from "./lib/testdata-clock-sync.mjs";
import { normalizeFixtureRows, checksumFixture } from "./lib/testdata-download-apply.mjs";
import { EXCEL_RPC_DATASET_ID, checksumExcelRpcDataset, planExcelRpcDatasetUpload, validateExcelRpcDataset } from "./lib/excel-rpc-test-dataset.mjs";

process.env.SUPABASE_TELEMETRY_DISABLED = "1";
const root = process.cwd();
const fixturesRoot = path.resolve(root, "supabase", "test-fixtures");
const appliedPath = path.resolve(root, "supabase", ".temp", "testdata-applied-state.json");
const localExcelCasesPath = path.resolve(root, "supabase", ".temp", "excel-rpc-test-cases.json");
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
  if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("安全停止：只允許公司／家用等節點的本機 loopback Supabase。");
}
function quote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
async function query(sql) {
  const file = path.join(os.tmpdir(), `tc-test-upload-${process.pid}-${Date.now()}.sql`);
  try {
    await writeFile(file, sql, { flag: "wx" });
    const output = runCli(["db", "query", "--local", "--output-format", "json", "--file", file]);
    const start = output.indexOf("[");
    const rows = JSON.parse(output.slice(start, output.lastIndexOf("]") + 1));
    return rows[0].payload;
  } finally { await rm(file, { force: true }); }
}
function checksum(data) { return checksumFixture(data); }
function queryNormalize(data) { return normalizeFixtureRows(data); }
async function writeFixturePair(directory, data, manifest) {
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const dataPath = path.join(directory, "data.json");
  const manifestPath = path.join(directory, "manifest.json");
  const tempData = dataPath + suffix;
  const tempManifest = manifestPath + suffix;
  try {
    await writeFile(tempData, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    await writeFile(tempManifest, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    await rename(tempData, dataPath);
    await rename(tempManifest, manifestPath);
  } finally {
    await rm(tempData, { force: true });
    await rm(tempManifest, { force: true });
  }
}
function detectSensitive(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => detectSensitive(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/email|phone|password|token|secret|api.?key|attachment|uploaded_by|owner_user_id|created_by/i.test(key) &&
          item !== null && item !== "" && item !== false) throw new Error(`Fixture 含敏感欄位：${location}.${key}`);
      detectSensitive(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(value) ||
      /\\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,})\\b/.test(value))) {
    throw new Error(`Fixture 疑似含個資或憑證：${location}`);
  }
}
function validateData(data, fixtureId) {
  if (!tripPattern.test(fixtureId) || data.trips?.length !== 1 || data.trips[0].id !== fixtureId ||
      data.trips[0].content?.__testFixture !== true || !Array.isArray(data.trips[0].participants) ||
      data.trips[0].participants.length !== 0) throw new Error("只允許明確標記的單筆 tc-test 合成行程，且 participants 必須為空。");
  for (const table of tables) if (!Array.isArray(data[table])) throw new Error(`Fixture 缺少資料表：${table}`);
  const serialized = JSON.stringify(data);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized) ||
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/.test(serialized)) {
    throw new Error("Fixture 疑似含電子郵件或 token；禁止上傳。");
  }
  if (["checklists", "expenses", "exchange_purchases", "other_info_items"].some((table) => data[table].some((row) => row.trip_id !== fixtureId))) {
    throw new Error("Fixture 含有其他行程資料，禁止上傳。");
  }
  if (data.checklists.some((row) => row.scope !== "shared")) throw new Error("Fixture 不允許私人 checklist。");
  const checklistIds = new Set(data.checklists.map((row) => row.id));
  if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) throw new Error("Fixture checklist 關聯無效。");
  for (const table of ["expenses", "exchange_purchases", "other_info_items"]) {
    const keys = data[table].map((row) => row.client_item_id).filter((value) => value !== null && value !== undefined);
    if (new Set(keys).size !== keys.length) throw new Error(`Fixture ${table} 存在重複 client_item_id。`);
  }
  detectSensitive(data);
}
async function loadApplied() {
  try {
    const state = JSON.parse(await readFile(appliedPath, "utf8"));
    if (state.schemaVersion !== 1 || !state.fixtures || typeof state.fixtures !== "object") {
      throw new Error("本機 applied state 格式不符；拒絕上傳。");
    }
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, fixtures: {} };
    throw error;
  }
}
async function saveApplied(state) {
  await mkdir(path.dirname(appliedPath), { recursive: true });
  const temp = appliedPath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    await rename(temp, appliedPath);
  } finally {
    await rm(temp, { force: true });
  }
}
async function findAppliedBaseline(fixtureId, appliedRecord, manifestPathOverride = null) {
  if (appliedRecord.baselineAt && Number.isFinite(Date.parse(appliedRecord.baselineAt))) {
    return new Date(appliedRecord.baselineAt).toISOString();
  }
  const manifestPath = manifestPathOverride ?? `supabase/test-fixtures/${fixtureId}/manifest.json`;
  const commits = runGit(["log", "--format=%H", "--", manifestPath]).split(/\r?\n/).filter(Boolean);
  for (const commit of commits) {
    try {
      const manifest = JSON.parse(runGit(["show", `${commit}:${manifestPath}`]));
      if (manifest.version !== appliedRecord.version || manifest.checksum !== appliedRecord.checksum) continue;
      const baselineAt = manifest.baselineAt ?? manifest.exportedAt;
      if (!Number.isFinite(Date.parse(baselineAt))) break;
      return new Date(baselineAt).toISOString();
    } catch { /* continue searching exact applied revision */ }
  }
  throw new Error(`Fixture ${fixtureId} 找不到 applied version/checksum 對應時間；拒絕猜測上傳方向。`);
}
async function readBaseline(directory) {
  const raw = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  const baselineAt = raw.baselineAt ?? raw.exportedAt;
  if (raw.schemaVersion !== 1 || raw.fixtureId !== path.basename(directory) ||
      !Number.isInteger(raw.version) || raw.version < 1 ||
      typeof raw.sourceHost !== "string" || !raw.sourceHost.trim() ||
      !["active", "regression_pending", "released", "archived", "deleted"].includes(raw.status) ||
      !Array.isArray(raw.tables) || raw.tables.length !== tables.length || tables.some((table) => !raw.tables.includes(table)) ||
      !Number.isFinite(Date.parse(baselineAt)) || !/^[a-f0-9]{64}$/.test(raw.checksum) || checksum(data) !== raw.checksum) {
    throw new Error(`Fixture 基準 manifest/checksum 不一致：${path.basename(directory)}`);
  }
  if ((raw.version === 1 && (raw.parentVersion !== undefined || raw.parentChecksum !== undefined)) ||
      (raw.version > 1 && (raw.parentVersion !== raw.version - 1 || !/^[a-f0-9]{64}$/.test(raw.parentChecksum ?? "")))) {
    throw new Error(`Fixture ${raw.fixtureId} parent version 格式無效。`);
  }
  for (const table of tables) if (!Array.isArray(data[table]) || raw.counts?.[table] !== data[table].length) {
    throw new Error(`Fixture ${raw.fixtureId} ${table} 筆數與 manifest 不一致。`);
  }
  raw.baselineAt = new Date(baselineAt).toISOString();
  validateData(data, raw.fixtureId);
  return { raw, data };
}
async function main() {
  if (process.platform !== "win32") throw new Error("此上傳入口目前只支援專案 Windows 節點。");
  const hostname = process.env.COMPUTERNAME;
  if (!hostname) throw new Error("無法識別目前節點主機名稱。");
  if (runGit(["branch", "--show-current"]) !== "develop") throw new Error("上傳只允許在 develop 分支。");
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream !== "origin/develop") throw new Error("develop upstream 必須是 origin/develop。");
  runGit(["fetch", "--quiet", "origin", "develop"]);
  const initialStatus = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (initialStatus) throw new Error("上傳前工作樹必須乾淨；請先保存本次程式／文件修改。");
  const counts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"]).split(/\s+/).map(Number);
  if (counts[0] !== 0 || counts[1] !== 0) throw new Error("本機與 origin/develop 不一致；拒絕自動合併或覆寫。");

  assertLocalOnly();
  const appliedState = await loadApplied();
  const applied = appliedState.fixtures;
  const dirs = (await readdir(fixturesRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && tripPattern.test(entry.name));
  const published = [];
  const datasetDirectory = path.join(fixturesRoot, EXCEL_RPC_DATASET_ID);
  const datasetManifestPath = path.join(datasetDirectory, "manifest.json");
  const datasetCasesPath = path.join(datasetDirectory, "cases.json");
  const datasetLocalCaseText = await readFile(localExcelCasesPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return readFile(datasetCasesPath, "utf8");
    throw error;
  });
  const datasetManifest = JSON.parse(await readFile(datasetManifestPath, "utf8"));
  const datasetCases = JSON.parse(datasetLocalCaseText).cases;
  const validatedDataset = validateExcelRpcDataset({
    manifest: datasetManifest,
    cases: datasetCases,
    directoryName: EXCEL_RPC_DATASET_ID,
    verifyManifestDigest: false,
  });
  const datasetAppliedKey = `dataset:${EXCEL_RPC_DATASET_ID}`;
  const datasetApplied = applied[datasetAppliedKey];
  const datasetPlan = planExcelRpcDatasetUpload({
    manifest: datasetManifest,
    cases: validatedDataset.cases,
    applied: datasetApplied,
    sourceHost: hostname,
    baselineAt: new Date().toISOString(),
  });
  applied[datasetAppliedKey] = datasetPlan.applied;
  if (datasetPlan.action === "publish") {
    const tempCases = datasetCasesPath + `.tmp-${process.pid}-${Date.now()}`;
    const tempManifest = datasetManifestPath + `.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(tempCases, JSON.stringify({ cases: datasetPlan.cases }, null, 2) + "\n", { flag: "wx" });
      await writeFile(tempManifest, JSON.stringify(datasetPlan.manifest, null, 2) + "\n", { flag: "wx" });
      await rename(tempCases, datasetCasesPath);
      await rename(tempManifest, datasetManifestPath);
    } finally {
      await rm(tempCases, { force: true });
      await rm(tempManifest, { force: true });
    }
    published.push({
      fixtureId: EXCEL_RPC_DATASET_ID,
      kind: "excel-rpc-dataset",
      version: datasetPlan.manifest.version,
      baselineAt: datasetPlan.manifest.baselineAt,
      checksum: datasetPlan.manifest.checksum,
    });
  }
  for (const entry of dirs) {
    const directory = path.join(fixturesRoot, entry.name);
    const { raw: previous } = await readBaseline(directory);
    if (!["active", "regression_pending"].includes(previous.status)) continue;
    const id = quote(entry.name);
    const sql = `select json_build_object(
      'trips', coalesce((select json_agg(to_jsonb(t) - 'created_by') from (select id,title,departure_date,participants,currency_config,sidebar_config,content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
      'checklists', coalesce((select json_agg(to_jsonb(c) - 'created_by' - 'owner_user_id') from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
      'checklist_items', coalesce((select json_agg(to_jsonb(i) - 'created_by') from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
      'expenses', coalesce((select json_agg(to_jsonb(e) - 'id' - 'owner_user_id' - 'recorded_by_email' - 'attachment_path' - 'attachment_bucket' - 'attachment_name' - 'attachment_mime' - 'attachment_size' - 'attachment_status' - 'attachment_uploaded_at' - 'attachment_uploaded_by' - 'attachment_last_error') from (select trip_id,title,amount,payer,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
      'exchange_purchases', coalesce((select json_agg(to_jsonb(e) - 'created_by') from (select id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at from public.exchange_purchases where trip_id=${id}) e),'[]'::json),
      'other_info_items', coalesce((select json_agg(to_jsonb(o) - 'created_by') from (select id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at from public.other_info_items where trip_id=${id}) o),'[]'::json)
    ) as payload`;
    const data = queryNormalize(await query(sql));
    validateData(data, entry.name);
    const next = createBaselineRecord({ fixtureId: entry.name, data, sourceHost: hostname });
    const appliedRecord = applied[entry.name];
    if (!appliedRecord || appliedRecord.checksum !== previous.checksum || appliedRecord.version !== previous.version) {
      throw new Error(`Fixture ${entry.name} 本機 applied baseline 與已提交基準不一致；拒絕上傳。`);
    }
    const appliedBaselineAt = await findAppliedBaseline(entry.name, appliedRecord);
    if (next.checksum === previous.checksum) continue;
    const decision = classifyBaselineSync(
      { baselineAt: appliedBaselineAt, checksum: appliedRecord.checksum },
      { baselineAt: next.baselineAt, checksum: next.checksum },
    );
    if (decision.action !== "upload") throw new Error(`Fixture ${entry.name} 上傳時間判斷非 upload：${decision.action}`);
    const manifest = {
      schemaVersion: 1, fixtureId: entry.name, version: previous.version + 1,
      parentVersion: previous.version, parentChecksum: previous.checksum,
      status: previous.status, sourceHost: hostname, baselineAt: next.baselineAt,
      exportedAt: next.baselineAt, tables,
      counts: Object.fromEntries(tables.map((table) => [table, data[table].length])),
      checksum: next.checksum,
      note: "Synthetic test data only. Timestamp selects peer direction; checksum and parent database checks protect imports.",
    };
    await writeFixturePair(directory, data, manifest);
    applied[entry.name] = {
      version: manifest.version,
      checksum: manifest.checksum,
      baselineAt: manifest.baselineAt,
    };
    published.push({ fixtureId: entry.name, version: manifest.version, baselineAt: manifest.baselineAt, checksum: manifest.checksum });
  }
  if (!published.length) {
    await saveApplied(appliedState);
    console.log(JSON.stringify({ uploaded: false, reason: "unchanged", message: "沒有測試資料內容變更；未更新時間戳、未建立 commit。" }, null, 2));
    return;
  }
  for (const item of published) {
    const directory = path.join(fixturesRoot, item.fixtureId);
    if (item.kind === "excel-rpc-dataset") {
      const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      const cases = JSON.parse(await readFile(path.join(directory, "cases.json"), "utf8")).cases;
      const verified = validateExcelRpcDataset({ manifest, cases, directoryName: EXCEL_RPC_DATASET_ID });
      if (verified.manifest.checksum !== item.checksum) throw new Error("Excel RPC dataset 上傳前 checksum 重驗失敗。");
    } else {
      const { raw, data } = await readBaseline(directory);
      if (raw.checksum !== item.checksum || checksum(data) !== item.checksum) throw new Error(`Fixture ${item.fixtureId} 上傳前 checksum 重驗失敗。`);
    }
  }
  const paths = published.flatMap((item) => {
    const base = `supabase/test-fixtures/${item.fixtureId}`;
    return item.kind === "excel-rpc-dataset"
      ? [`${base}/manifest.json`, `${base}/cases.json`]
      : [`${base}/manifest.json`, `${base}/data.json`];
  });
  for (const file of paths) runGit(["add", "--", file]);
  const staged = runGit(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
  if (staged.length !== paths.length || staged.some((file) => !paths.includes(file))) throw new Error("上傳 stage 超出 fixture 白名單；停止 commit/push。");
  runGit(["diff", "--cached", "--check"]);
  runGit(["commit", "-m", "上傳三方同步測試資料基準"]);
  const remaining = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (remaining) throw new Error("fixture commit 後工作樹不乾淨；停止 push。");
  const remoteCounts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"]).split(/\s+/).map(Number);
  if (remoteCounts[0] !== 1 || remoteCounts[1] !== 0) throw new Error("commit 後遠端已變更或分支差異異常；停止 push。");
  runGit(["push", "origin", "develop"]);
  await saveApplied(appliedState);
  console.log(JSON.stringify({ uploaded: true, committed: true, pushed: true, fixtures: published, next: "其他節點先 git pull --ff-only origin develop，再獨立執行 testdata-download.mjs。" }, null, 2));
}
main().catch((error) => { console.error(`[testdata-upload] 停止：${error.message}`); process.exitCode = 1; });
