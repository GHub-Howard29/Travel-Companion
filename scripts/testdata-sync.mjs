import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { createHash } from "node:crypto";

const root = process.cwd();
const fixturesRoot = path.resolve(root, "supabase", "test-fixtures");
const handoffStatePath = path.resolve(root, "supabase", ".temp", "testdata-handoff-state.json");
const schemaVersion = 1;
const allowedTables = ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"];
const tripIdPattern = /^tc-test-[a-z0-9][a-z0-9-]{2,60}$/;

const tableSpecs = [
  {
    name: "trips",
    columns: ["id", "title", "departure_date", "participants", "currency_config", "sidebar_config", "content", "created_at", "updated_at", "is_public"],
    where: (candidate) => `t.id = ${candidate}.id`,
    key: (r) => r.id,
  },
  {
    name: "checklists",
    columns: ["id", "trip_id", "scope", "title", "created_at", "updated_at"],
    where: (candidate) => `t.id = ${candidate}.id`,
    key: (r) => r.id,
  },
  {
    name: "checklist_items",
    columns: ["id", "checklist_id", "client_item_id", "label", "is_checked", "sort_order", "created_at", "updated_at", "deleted_at", "category"],
    where: (candidate) => `(t.id = ${candidate}.id OR (${candidate}.client_item_id IS NOT NULL AND t.checklist_id = ${candidate}.checklist_id AND t.client_item_id = ${candidate}.client_item_id))`,
    key: (r) => r.id,
  },
  {
    name: "expenses",
    columns: ["trip_id", "title", "amount", "payer", "currency", "created_at", "expense_date", "client_item_id", "updated_at", "deleted_at"],
    where: (candidate) => `t.trip_id = ${candidate}.trip_id AND t.client_item_id = ${candidate}.client_item_id`,
    key: (r) => `${r.trip_id}/${r.client_item_id}`,
  },
  {
    name: "exchange_purchases",
    columns: ["id", "trip_id", "client_item_id", "foreign_currency", "purchase_date", "twd_amount", "foreign_amount", "created_at", "updated_at"],
    where: (candidate) => `(t.id = ${candidate}.id OR (t.trip_id = ${candidate}.trip_id AND t.client_item_id = ${candidate}.client_item_id))`,
    key: (r) => r.id,
  },
  {
    name: "other_info_items",
    columns: ["id", "trip_id", "client_item_id", "folder_id", "title", "content", "allowed_roles", "sort_order", "created_at", "updated_at", "deleted_at"],
    where: (candidate) => `(t.id = ${candidate}.id OR (${candidate}.client_item_id IS NOT NULL AND t.trip_id = ${candidate}.trip_id AND t.client_item_id = ${candidate}.client_item_id))`,
    key: (r) => r.id,
  },
];

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

