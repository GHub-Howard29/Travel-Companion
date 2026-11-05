import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { createHash } from "node:crypto";
import { classifyFixtureRevision, classifyPeerHandoff } from "./lib/testdata-revision.mjs";
import { applyFixtureImport, normalizeFixtureRows, checksumFixture } from "./lib/testdata-download-apply.mjs";

// Test-data workflows are local-only and do not require Supabase CLI telemetry.
// Apply this before spawning any CLI child process, including standalone commands.
process.env.SUPABASE_TELEMETRY_DISABLED = "1";

const root = process.cwd();
const fixturesRoot = path.resolve(root, "supabase", "test-fixtures");
const handoffStatePath = path.resolve(root, "supabase", ".temp", "testdata-handoff-state.json");
const schemaVersion = 1;
const allowedTables = ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"];
const tripIdPattern = /^trip-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function runCli(args) {
  return execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["supabase", ...args],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024, shell: process.platform === "win32" },
  );
}

function runGit(args) {
  return execFileSync(
    process.platform === "win32" ? "git.exe" : "git",
    args,
    { encoding: "utf8", cwd: root, maxBuffer: 2 * 1024 * 1024, shell: process.platform === "win32" },
  ).trim();
}

function runGitRaw(args) {
  return execFileSync(
    process.platform === "win32" ? "git.exe" : "git",
    args,
    { encoding: "utf8", cwd: root, maxBuffer: 2 * 1024 * 1024, shell: process.platform === "win32" },
  );
}

function assertDevelopBranch() {
  const branch = runGit(["branch", "--show-current"]);
  if (branch !== "develop") throw new Error(`本流程只允許在 develop 執行；目前分支為「${branch}」。`);
}

function getHandoffGitStatus() {
  return runGitRaw(["status", "--porcelain=v1", "--untracked-files=all"])
    .split(/\r?\n/)
    .filter(Boolean);
}

async function assertHandoffGitState() {
  const branch = runGit(["branch", "--show-current"]);
  if (branch !== "develop") throw new Error(`安全停止：測試資料交接只允許在 develop；目前分支「${branch}」。`);
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream !== "origin/develop") throw new Error(`安全停止：develop upstream 必須是 origin/develop；目前是「${upstream}」。`);
  runGit(["fetch", "--quiet", "origin", "develop"]);
  const status = getHandoffGitStatus();
  if (status.some((line) => line[0] !== " " && line[0] !== "?")) {
    throw new Error("安全停止：發現既有 staged 變更；請先處理 index，避免被交接提交帶入。");
  }
  if (status.some((line) => line.includes("scripts/testdata-sync.mjs") || line.includes("scripts/lib/testdata-revision.mjs"))) {
    const validated = await validateActiveFixtures({ verifyGitHistory: false });
    console.log(JSON.stringify({ fixtureCompatibilityValidated: validated.length, fixtures: validated }, null, 2));
  }
  if (status.some((line) => line.includes("supabase/test-fixtures/"))) {
    // A prior handoff may already have exported the local synthetic DB into
    // fixture files. Accept only when every active fixture validates; retain
    // the captured status as the baseline so publish can stage only its
    // expected fixture paths and reject unrelated changes.
    const validated = await validateActiveFixtures({ verifyGitHistory: false });
    console.log(JSON.stringify({ preexistingFixtureChangesValidated: validated.length, fixtures: validated }, null, 2));
  }
  const counts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"]).split(/\s+/).map(Number);
  if (counts.length !== 2 || counts.some((value) => !Number.isFinite(value)) || counts[0] !== 0 || counts[1] !== 0) {
    throw new Error("安全停止：本機 develop 與 origin/develop 不一致；請先人工核對，不自動 pull、覆寫或 reset。");
  }
  return status;
}

function assertLocalOnly() {
  const output = runCli(["status", "-o", "json"]);
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("無法讀取 Supabase 狀態；停止操作。");
  const status = JSON.parse(output.slice(start, end + 1));
  const apiUrl = status.API_URL ?? status.api_url;
  if (!apiUrl || !["localhost", "127.0.0.1", "::1"].includes(new URL(apiUrl).hostname)) {
    throw new Error("安全停止：僅允許連線到本機 loopback Supabase。");
  }
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function detectSensitive(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => detectSensitive(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/email|phone|password|token|secret|api.?key|attachment|uploaded_by|owner_user_id|created_by/i.test(key)) {
        if (item !== null && item !== "" && item !== false) {
          throw new Error(`敏感欄位檢查未通過：${location}.${key}。請先移除或匿名化。`);
        }
      }
      detectSensitive(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
      throw new Error(`發現疑似電子郵件：${location}。請先匿名化。`);
    }
    if (/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/.test(value)) {
      throw new Error(`發現疑似 token／憑證：${location}。禁止匯出。`);
    }
  }
}

function normalizeData(data) {
  return normalizeFixtureRows(data);
}

