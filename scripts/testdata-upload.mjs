import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { normalizeFixtureRows } from "./lib/testdata-download-apply.mjs";
import { EXCEL_RPC_DATASET_ID, planExcelRpcDatasetUpload, validateExcelRpcDataset } from "./lib/excel-rpc-test-dataset.mjs";

process.env.SUPABASE_TELEMETRY_DISABLED = "1";
const root = process.cwd();
const fixturesRoot = path.resolve(root, "supabase", "test-fixtures");
const localExcelCasesPath = path.resolve(root, "supabase", ".temp", "excel-rpc-test-cases.json");
const tables = ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"];
const fixtureMarker = "three-way-sync";

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

async function assertSafeFixtureUpdate(tripId, directory, incomingManifest) {
  const relativeDirectory = path.relative(root, directory);
  const status = runGit(["status", "--porcelain=v1", "--", relativeDirectory]);
  const records = status ? status.split(/\r?\n/).filter(Boolean) : [];
  if (records.length) {
    throw new Error(`fixture ${tripId} 在工作樹有未提交變更（${records.join(", ")}）；無法確認是他台交接或人工編輯，為避免覆蓋而停止。`);
  }
  const names = (await readdir(directory)).sort();
  if (names.length !== 2 || names[0] !== "data.json" || names[1] !== "manifest.json") {
    throw new Error(`fixture ${tripId} 目錄含額外檔案或暫存檔，為避免遺失而停止。`);
  }

  let committedManifest;
  try {
    committedManifest = JSON.parse(runGit(["show", `HEAD:${relativeDirectory.split(path.sep).join("/")}/manifest.json`]));
  } catch {
    throw new Error(`fixture ${tripId} 無法從目前 Git HEAD 讀取已提交 manifest；拒絕覆寫。`);
  }
  if (JSON.stringify(committedManifest) !== JSON.stringify(incomingManifest)) {
    throw new Error(`fixture ${tripId} 的工作檔與 Git HEAD manifest 不一致；拒絕採用來源不明內容。`);
  }
  return true;
}