function assertDevelopBranch() {
  const branch = runGit(["branch", "--show-current"]);
  if (branch !== "develop") throw new Error(`本流程只允許在 develop 執行；目前分支為「${branch}」。`);
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
  const normalized = {};
  for (const table of allowedTables) {
    const rows = data[table];
    normalized[table] = [...rows].sort((a, b) => {
      const spec = tableSpecs.find((item) => item.name === table);
      return String(spec.key(a)).localeCompare(String(spec.key(b)));
    });
  }
  return normalized;
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

function checksumData(data) {
  return createHash("sha256").update(JSON.stringify(normalizeData(data))).digest("hex");
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
  if (!["active", "regression_pending", "released", "archived", "deleted"].includes(manifest.status)) throw new Error("無效的生命週期狀態。");
  if (!Array.isArray(manifest.tables) || manifest.tables.length !== allowedTables.length ||
      manifest.tables.some((table) => !allowedTables.includes(table)) ||
      allowedTables.some((table) => !manifest.tables.includes(table))) {
    throw new Error("fixture 資料表清單不完整或含未允許的資料表。");
  }
  if (!data.trips?.length || data.trips.length !== 1 || data.trips[0].id !== manifest.fixtureId) {
    throw new Error("行程 ID 與 manifest 不一致。");
  }
  if (data.trips[0].content?.__testFixture !== true) throw new Error("缺少 content.__testFixture=true 合成資料標記。");
  if (!Array.isArray(data.trips[0].participants) || data.trips[0].participants.length !== 0) {
    throw new Error("fixture 不允許匯入參與者資料；請只使用 participants=[] 的合成行程。");
  }
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
  if (!tripIdPattern.test(tripId)) throw new Error("只允許 tc-test- 開頭的合成測試行程 ID。");
  const id = sqlLiteral(tripId);
  const sql = `select json_build_object(
    'trips', coalesce((select json_agg(to_jsonb(t) - 'created_by') from (select id,title,departure_date,participants,currency_config,sidebar_config,content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
    'checklists', coalesce((select json_agg(to_jsonb(c) - 'created_by' - 'owner_user_id') from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
    'checklist_items', coalesce((select json_agg(to_jsonb(i) - 'created_by') from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
    'expenses', coalesce((select json_agg(to_jsonb(e) - 'id' - 'owner_user_id' - 'recorded_by_email' - 'attachment_path' - 'attachment_bucket' - 'attachment_name' - 'attachment_mime' - 'attachment_size' - 'attachment_status' - 'attachment_uploaded_at' - 'attachment_uploaded_by' - 'attachment_last_error') from (select trip_id,title,amount,payer,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
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
  state.fixtures[tripId] = await fixtureFileHashes(fixtureDirectory(tripId));
  await mkdir(path.dirname(handoffStatePath), { recursive: true });
  const tempPath = handoffStatePath + `.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    await rename(tempPath, handoffStatePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function assertSafeFixtureUpdate(tripId, directory) {
  const status = runGit(["status", "--porcelain=v1", "--", path.relative(root, directory)]);
  const records = status ? status.split(/\r?\n/).filter(Boolean) : [];
  if (records.some((line) => {
    const code = line.slice(0, 2);
    return code !== "??" && (code[0] !== " " || ![" ", "M"].includes(code[1]));
  })) {
    throw new Error(`fixture ${tripId} 已 staged、刪除或處於其他 Git 狀態，為避免覆蓋而停止。`);
  }
  const names = (await readdir(directory)).sort();
  if (names.length !== 2 || names[0] !== "data.json" || names[1] !== "manifest.json") {
    throw new Error(`fixture ${tripId} 目錄含額外檔案或暫存檔，為避免遺失而停止。`);
  }
  const state = await loadHandoffState();
  const previous = state.fixtures[tripId];
  if (!previous) throw new Error(`fixture ${tripId} 尚無本機交接基準，為避免覆蓋未保存內容而停止。`);
  const current = await fixtureFileHashes(directory);
  if (current.dataSha256 !== previous.dataSha256 || current.manifestSha256 !== previous.manifestSha256) {
    throw new Error(`fixture ${tripId} 的檔案與本機交接基準不同，可能來自其他電腦的更新或人工修改；為避免覆蓋而停止。`);
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

function manifestFor(tripId, data, version, status) {
  return {
    schemaVersion,
    fixtureId: tripId,
    version,
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
    if (sameFixtureData(oldFixture.data, data)) {
      return { fixtureId: tripId, result: "unchanged", version: oldFixture.manifest.version };
    }
    await assertSafeFixtureUpdate(tripId, directory);
    const manifest = manifestFor(tripId, data, oldFixture.manifest.version + 1, oldFixture.manifest.status);
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

function buildConflictBody(spec, row) {
  const candidate = `candidate_${spec.name}`;
  const existing = `existing_${spec.name}`;
  const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
  const checks = spec.columns.map((column) => `${existing}.${column} IS DISTINCT FROM ${candidate}.${column}`).join("\n        OR ");
  const keyLabel = spec.name === "trips" ? `${candidate}.id` :
    spec.name === "expenses" ? `${candidate}.trip_id || '/' || ${candidate}.client_item_id` : `${candidate}.id::text`;
  return `  ${candidate} := jsonb_populate_record(NULL::public.${spec.name}, ${json});
  SELECT count(*) INTO match_count FROM public.${spec.name} AS t WHERE ${spec.where(candidate)};
  IF match_count > 1 THEN
    RAISE EXCEPTION 'Fixture conflict: multiple local rows match in ${spec.name}';
  END IF;
  SELECT t.* INTO ${existing} FROM public.${spec.name} AS t WHERE ${spec.where(candidate)};
  IF FOUND AND (
        ${checks}
  ) THEN
    RAISE EXCEPTION 'Fixture conflict in ${spec.name} for key %', ${keyLabel};
  END IF;`;
}

function buildInsert(spec, row) {
  const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
  const columns = spec.columns.join(", ");
  const selected = spec.columns.map((column) => `r.${column}`).join(", ");
  return `  INSERT INTO public.${spec.name} (${columns})
  SELECT ${selected}
  FROM jsonb_populate_record(NULL::public.${spec.name}, ${json}) AS r
  ON CONFLICT DO NOTHING;`;
}

function buildImportSql(fixtures) {
  const rows = [];
  for (const fixture of fixtures) {
    for (const spec of tableSpecs) {
      for (const row of fixture.data[spec.name]) rows.push({ spec, row });
    }
  }
  if (rows.length === 0) throw new Error("沒有可匯入的合成資料列。");
  const declarations = tableSpecs.flatMap(({ name }) => [
    `  candidate_${name} public.${name};`,
    `  existing_${name} public.${name};`,
  ]);
  declarations.push("  match_count integer;");
  const body = [
    "DO $tc_fixture$",
    "DECLARE",
    ...declarations,
    "BEGIN",
    "  -- Preflight: reject every conflicting key before writing any row.",
    ...rows.map(({ spec, row }) => buildConflictBody(spec, row)),
    "  -- Insert in dependency order; identical existing rows remain unchanged.",
    ...rows.map(({ spec, row }) => buildInsert(spec, row)),
    "  -- Postflight: catch concurrent writes or any unique-key collision before this atomic statement ends.",
    ...rows.map(({ spec, row }) => buildConflictBody(spec, row)),
    "END $tc_fixture$;",
  ];
  return body.join("\n\n") + "\n";
}

async function importAllFixtures() {
  assertDevelopBranch();
  assertLocalOnly();
  let entries = [];
  try { entries = await readdir(fixturesRoot, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") { console.log("[testdata:import] 尚無版本化測試資料，略過。"); return; } throw error; }
  const fixtures = [];
  const skipped = [];
  for (const entry of entries.filter((item) => item.isDirectory() && tripIdPattern.test(item.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const fixture = await readFixture(path.relative(root, path.join(fixturesRoot, entry.name)));
    if (fixture.manifest.fixtureId !== entry.name) throw new Error(`fixture 目錄與 manifest ID 不一致：${entry.name}`);
    if (["active", "regression_pending"].includes(fixture.manifest.status)) fixtures.push(fixture);
    else skipped.push({ fixtureId: entry.name, status: fixture.manifest.status });
  }
  if (!fixtures.length) {
    console.log(JSON.stringify({ imported: true, applied: [], skipped }, null, 2));
    return;
  }
  const sql = buildImportSql(fixtures);
  const sqlFile = path.join(os.tmpdir(), `travel-companion-testdata-import-${process.pid}-${Date.now()}.sql`);
  try {
    await writeFile(sqlFile, sql, { flag: "wx" });
    runCli(["db", "query", "--local", "--file", sqlFile]);
  } finally {
    await rm(sqlFile, { force: true });
  }
  console.log(JSON.stringify({
    imported: true,
    database: "local loopback only",
    applied: fixtures.map(({ manifest, data }) => ({
      fixtureId: manifest.fixtureId,
      version: manifest.version,
      rows: Object.fromEntries(allowedTables.map((table) => [table, data[table].length])),
    })),
    skipped,
    conflictPolicy: "identical rows unchanged; mismatched keys abort and roll back the transaction",
  }, null, 2));
}

async function handoff() {
  assertDevelopBranch();
  assertLocalOnly();
  const sql = `select json_build_object(
    'fixtures', coalesce(json_agg(json_build_object('id', id) order by id), '[]'::json)
  ) as payload
  from public.trips
  where id ~ '^tc-test-[a-z0-9][a-z0-9-]{2,60}$'
    and content ->> '__testFixture' = 'true'`;
  const payload = await queryLocalPayload(sql);
  const candidates = payload.fixtures ?? [];
  const results = [];
  for (const item of candidates) {
    results.push(await exportFixture(item.id, { allowUpdate: true }));
    await validateFixture(path.relative(root, fixtureDirectory(item.id)));
    await recordHandoffState(item.id);
  }
  console.log(JSON.stringify({
    handoff: true,
    scanned: candidates.length,
    results,
    nextStep: results.some((item) => item.result !== "unchanged")
      ? "請檢查 supabase/test-fixtures 的差異；確認後由使用者自行 commit/push，另一台 pull 後執行 npm run db:sync:local。"
      : "沒有需要保存的新測試資料；不用匯出或提交。",
  }, null, 2));
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === "export" && argument) await exportFixture(argument);
  else if (command === "validate" && argument) await validateFixture(argument);
  else if (command === "import:all" && !argument) await importAllFixtures();
  else if (command === "handoff" && !argument) await handoff();
  else throw new Error("用法：npm run testdata:export -- tc-test-example；npm run testdata:validate -- supabase/test-fixtures/tc-test-example；npm run testdata:import:all；npm run testdata:handoff");
} catch (error) {
  console.error(`[testdata-sync] 停止：${error?.stderr?.toString().trim() || error.message || error}`);
  process.exitCode = 1;
}