function redactFixtureData(data) {
  const normalized = normalizeData(data);
  const excluded = {
    tripParticipants: data.trips?.reduce((sum, row) => sum + (Array.isArray(row.participants) ? row.participants.length : 0), 0) ?? 0,
    embeddedParticipantFields: data.trips?.reduce((sum, row) => sum + ["participants", "participantEmailMap", "checklistData", "participantMap", "participantEmailMaps"].filter((key) => Object.hasOwn(row.content ?? {}, key)).length, 0) ?? 0,
    expensePayers: data.expenses?.filter((row) => typeof row.payer === "string" && row.payer.trim()).length ?? 0,
  };
  for (const row of normalized.trips) {
    row.content = { ...(row.content ?? {}), testPurpose: "three-way-sync" };
    delete row.participants;
  }
  return { data: normalized, excluded };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function sameFixtureData(left, right) {
  return JSON.stringify(canonicalValue(normalizeData(left))) === JSON.stringify(canonicalValue(normalizeData(right)));
}

function sameFixtureBusinessData(left, right) {
  const withoutTimestamps = (data) => normalizeData(data);
  const strip = (rows) => rows.map(withoutDatabaseTimestamps).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return allowedTables.every((table) =>
    JSON.stringify(strip(withoutTimestamps(left)[table])) === JSON.stringify(strip(withoutTimestamps(right)[table])));
}

function checksumData(data) {
  return checksumFixture(data);
}

function parseCliJson(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Supabase SQL 沒有回傳預期 JSON。");
  const result = JSON.parse(output.slice(start, end + 1));
  if (!Array.isArray(result) || result.length !== 1 || !result[0].payload) {
    throw new Error("Supabase SQL 回傳格式不符預期。");
  }
  return result[0].payload;
}

async function queryLocalPayload(sql) {
  const sqlFile = path.join(os.tmpdir(), `travel-companion-testdata-${process.pid}-${Date.now()}.sql`);
  try {
    await writeFile(sqlFile, sql, { flag: "wx" });
    return parseCliJson(runCli(["db", "query", "--local", "--output-format", "json", "--file", sqlFile]));
  } finally {
    await rm(sqlFile, { force: true });
  }
}

async function readFixture(directoryArg) {
  const directory = path.resolve(root, directoryArg);
  if (directory !== fixturesRoot && !directory.startsWith(fixturesRoot + path.sep)) {
    throw new Error("fixture 路徑必須位於 supabase/test-fixtures/ 之內。");
  }
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  if (path.basename(directory) !== manifest.fixtureId) throw new Error("fixture 目錄名稱與 manifest fixtureId 不一致。");
  if (manifest.schemaVersion !== schemaVersion) throw new Error("不支援的 fixture schemaVersion。");
  if (!tripIdPattern.test(manifest.fixtureId)) throw new Error("fixtureId 不符合合成測試命名規則。");
  if (!Number.isInteger(manifest.version) || manifest.version < 1) throw new Error("fixture 版本必須是正整數。");
  if (typeof manifest.sourceHost !== "string" || !manifest.sourceHost.trim()) throw new Error("fixture 必須記錄有效 sourceHost。");
  if (manifest.version === 1) {
    if (manifest.parentVersion !== undefined || manifest.parentChecksum !== undefined) throw new Error("fixture v1 不得指定父版本。");
  } else if (manifest.parentVersion !== manifest.version - 1 || typeof manifest.parentChecksum !== "string" || !/^[a-f0-9]{64}$/.test(manifest.parentChecksum)) {
    throw new Error("fixture revision 必須明確連結前一整數版本及其 SHA-256 checksum。");
  }
  if (!["active", "regression_pending", "released", "archived", "deleted"].includes(manifest.status)) throw new Error("無效的生命週期狀態。");
  if (!Array.isArray(manifest.tables) || manifest.tables.length !== allowedTables.length ||
      manifest.tables.some((table) => !allowedTables.includes(table)) ||
      allowedTables.some((table) => !manifest.tables.includes(table))) {
    throw new Error("fixture 資料表清單不完整或含未允許的資料表。");
  }
  if (!data.trips?.length || data.trips.length !== 1 || data.trips[0].id !== manifest.fixtureId) {
    throw new Error("行程 ID 與 manifest 不一致。");
  }
  if (data.trips[0].content?.testPurpose !== "three-way-sync") throw new Error("缺少三方同步測試標記。");
  if (Object.hasOwn(data.trips[0], "participants")) throw new Error("fixture 不得包含參與者欄位。");
  if (JSON.stringify(normalizeData(data)) !== JSON.stringify(data)) throw new Error("fixture 含有應排除的帳號／參與者欄位或未正規化內容。");
  for (const table of allowedTables) {
    if (!Array.isArray(data[table])) throw new Error(`缺少或格式錯誤的資料表：${table}`);
    const expected = manifest.counts?.[table];
    if (expected !== data[table].length) throw new Error(`fixture ${table} 筆數與 manifest 不一致。`);
  }
  const tripId = manifest.fixtureId;
  for (const table of ["checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"]) {
    if (data[table].some((row) => row.trip_id !== tripId && table !== "checklist_items")) {
      throw new Error(`資料表 ${table} 含有其他行程的資料。`);
    }
  }
  if (data.checklists.some((row) => row.trip_id !== tripId || row.scope !== "shared")) {
    throw new Error("fixture 只允許該行程的 shared checklist；不允許私人清單。");
  }
  const checklistIds = new Set(data.checklists.map((row) => row.id));
  if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) {
    throw new Error("checklist_items 存在找不到父清單的關聯，拒絕使用。");
  }
  for (const [table, key] of [["expenses", "client_item_id"], ["exchange_purchases", "client_item_id"], ["other_info_items", "client_item_id"]]) {
    const keys = data[table].map((row) => row[key]).filter((value) => value !== null && value !== undefined);
    if (new Set(keys).size !== keys.length) throw new Error(`資料表 ${table} 存在重複的 ${key}。`);
  }
  detectSensitive(data);
  if (checksumData(data) !== manifest.checksum) throw new Error("checksum 不一致；fixture 可能被修改，拒絕使用。");
  return { directory, manifest, data: normalizeData(data) };
}