async function query(sql) {
  const file = path.join(os.tmpdir(), `tc-test-upload-${process.pid}-${Date.now()}.sql`);
  try {
    await writeFile(file, sql, { flag: "wx" });
    const output = runCli(["db", "query", "--local", "--output-format", "json", "--file", file]);
    const start = output.indexOf("[");
    const end = output.lastIndexOf("]");
    if (start < 0 || end < start) throw new Error("本機 Supabase SQL 未回傳預期 JSON。");
    const rows = JSON.parse(output.slice(start, end + 1));
    if (!Array.isArray(rows)) throw new Error("本機 Supabase SQL 回傳格式不符。");
    return rows.map((row) => Object.hasOwn(row, "payload") ? row.payload : row);
  } finally { await rm(file, { force: true }); }
}
function queryNormalize(data) {
  const normalized = normalizeFixtureRows(data);
  for (const trip of normalized.trips) {
    trip.content = { ...(trip.content ?? {}), testPurpose: fixtureMarker };
  }
  return normalized;
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
  if (typeof value === "string" && (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/.test(value))) {
    throw new Error(`Fixture 疑似含個資或憑證：${location}`);
  }
}
function validateData(data, fixtureId) {
  if (!fixtureId || !Array.isArray(data.trips) || data.trips.length !== 1 ||
      data.trips[0].id !== fixtureId || data.trips[0].content?.testPurpose !== fixtureMarker) {
    throw new Error("每個 fixture 必須只包含一筆明確標記的非公開測試 TRIP。");
  }
  if (data.trips[0].is_public === true) throw new Error("測試行程不允許公開。");
  if (Object.hasOwn(data.trips[0], "participants")) {
    throw new Error("匯出快照不得包含參與者欄位。");
  }
  for (const key of ["participants", "participantEmailMap", "checklistData", "participantMap", "participantEmailMaps"]) {
    if (data.trips[0].content && Object.hasOwn(data.trips[0].content, key)) {
      throw new Error(`匯出快照仍包含行程內嵌帳號／參與者資料：content.${key}`);
    }
  }
  for (const table of tables) if (!Array.isArray(data[table])) throw new Error(`Fixture 缺少資料表：${table}`);
  const serialized = JSON.stringify(data);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized) ||
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/.test(serialized)) {
    throw new Error("Fixture 疑似含電子郵件或 token；禁止上傳。");
  }
  if (["checklists", "expenses", "exchange_purchases", "other_info_items"].some((table) => data[table].some((row) => row.trip_id !== fixtureId))) {
    throw new Error("Fixture 含有其他行程資料，禁止上傳。");
  }
  if (data.trips[0].is_public === true) throw new Error("Fixture 不允許公開行程。");
  if (data.checklists.some((row) => row.scope !== "shared" || row.trip_id !== fixtureId)) throw new Error("Fixture 不允許私人或跨行程 checklist。");
  const checklistIds = new Set(data.checklists.map((row) => row.id));
  if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) throw new Error("Fixture checklist 關聯無效。");
  for (const table of ["checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"]) {
    const ids = data[table].map((row) => row.id).filter((value) => value !== null && value !== undefined);
    if (new Set(ids).size !== ids.length) throw new Error(`Fixture ${table} 存在重複 id。`);
  }
  if (data.checklist_items.some((row) => {
    const parent = data.checklists.find((checklist) => checklist.id === row.checklist_id);
    return !parent || parent.trip_id !== fixtureId || parent.scope !== "shared";
  })) throw new Error("Fixture checklist item 超出共享測試行程範圍。");
  for (const table of ["expenses", "exchange_purchases", "other_info_items"]) {
    const keys = data[table].map((row) => row.client_item_id).filter((value) => value !== null && value !== undefined);
    if (new Set(keys).size !== keys.length) throw new Error(`Fixture ${table} 存在重複 client_item_id。`);
  }
  detectSensitive(data);
}
async function readBaseline(directory) {
  const raw = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  if (!raw || raw.schemaVersion !== 1 || raw.fixtureId !== path.basename(directory) ||
      !["active", "regression_pending", "released", "archived", "deleted"].includes(raw.status) ||
      !Array.isArray(raw.tables) || raw.tables.length !== tables.length || tables.some((table) => !raw.tables.includes(table))) {
    throw new Error(`Fixture manifest 結構無效：${path.basename(directory)}`);
  }
  for (const table of tables) if (!Array.isArray(data[table]) || (raw.counts && raw.counts[table] !== undefined && raw.counts[table] !== data[table].length)) {
    throw new Error(`Fixture ${raw.fixtureId} ${table} 結構或筆數不符。`);
  }
  validateData(data, raw.fixtureId);
  return { raw, data };
}
async function markTripForSync(tripId) {
  if (typeof tripId !== "string" || !tripId.trim()) throw new Error("行程識別碼不可空白。");
  assertLocalOnly();
  const trip = await query(`select id,is_public from public.trips where id=${quote(tripId)} limit 1`);
  if (!trip.length) throw new Error("找不到指定的本機行程。");
  if (trip[0].is_public === true) throw new Error("公開行程不可標記為同步測試資料。");
  const updated = await query(`update public.trips set content = coalesce(content, '{}'::jsonb) || jsonb_build_object('testPurpose', '${fixtureMarker}'), updated_at=now() where id=${quote(tripId)} returning id, content->>'testPurpose' as test_purpose`);
  console.log(JSON.stringify({ marked: true, tripId: updated[0].id, purpose: updated[0].test_purpose }, null, 2));
}