async function validateActiveFixtures({ verifyGitHistory = true } = {}) {
  let entries = [];
  try {
    entries = await readdir(fixturesRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const validated = [];
  for (const entry of entries.filter((item) => item.isDirectory() && tripIdPattern.test(item.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const fixturePath = path.relative(root, path.join(fixturesRoot, entry.name));
    const { manifest } = await readFixture(fixturePath);
    if (manifest.fixtureId !== entry.name) throw new Error(`fixture 目錄與 manifest ID 不一致：${entry.name}`);
    if (["active", "regression_pending"].includes(manifest.status)) {
      validated.push({ fixtureId: manifest.fixtureId, version: manifest.version, status: manifest.status });
    }
  }

  if (verifyGitHistory) {
    for (const fixture of validated) {
      const workingFixture = await readFixture(fixtureGitPath(fixture.fixtureId));
      const parent = assertParentRevision(workingFixture);
      if (fixture.version > 1 && (!parent || parent.manifest.version !== fixture.version - 1)) {
        throw new Error(`fixture ${fixture.fixtureId} 找不到連續父版本 v${fixture.version - 1}；提交前格式驗證失敗。`);
      }
      if (parent && (workingFixture.manifest.parentVersion !== parent.manifest.version || workingFixture.manifest.parentChecksum !== parent.manifest.checksum)) {
        throw new Error(`fixture ${fixture.fixtureId} manifest 父版本欄位與 Git 歷史不一致；提交前格式驗證失敗。`);
      }
    }
  }
  return validated;
}

async function validateFixture(directoryArg) {
  const { manifest, data } = await readFixture(directoryArg);
  console.log(JSON.stringify({
    valid: true,
    fixtureId: manifest.fixtureId,
    version: manifest.version,
    status: manifest.status,
    counts: Object.fromEntries(allowedTables.map((table) => [table, data[table].length])),
    checksum: checksumData(data),
  }, null, 2));
  return { manifest, data };
}

async function fetchTripData(tripId) {
  if (!tripIdPattern.test(tripId)) throw new Error("只允許 App 自動產生格式的測試行程 ID。");
  const id = sqlLiteral(tripId);
  const sql = `select json_build_object(
    'trips', coalesce((select json_agg(to_jsonb(t)) from (select id,title,departure_date,currency_config,sidebar_config,(content - 'participants' - 'participantEmailMap' - 'checklistData' - 'participantMap' - 'participantEmailMaps') as content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
    'checklists', coalesce((select json_agg(to_jsonb(c) - 'created_by' - 'owner_user_id') from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
    'checklist_items', coalesce((select json_agg(to_jsonb(i) - 'created_by') from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
    'expenses', coalesce((select json_agg(to_jsonb(e) - 'id' - 'owner_user_id' - 'recorded_by_email' - 'payer' - 'attachment_path' - 'attachment_bucket' - 'attachment_name' - 'attachment_mime' - 'attachment_size' - 'attachment_status' - 'attachment_uploaded_at' - 'attachment_uploaded_by' - 'attachment_last_error') from (select trip_id,title,amount,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
    'exchange_purchases', coalesce((select json_agg(to_jsonb(e) - 'created_by') from (select id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at from public.exchange_purchases where trip_id=${id}) e),'[]'::json),
    'other_info_items', coalesce((select json_agg(to_jsonb(o) - 'created_by') from (select id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at from public.other_info_items where trip_id=${id}) o),'[]'::json)
  ) as payload`;
  const data = normalizeData(await queryLocalPayload(sql));
  if (!data.trips.length) throw new Error(`本機資料庫找不到行程 ${tripId}；不會產生空 fixture。`);
  if (data.trips.length !== 1 || data.trips[0].content?.__testFixture !== true) {
    throw new Error("行程尚未明確標記 content.__testFixture=true；為避免誤匯出真實資料，已停止。");
  }
  if (!Array.isArray(data.trips[0].participants) || data.trips[0].participants.length !== 0) {
    throw new Error("合成測試行程的 participants 必須為空陣列；請先移除參與者資料再交接。");
  }
  detectSensitive(data);
  return data;
}

function fixtureDirectory(tripId) {
  return path.join(fixturesRoot, tripId);
}

async function loadHandoffState() {
  try {
    const state = JSON.parse(await readFile(handoffStatePath, "utf8"));
    if (state.schemaVersion !== 1 || !state.fixtures || typeof state.fixtures !== "object") {
      throw new Error("本機 handoff 狀態檔格式不符；為避免覆蓋，請人工檢查。");
    }
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, fixtures: {} };
    throw error;
  }
}

const appliedStatePath = path.resolve(root, "supabase", ".temp", "testdata-applied-state.json");

async function loadAppliedState() {
  try {
    const state = JSON.parse(await readFile(appliedStatePath, "utf8"));
    if (state.schemaVersion !== 1 || !state.fixtures || typeof state.fixtures !== "object") {
      throw new Error("本機已套用 fixture revision 狀態檔格式不符；拒絕套用。");
    }
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, fixtures: {} };
    throw error;
  }
}

async function writeAppliedState(state) {
  await mkdir(path.dirname(appliedStatePath), { recursive: true });
  const tempPath = appliedStatePath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    await rename(tempPath, appliedStatePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function fixtureGitPath(fixtureId) {
  return `supabase/test-fixtures/${fixtureId}`;
}

function readFixtureAtRevision(fixtureId, revision) {
  const base = fixtureGitPath(fixtureId);
  const manifest = JSON.parse(runGit(["show", `${revision}:${base}/manifest.json`]));
  const data = JSON.parse(runGit(["show", `${revision}:${base}/data.json`]));
  return { manifest, data: normalizeData(data) };
}

function assertParentRevision(fixture) {
  const { manifest } = fixture;
  if (manifest.version === 1) return null;
  const commits = runGit(["log", "--format=%H", "--", `${fixtureGitPath(manifest.fixtureId)}/manifest.json`])
    .split(/\r?\n/).filter(Boolean);
  for (const commit of commits) {
    try {
      const candidate = readFixtureAtRevision(manifest.fixtureId, commit);
      if (candidate.manifest.version === manifest.parentVersion && candidate.manifest.checksum === manifest.parentChecksum) {
        return candidate;
      }
    } catch { /* Continue until the declared parent version is found. */ }
  }
  throw new Error(`fixture ${manifest.fixtureId} 找不到 Git 歷史中的父版本 v${manifest.parentVersion}／checksum；拒絕覆蓋。`);
}

async function fixtureFileHashes(directory) {
  const data = await readFile(path.join(directory, "data.json"));
  const manifest = await readFile(path.join(directory, "manifest.json"));
  return {
    dataSha256: createHash("sha256").update(data).digest("hex"),
    manifestSha256: createHash("sha256").update(manifest).digest("hex"),
  };
}

async function recordHandoffState(tripId) {
  const state = await loadHandoffState();
  const manifest = JSON.parse(await readFile(path.join(fixtureDirectory(tripId), "manifest.json"), "utf8"));
  state.fixtures[tripId] = {
    ...(await fixtureFileHashes(fixtureDirectory(tripId))),
    version: manifest.version,
    checksum: manifest.checksum,
  };
  await mkdir(path.dirname(handoffStatePath), { recursive: true });
  const tempPath = handoffStatePath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    await rename(tempPath, handoffStatePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

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

  const state = await loadHandoffState();
  const previous = state.fixtures[tripId];
  const current = await fixtureFileHashes(directory);
  const filesMatchPrevious = previous &&
    current.dataSha256 === previous.dataSha256 &&
    current.manifestSha256 === previous.manifestSha256;

  if (filesMatchPrevious) return;

  // A committed Git update is the transport/authenticity boundary for another
  // computer's fixture. Permit only a strict manifest version advance.
  // Same-version edits, rollback, and untracked local edits remain blocked.
  let committedManifest = null;
  try {
    committedManifest = JSON.parse(runGit(["show", `HEAD:${relativeDirectory.split(path.sep).join("/")}/manifest.json`]));
  } catch {
    throw new Error(`fixture ${tripId} 無法從目前 Git HEAD 讀取已提交 manifest；拒絕將本機檔案視為遠端交接。`);
  }
  if (committedManifest.fixtureId !== tripId ||
      !Number.isInteger(committedManifest.version) ||
      committedManifest.version !== incomingManifest.version ||
      committedManifest.checksum !== incomingManifest.checksum) {
    throw new Error(`fixture ${tripId} 的工作檔與 Git HEAD manifest 不一致；拒絕採用未提交或來源不明內容。`);
  }
  if (previous && incomingManifest.version < (previous.version ?? 0)) {
    throw new Error(`fixture ${tripId} 版本倒退（已確認 v${previous.version ?? "unknown"}，收到 v${incomingManifest.version}）；拒絕接收。`);
  }
  if (!previous && incomingManifest.version < 1) {
    throw new Error(`fixture ${tripId} 缺少有效的首次交接版本；拒絕覆蓋。`);
  }
}

async function writeFixture(directory, data, manifest) {
  await mkdir(directory, { recursive: true });
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const dataPath = path.join(directory, "data.json");
  const manifestPath = path.join(directory, "manifest.json");
  const tempData = dataPath + suffix;
  const tempManifest = manifestPath + suffix;
  try {
    await writeFile(tempData, JSON.stringify(normalizeData(data), null, 2) + "\n", { flag: "wx" });
    await writeFile(tempManifest, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    await rename(tempData, dataPath);
    await rename(tempManifest, manifestPath);
  } finally {
    await rm(tempData, { force: true });
    await rm(tempManifest, { force: true });
  }
}

function manifestFor(tripId, data, version, status, parent = null) {
  return {
    schemaVersion,
    fixtureId: tripId,
    version,
    ...(parent ? { parentVersion: parent.version, parentChecksum: parent.checksum } : {}),
    status,
    sourceHost: process.env.TC_TEST_SOURCE || process.env.COMPUTERNAME || "unknown",
    exportedAt: new Date().toISOString(),
    tables: allowedTables,
    counts: Object.fromEntries(allowedTables.map((table) => [table, data[table].length])),
    checksum: checksumData(data),
    note: "Synthetic test data only. Import is restricted to local loopback Supabase.",
  };
}

async function exportFixture(tripId, { allowUpdate = false } = {}) {
  if (!tripIdPattern.test(tripId)) throw new Error("只允許 tc-test- 開頭的合成測試行程 ID；真實行程不會被匯出。");
  assertDevelopBranch();
  assertLocalOnly();
  const data = await fetchTripData(tripId);
  const directory = fixtureDirectory(tripId);
  let oldFixture = null;
  try {
    oldFixture = await readFixture(path.relative(root, directory));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      if (allowUpdate) throw new Error(`現有 fixture 無法通過驗證，拒絕覆寫：${error.message}`);
      throw error;
    }
  }

  if (oldFixture) {
    if (!allowUpdate) throw new Error(`fixture 已存在：${tripId}。請使用 testdata:handoff 比對差異。`);
    if (!["active", "regression_pending"].includes(oldFixture.manifest.status)) {
      throw new Error(`fixture 狀態為 ${oldFixture.manifest.status}，一般交接不會重新啟用或覆寫。`);
    }
    if (sameFixtureBusinessData(oldFixture.data, data)) {
      return { fixtureId: tripId, result: "unchanged", version: oldFixture.manifest.version };
    }
    await assertSafeFixtureUpdate(tripId, directory, oldFixture.manifest);
    const manifest = manifestFor(tripId, data, oldFixture.manifest.version + 1, oldFixture.manifest.status, oldFixture.manifest);
    await writeFixture(directory, data, manifest);
    return { fixtureId: tripId, result: "updated", version: manifest.version, checksum: manifest.checksum };
  }

  let directoryEntries = [];
  try { directoryEntries = await readdir(directory); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (directoryEntries.length) throw new Error(`fixture 目錄 ${tripId} 已存在但資料不完整，拒絕覆寫。`);
  if (directoryEntries.length === 0) {
    try {
      const rootEntries = await readdir(fixturesRoot);
      if (rootEntries.includes(tripId) && directoryEntries.length === 0) {
        // An empty existing directory is safe to populate.
      }
    } catch { /* mkdir below reports the actual failure if the root is unavailable. */ }
  }
  const manifest = manifestFor(tripId, data, 1, "active");
  await writeFixture(directory, data, manifest);
  return { fixtureId: tripId, result: "created", version: manifest.version, checksum: manifest.checksum };
}

function withoutDatabaseTimestamps(row) {
  const { created_at: _createdAt, updated_at: _updatedAt, ...rest } = row;
  return canonicalValue(rest);
}

function rowsMatchParent(currentRows, parentRows) {
  if (currentRows.length !== parentRows.length) return false;
  const normalize = (rows) => rows.map(withoutDatabaseTimestamps).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalize(currentRows)) === JSON.stringify(normalize(parentRows));
}

async function fetchExistingFixtureData(tripId) {
  const id = sqlLiteral(tripId);
  const sql = `select json_build_object(
    'trips', coalesce((select json_agg(to_jsonb(t)) from (select id,title,departure_date,participants,currency_config,sidebar_config,content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
    'checklists', coalesce((select json_agg(to_jsonb(c)) from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
    'checklist_items', coalesce((select json_agg(to_jsonb(i)) from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
    'expenses', coalesce((select json_agg(to_jsonb(e)) from (select trip_id,title,amount,payer,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
    'exchange_purchases', coalesce((select json_agg(to_jsonb(e)) from (select id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at from public.exchange_purchases where trip_id=${id}) e),'[]'::json),
    'other_info_items', coalesce((select json_agg(to_jsonb(o)) from (select id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at from public.other_info_items where trip_id=${id}) o),'[]'::json)
  ) as payload`;
  return normalizeData(await queryLocalPayload(sql));
}

function dataMatchesFixture(current, expected, { ignoreTimestamps = false } = {}) {
  const strip = ignoreTimestamps ? withoutDatabaseTimestamps : canonicalValue;
  const normalize = (rows) => rows.map(strip).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return allowedTables.every((table) =>
    JSON.stringify(normalize(current[table])) === JSON.stringify(normalize(expected[table])));
}

async function importAllFixtures() {
  assertDevelopBranch();
  assertLocalOnly();
  let entries = [];
  try { entries = await readdir(fixturesRoot, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") { console.log("[testdata:import] 尚無版本化測試資料，略過。"); return; } throw error; }

  const appliedState = await loadAppliedState();
  const pending = [];
  const adopted = [];
  const skipped = [];
  for (const entry of entries.filter((item) => item.isDirectory() && tripIdPattern.test(item.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const fixturePath = path.relative(root, path.join(fixturesRoot, entry.name));
    const fixture = await readFixture(fixturePath);
    const relativeFixturePath = fixtureGitPath(entry.name);
    const status = runGit(["status", "--porcelain=v1", "--", relativeFixturePath]);
    if (status) throw new Error(`fixture ${entry.name} 有未提交變更；接收端只接受 Git 已提交版本。`);
    const committed = readFixtureAtRevision(entry.name, "HEAD");
    if (committed.manifest.version !== fixture.manifest.version || committed.manifest.checksum !== fixture.manifest.checksum || !sameFixtureData(committed.data, fixture.data)) {
      throw new Error(`fixture ${entry.name} 工作檔與 Git HEAD 不一致；拒絕匯入未提交內容。`);
    }
    const { manifest } = fixture;
    if (manifest.fixtureId !== entry.name) throw new Error(`fixture 目錄與 manifest ID 不一致：${entry.name}`);
    if (!["active", "regression_pending"].includes(manifest.status)) {
      skipped.push({ fixtureId: entry.name, status: manifest.status });
      continue;
    }

    const previous = appliedState.fixtures[manifest.fixtureId];
    const revisionDecision = classifyFixtureRevision(previous, manifest);
    if (revisionDecision.action === "reject") {
      throw new Error(`fixture ${manifest.fixtureId} revision rejected: ${revisionDecision.reason} (local=${previous?.version ?? "none"}, incoming=${manifest.version}).`);
    }
    if (revisionDecision.action === "skip") {
      const current = await fetchExistingFixtureData(manifest.fixtureId);
      if (!dataMatchesFixture(current, fixture.data, { ignoreTimestamps: true })) {
        throw new Error(`fixture ${manifest.fixtureId} 資料庫內容與已記錄 v${manifest.version} 不一致；可能有本機編輯，拒絕覆蓋。`);
      }
      skipped.push({ fixtureId: manifest.fixtureId, version: manifest.version, reason: "already-applied" });
      continue;
    }

    const current = await fetchExistingFixtureData(manifest.fixtureId);
    if (dataMatchesFixture(current, fixture.data)) {
      appliedState.fixtures[manifest.fixtureId] = { version: manifest.version, checksum: manifest.checksum };
      adopted.push({ fixtureId: manifest.fixtureId, version: manifest.version, reason: "database-already-matches" });
      continue;
    }

    const isEmptyTarget = allowedTables.every((table) => current[table].length === 0);
    if (!previous && isEmptyTarget) {
      // One-time local bootstrap: an empty fixture target has no prior data to
      // protect. The committed Git fixture is the authoritative initial state.
      // This path is local-only and never permits overwriting existing rows.
      pending.push({ ...fixture, previousData: null });
      continue;
    }

    const parent = assertParentRevision(fixture);
    if (!parent) {
      if (current.trips.length) throw new Error(`fixture ${manifest.fixtureId} 首次匯入時目標行程已存在，但無法證明為空白基準；拒絕覆蓋。`);
      pending.push({ ...fixture, previousData: null });
      continue;
    }
    if (previous && (parent.manifest.version !== previous.version || parent.manifest.checksum !== previous.checksum)) {
      throw new Error(`fixture ${manifest.fixtureId} Git 父版本與已套用版本不符。`);
    }
    if (!dataMatchesFixture(current, parent.data, { ignoreTimestamps: true })) {
      throw new Error(`fixture ${manifest.fixtureId} 本機資料庫不等於父版本 v${parent.manifest.version}；可能有獨立編輯，已停止覆蓋。`);
    }
    pending.push({ ...fixture, previousData: parent.data });
  }

  if (pending.length) {
    await applyFixtureImport(pending, { runCli: (args) => runCli(args) });
    for (const { manifest } of pending) {
      appliedState.fixtures[manifest.fixtureId] = {
        version: manifest.version,
        checksum: manifest.checksum,
        baselineAt: manifest.baselineAt ?? manifest.exportedAt,
      };
    }
  }

  if (adopted.length || pending.length) await writeAppliedState(appliedState);
  console.log(JSON.stringify({
    imported: true,
    database: "local loopback only",
    applied: pending.map(({ manifest, data }) => ({
      fixtureId: manifest.fixtureId,
      version: manifest.version,
      rows: Object.fromEntries(allowedTables.map((table) => [table, data[table].length])),
    })),
    adopted,
    skipped,
    conflictPolicy: "replace only when destination exactly matches the declared parent revision; newer/equal revisions are never overwritten",
  }, null, 2));
}

async function handoff({ autoCommitPush = false } = {}) {
  const baselineGitStatus = autoCommitPush ? await assertHandoffGitState() : null;
  if (!autoCommitPush) assertDevelopBranch();
  assertLocalOnly();
  const fixtureEntries = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && tripIdPattern.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const candidates = fixtureEntries.map((entry) => ({ id: entry.name }));
  const results = [];
  for (const item of candidates) {
    const fixturePath = path.relative(root, fixtureDirectory(item.id));
    const currentFixture = await readFixture(fixturePath);
    const gitStatus = runGit(["status", "--porcelain=v1", "--", fixtureGitPath(item.id)]);
    if (gitStatus) {
      throw new Error(`fixture ${item.id} 工作檔有未提交變更；handoff 不會覆蓋或發布既有修改。`);
    }
    const committedFixture = readFixtureAtRevision(item.id, "HEAD");
    if (committedFixture.manifest.version !== currentFixture.manifest.version ||
        committedFixture.manifest.checksum !== currentFixture.manifest.checksum ||
        !sameFixtureData(committedFixture.data, currentFixture.data)) {
      throw new Error(`fixture ${item.id} 工作檔與 Git HEAD 不一致；拒絕執行 handoff。`);
    }

    const appliedState = await loadAppliedState();
    const applied = appliedState.fixtures[item.id];
    if (!applied) {
      // Bootstrap is safe only when local DB is already byte-for-byte equivalent
      // to the committed fixture (apart from database-generated timestamps).
      // Never infer a baseline and export an unknown local database state.
      const currentData = await fetchExistingFixtureData(item.id);
      if (!dataMatchesFixture(currentData, currentFixture.data, { ignoreTimestamps: true })) {
        throw new Error(`fixture ${item.id} 缺少本機已套用版本紀錄，且資料庫不等於 Git fixture；拒絕猜測基準或產生新版本。`);
      }
      appliedState.fixtures[item.id] = { version: currentFixture.manifest.version, checksum: currentFixture.manifest.checksum };
      await writeAppliedState(appliedState);
      await recordHandoffState(item.id);
      results.push({ fixtureId: item.id, result: "baseline-adopted", version: currentFixture.manifest.version });
      continue;
    }

    const currentData = await fetchExistingFixtureData(item.id);
    const parentFixture = currentFixture.manifest.parentVersion
      ? assertParentRevision(currentFixture)
      : null;
    const appliedMatchesHead = applied.version === currentFixture.manifest.version &&
      applied.checksum === currentFixture.manifest.checksum;
    const appliedMatchesParent = parentFixture &&
      applied.version === parentFixture.manifest.version &&
      applied.checksum === parentFixture.manifest.checksum;
    const baselineFixture = appliedMatchesHead ? currentFixture : (appliedMatchesParent ? parentFixture : currentFixture);
    const incomingFixture = appliedMatchesParent ? currentFixture.manifest : null;
    const databaseMatchesCurrent = dataMatchesFixture(currentData, baselineFixture.data, { ignoreTimestamps: true });
    const decision = classifyPeerHandoff(
      applied,
      baselineFixture.manifest,
      incomingFixture,
      databaseMatchesCurrent,
    );
    if (decision.action === "reject") {
      throw new Error(`fixture ${item.id} handoff rejected: ${decision.reason} (applied=v${applied.version}, git=v${currentFixture.manifest.version}).`);
    }
    if (decision.action === "receive") {
      // importAllFixtures() performs the parent-row comparison and transactional
      // apply. Handoff only classifies the revision direction here.
      await recordHandoffState(item.id);
      results.push({ fixtureId: item.id, result: "peer-revision-received", version: currentFixture.manifest.version });
      continue;
    }
    if (decision.action === "unchanged") {
      results.push({ fixtureId: item.id, result: "unchanged", version: currentFixture.manifest.version });
      continue;
    }

    // Export is allowed only when applied=current and the local DB differs
    // from that exact current fixture. The exporter creates current+1.
    const exportResult = await exportFixture(item.id, { allowUpdate: true });
    results.push(exportResult);
    await validateFixture(fixturePath);
    if (["updated", "created"].includes(exportResult.result)) {
      const publishedFixture = await readFixture(fixturePath);
      appliedState.fixtures[item.id] = {
        version: publishedFixture.manifest.version,
        checksum: publishedFixture.manifest.checksum,
      };
      await writeAppliedState(appliedState);
    }
    await recordHandoffState(item.id);
  }
  // Only a newly exported fixture revision creates files that may be
  // committed and pushed. Receiving a peer revision or adopting a baseline
  // changes only local state and must never enter fixture publication.
  const exported = results.filter((item) => ["updated", "created"].includes(item.result));
  const changed = exported.length > 0;
  let gitResult = { committed: false, pushed: false };
  if (autoCommitPush && changed) {
    const fixturePaths = [...new Set(exported.map((item) => `supabase/test-fixtures/${item.fixtureId}`))];
    const changedPaths = getHandoffGitStatus();
    const allowed = new Set(fixturePaths.flatMap((directory) => [`${directory}/manifest.json`, `${directory}/data.json`]));
    const expected = new Set([...allowed].flatMap((file) => [`?? ${file}`, ` M ${file}`]));
    const changedBaseline = baselineGitStatus.filter((line) => !changedPaths.includes(line));
    const unexpected = changedPaths.filter((line) => !baselineGitStatus.includes(line) && !expected.has(line));
    const reported = new Set(changedPaths.filter((line) => expected.has(line)).map((line) => line.slice(3)));
    if (changedBaseline.length || unexpected.length || reported.size !== allowed.size || [...allowed].some((file) => !reported.has(file))) {
      throw new Error(`安全停止：handoff 後 Git 差異超出 fixture 白名單。基線變更：${changedBaseline.join(", ") || "無"}；非預期新增：${unexpected.join(", ") || "無"}。`);
    }
    for (const directory of fixturePaths) await validateFixture(directory);
    for (const directory of fixturePaths) runGit(["add", "--", `${directory}/manifest.json`, `${directory}/data.json`]);
    const staged = runGit(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
    if (staged.length !== allowed.size || staged.some((file) => !allowed.has(file))) throw new Error("安全停止：stage 檔案超出 fixture 白名單；不會 commit 或 push。");
    runGit(["diff", "--cached", "--check"]);
    runGit(["commit", "-m", "同步雙電腦合成測試資料"]);
    const remaining = getHandoffGitStatus();
    if (remaining.length !== baselineGitStatus.length || baselineGitStatus.some((line) => !remaining.includes(line))) throw new Error("已建立 fixture commit，但工作樹狀態與基線不同；停止 push。");
    const counts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"]).split(/\s+/).map(Number);
    if (counts.length !== 2 || counts[0] !== 1 || counts[1] !== 0) throw new Error("已建立 fixture commit，但遠端已變更或分支狀態不符；停止 push。");
    runGit(["push", "origin", "develop"]);
    gitResult = { committed: true, pushed: true, files: staged };
  }
  console.log(JSON.stringify({
    handoff: true,
    scanned: candidates.length,
    results,
    git: gitResult,
    nextStep: autoCommitPush
      ? changed ? "fixture 已安全 commit/push；接收端 git pull --ff-only origin develop 後執行 npm run db:sync:local。" : "沒有資料變更，略過 commit/push。"
      : changed ? "偵測到新 fixture revision；請使用 npm run testdata:handoff:publish 安全發布。" : "沒有需要交接的測試資料變更。",
  }, null, 2));
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === "validate:active") {
    const validated = await validateActiveFixtures();
    console.log(JSON.stringify({ valid: true, checked: validated.length, fixtures: validated }, null, 2));
  }
  else if (command === "handoff:validate") {
    const validated = await validateActiveFixtures();
    console.log(JSON.stringify({ valid: true, checked: validated.length, fixtures: validated }, null, 2));
  }
  else if (command === "export" && argument) await exportFixture(argument);
  else if (command === "validate" && argument) await validateFixture(argument);
  else if (["import:all", "handoff", "handoff:publish"].includes(command)) {
    throw new Error("此舊版同步入口已停用：請使用 npm run testdata:download（下載）或 npm run testdata:upload（上傳）；同步只依實際內容比較，不使用版本鏈／父版本／applied-state 門檻。");
  }
  else throw new Error("用法：npm run testdata:export -- tc-test-example；npm run testdata:validate -- supabase/test-fixtures/tc-test-example；npm run testdata:validate:active");
} catch (error) {
  console.error(`[testdata-sync] 停止：${error?.stderr?.toString().trim() || error.message || error}`);
  process.exitCode = 1;
}