async function main() {
  if (process.platform !== "win32") throw new Error("此上傳入口目前只支援專案 Windows 節點。");
  const hostname = process.env.COMPUTERNAME;
  if (!hostname) throw new Error("無法識別目前節點主機名稱。");
  const markIndex = process.argv.indexOf("mark");
  if (markIndex >= 0) {
    const tripId = process.argv[markIndex + 1];
    if (!tripId) throw new Error("用法：node scripts/testdata-upload.mjs mark <trip-id>");
    await markTripForSync(tripId);
    return;
  }
  const previewOnly = process.argv.includes("--preview");
  if (!previewOnly) {
    if (runGit(["branch", "--show-current"]) !== "develop") throw new Error("上傳只允許在 develop 分支。");
    const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream !== "origin/develop") throw new Error("develop upstream 必須是 origin/develop。");
    runGit(["fetch", "--quiet", "origin", "develop"]);
    const initialStatus = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (initialStatus) throw new Error("上傳前工作樹必須乾淨；請先保存本次程式／文件修改。");
    const counts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"]).split(/\s+/).map(Number);
    if (counts[0] !== 0 || counts[1] !== 0) throw new Error("本機與 origin/develop 不一致；拒絕自動合併或覆寫。");
  }

  assertLocalOnly();
  const published = [];
  const pendingWrites = [];
  const datasetDirectory = path.join(fixturesRoot, EXCEL_RPC_DATASET_ID);
  const datasetManifestPath = path.join(datasetDirectory, "manifest.json");
  const datasetCasesPath = path.join(datasetDirectory, "cases.json");
  let excelRpcReport = { fixtureId: EXCEL_RPC_DATASET_ID, result: "unchanged" };
  try {
    const datasetManifest = JSON.parse(await readFile(datasetManifestPath, "utf8"));
    const baselineCases = JSON.parse(await readFile(datasetCasesPath, "utf8")).cases;
    const datasetLocalCaseText = await readFile(localExcelCasesPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return JSON.stringify({ cases: baselineCases });
      throw error;
    });
    const datasetCases = JSON.parse(datasetLocalCaseText).cases;
    validateExcelRpcDataset({
      manifest: datasetManifest,
      cases: baselineCases,
      directoryName: EXCEL_RPC_DATASET_ID,
      verifyManifestDigest: false,
    });
    const datasetPlan = planExcelRpcDatasetUpload({
      manifest: datasetManifest,
      cases: datasetCases,
      baselineCases,
      sourceHost: hostname,
      baselineAt: new Date().toISOString(),
    });
    if (datasetPlan.action === "publish") {
      pendingWrites.push({
        directory: datasetDirectory,
        kind: "excel-rpc-dataset",
        cases: datasetPlan.cases,
        manifest: datasetPlan.manifest,
      });
      published.push({ fixtureId: EXCEL_RPC_DATASET_ID, kind: "excel-rpc-dataset", version: datasetPlan.manifest.version });
      excelRpcReport = { fixtureId: EXCEL_RPC_DATASET_ID, result: "updated" };
    }
  } catch (error) {
    excelRpcReport = { fixtureId: EXCEL_RPC_DATASET_ID, result: "error", error: error.message };
  }
  const candidateIds = await query("select id from public.trips where is_public = false and coalesce(content->>'testPurpose', '') = 'three-way-sync' order by id");
  const fixtureReports = [];
  for (const candidate of candidateIds) {
    const fixtureId = candidate.id;
    if (typeof fixtureId !== "string" || !fixtureId.trim() || fixtureId === EXCEL_RPC_DATASET_ID) {
      throw new Error("測試行程缺少有效 ID，停止匯出。");
    }
    const directory = path.join(fixturesRoot, fixtureId);
    let previous = null;
    let previousData = null;
    try {
      ({ raw: previous, data: previousData } = await readBaseline(directory));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (previous && !["active", "regression_pending"].includes(previous.status)) continue;
    const id = quote(fixtureId);
    const sql = `select json_build_object(
      'trips', coalesce((select json_agg(to_jsonb(t)) from (select id,title,departure_date,currency_config,sidebar_config,(content - 'participants' - 'participantEmailMap' - 'checklistData' - 'participantMap' - 'participantEmailMaps') || jsonb_build_object('testPurpose', '${fixtureMarker}') as content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
      'checklists', coalesce((select json_agg(to_jsonb(c) - 'created_by' - 'owner_user_id') from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
      'checklist_items', coalesce((select json_agg(to_jsonb(i) - 'created_by') from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
      'expenses', coalesce((select json_agg(to_jsonb(e) - 'id' - 'owner_user_id' - 'recorded_by_email' - 'payer' - 'attachment_path' - 'attachment_bucket' - 'attachment_name' - 'attachment_mime' - 'attachment_size' - 'attachment_status' - 'attachment_uploaded_at' - 'attachment_uploaded_by' - 'attachment_last_error') from (select trip_id,title,amount,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
      'exchange_purchases', coalesce((select json_agg(to_jsonb(e) - 'created_by') from (select id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at from public.exchange_purchases where trip_id=${id}) e),'[]'::json),
      'other_info_items', coalesce((select json_agg(to_jsonb(o) - 'created_by') from (select id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at from public.other_info_items where trip_id=${id}) o),'[]'::json)
    ) as payload`;
    const queryRows = await query(sql);
    if (queryRows.length !== 1) throw new Error(`測試行程 ${fixtureId} 的資料查詢筆數不符，停止匯出。`);
    const rawData = queryNormalize(queryRows[0]);
    const excluded = {
      participants: 1,
      embeddedChecklistData: 0,
      emailMaps: 0,
      userAccounts: 0,
      expensePayers: 0,
    };
    const data = queryNormalize(rawData);
    validateData(data, fixtureId);
    const sameContent = previous && JSON.stringify(queryNormalize(data)) === JSON.stringify(queryNormalize(previousData));
    fixtureReports.push({ fixtureId, result: sameContent ? "unchanged" : previous ? "updated" : "created", excluded });
    if (sameContent) continue;
    await mkdir(directory, { recursive: true });
    if (previous && !await assertSafeFixtureUpdate(fixtureId, directory, previous)) {
      throw new Error(`fixture ${fixtureId} 有未經版本化的本機檔案變更，拒絕覆寫。`);
    }
    const baselineAt = new Date().toISOString();
    const manifest = {
      schemaVersion: 1, fixtureId,
      status: previous?.status ?? "active", sourceHost: hostname, baselineAt,
      exportedAt: baselineAt, tables,
      counts: Object.fromEntries(tables.map((table) => [table, data[table].length])),
      note: "Synthetic test data only. User accounts and all participant data are excluded. Synchronization is decided by canonical content comparison.",
    };
    pendingWrites.push({ directory, kind: "fixture", data, manifest });
    published.push({ fixtureId, kind: "fixture" });
  }
  if (process.argv.includes("--preview")) {
    console.log(JSON.stringify({
      preview: true,
      wouldPublish: published,
      fixtures: fixtureReports,
      excelRpc: excelRpcReport,
      note: "僅產生白名單快照預覽；未寫入 fixture 檔、未 commit/push、未修改本機資料庫。",
    }, null, 2));
    return;
  }
  if (!published.length) {
    console.log(JSON.stringify({
      uploaded: false,
      reason: "unchanged",
      message: "TRIP fixtures 與 Excel RPC 案例集均無內容變更，未建立 commit。",
      fixtures: fixtureReports,
      excelRpc: excelRpcReport,
    }, null, 2));
    return;
  }
  const tempFiles = [];
  const replacements = [];
  try {
    for (const item of pendingWrites) {
      const dataPath = item.kind === "excel-rpc-dataset" ? path.join(item.directory, "cases.json") : path.join(item.directory, "data.json");
      const manifestPath = path.join(item.directory, "manifest.json");
      const suffix = `.tmp-${process.pid}-${Date.now()}`;
      const tempData = dataPath + suffix;
      const tempManifest = manifestPath + suffix;
      const dataContent = item.kind === "excel-rpc-dataset" ? { cases: item.cases } : item.data;
      const manifestText = JSON.stringify(item.manifest, null, 2) + "\n";
      const dataText = JSON.stringify(dataContent, null, 2) + "\n";
      await writeFile(tempData, dataText, { flag: "wx" });
      await writeFile(tempManifest, manifestText, { flag: "wx" });
      tempFiles.push({ tempData, tempManifest });
      const readPrevious = async (filePath) => readFile(filePath, "utf8").catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      replacements.push({
        item,
        tempData,
        dataPath,
        tempManifest,
        manifestPath,
        oldData: await readPrevious(dataPath),
        oldManifest: await readPrevious(manifestPath),
      });
    }
    for (const file of replacements) {
      await rename(file.tempData, file.dataPath);
      await rename(file.tempManifest, file.manifestPath);
    }
  } catch (error) {
    for (const file of replacements) {
      if (file.oldData !== undefined) await writeFile(file.dataPath, file.oldData);
      if (file.oldManifest !== undefined) await writeFile(file.manifestPath, file.oldManifest);
    }
    throw error;
  } finally {
    for (const file of tempFiles) {
      await rm(file.tempData, { force: true });
      await rm(file.tempManifest, { force: true });
    }
  }
  const paths = published.flatMap((item) => {
    const base = `supabase/test-fixtures/${item.fixtureId}`;
    return item.kind === "excel-rpc-dataset"
      ? [`${base}/manifest.json`, `${base}/cases.json`]
      : [`${base}/manifest.json`, `${base}/data.json`];
  });
  for (const item of published) {
    const directory = path.join(fixturesRoot, item.fixtureId);
    if (item.kind === "excel-rpc-dataset") {
      const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      const cases = JSON.parse(await readFile(path.join(directory, "cases.json"), "utf8")).cases;
      const verified = validateExcelRpcDataset({ manifest, cases, directoryName: EXCEL_RPC_DATASET_ID });
      if (!Array.isArray(verified.cases) || verified.cases.length === 0) throw new Error("Excel RPC dataset 檔案結構重驗失敗。");
    } else {
      const { raw, data } = await readBaseline(directory);
      validateData(data, raw.fixtureId);
    }
  }
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
  console.log(JSON.stringify({
    uploaded: true,
    committed: true,
    pushed: true,
    fixtures: published,
    fixtureReports,
    excelRpc: excelRpcReport,
    next: "其他節點先 git pull --ff-only origin develop，再獨立執行 testdata-download.mjs。",
  }, null, 2));
}
main().catch((error) => { console.error(`[testdata-upload] 停止：${error.message}`); process.exitCode = 1; });
