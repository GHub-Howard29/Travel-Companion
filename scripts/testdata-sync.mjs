import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { createHash } from "node:crypto";

const root = process.cwd();
const fixturesRoot = path.join(root, "supabase", "test-fixtures");
const schemaVersion = 1;
const allowedTables = ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"];

function runCli(args) {
  const output = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["supabase", ...args],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024, shell: process.platform === "win32" },
  );
  return output;
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
  return "'" + value.replaceAll("'", "''") + "'";
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
          throw new Error(`敏感欄位檢查未通過：${location}.${key}。請先在來源資料中移除或匿名化。`);
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

async function exportFixture(tripId) {
  if (!/^tc-test-[a-z0-9][a-z0-9-]{2,60}$/.test(tripId)) {
    throw new Error("只允許 tc-test- 開頭的合成測試行程 ID；真實行程不會被自動匯出。");
  }
  assertLocalOnly();
  const id = sqlLiteral(tripId);
  const sql = `select json_build_object(
    'trips', coalesce((select json_agg(to_jsonb(t) - 'created_by') from (select id,title,departure_date,participants,currency_config,sidebar_config,content,created_at,updated_at,is_public from public.trips where id=${id}) t),'[]'::json),
    'checklists', coalesce((select json_agg(to_jsonb(c) - 'created_by' - 'owner_user_id') from (select id,trip_id,scope,title,created_at,updated_at from public.checklists where trip_id=${id} and scope='shared') c),'[]'::json),
    'checklist_items', coalesce((select json_agg(to_jsonb(i) - 'created_by') from (select i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category from public.checklist_items i join public.checklists c on c.id=i.checklist_id where c.trip_id=${id} and c.scope='shared') i),'[]'::json),
    'expenses', coalesce((select json_agg(to_jsonb(e) - 'id' - 'owner_user_id' - 'recorded_by_email' - 'attachment_path' - 'attachment_bucket' - 'attachment_name' - 'attachment_mime' - 'attachment_size' - 'attachment_status' - 'attachment_uploaded_at' - 'attachment_uploaded_by' - 'attachment_last_error') from (select trip_id,title,amount,payer,currency,created_at,expense_date,client_item_id,updated_at,deleted_at from public.expenses where trip_id=${id}) e),'[]'::json),
    'exchange_purchases', coalesce((select json_agg(to_jsonb(e) - 'created_by') from (select id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at from public.exchange_purchases where trip_id=${id}) e),'[]'::json),
    'other_info_items', coalesce((select json_agg(to_jsonb(o) - 'created_by') from (select id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at from public.other_info_items where trip_id=${id}) o),'[]'::json)
  ) as payload`;
  const sqlFile = path.join(os.tmpdir(), `travel-companion-testdata-${process.pid}.sql`);
  let output;
  try {
    await writeFile(sqlFile, sql, { flag: "wx" });
    output = runCli(["db", "query", "--local", "--output-format", "json", "--file", sqlFile]);
  } finally {
    await rm(sqlFile, { force: true });
  }
  const data = parseCliJson(output);
  if (!data.trips?.length) throw new Error(`本機資料庫找不到行程 ${tripId}；不會產生空 fixture。`);
  if (data.trips.length !== 1 || data.trips[0].content?.__testFixture !== true) {
    throw new Error("行程尚未明確標記 content.__testFixture=true；為避免誤匯出真實資料，已停止。");
  }
  detectSensitive(data);
  const manifest = {
    schemaVersion,
    fixtureId: tripId,
    version: 1,
    status: "active",
    sourceHost: process.env.COMPUTERNAME || "unknown",
    exportedAt: new Date().toISOString(),
    tables: allowedTables,
    counts: Object.fromEntries(allowedTables.map((table) => [table, data[table]?.length ?? 0])),
    checksum: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    note: "Synthetic test data only. Import is not implemented by this command.",
  };
  const directory = path.join(fixturesRoot, tripId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "data.json"), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ exported: true, directory: path.relative(root, directory), counts: manifest.counts, checksum: manifest.checksum }, null, 2));
}

async function validateFixture(directoryArg) {
  const directory = path.resolve(root, directoryArg);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(directory, "data.json"), "utf8"));
  if (manifest.schemaVersion !== schemaVersion) throw new Error("不支援的 fixture schemaVersion。");
  if (!/^tc-test-[a-z0-9][a-z0-9-]{2,60}$/.test(manifest.fixtureId)) throw new Error("fixtureId 不符合合成測試命名規則。");
  if (!["active", "regression_pending", "released", "archived", "deleted"].includes(manifest.status)) throw new Error("無效的生命週期狀態。");
  if (!manifest.tables || manifest.tables.some((table) => !allowedTables.includes(table))) throw new Error("fixture 含有未允許的資料表。");
  if (manifest.tables.length !== allowedTables.length || allowedTables.some((table) => !manifest.tables.includes(table))) throw new Error("fixture 資料表清單不完整或不一致。");
  if (!data.trips?.length || data.trips.length !== 1 || data.trips.some((trip) => trip.id !== manifest.fixtureId)) throw new Error("行程 ID 與 manifest 不一致。");
  if (data.trips[0].content?.__testFixture !== true) throw new Error("缺少 content.__testFixture=true 合成資料標記。");
  for (const table of allowedTables) if (!Array.isArray(data[table])) throw new Error(`缺少或格式錯誤的資料表：${table}`);
  const tripId = manifest.fixtureId;
  for (const table of ["checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"]) {
    if (data[table].some((row) => row.trip_id !== tripId)) throw new Error(`資料表 ${table} 含有其他行程的資料。`);
  }
  const checklistIds = new Set(data.checklists.map((row) => row.id));
  if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) {
    throw new Error("checklist_items 存在找不到父清單的關聯，拒絕套用。");
  }
  for (const [table, key] of [["expenses", "client_item_id"], ["exchange_purchases", "client_item_id"], ["other_info_items", "client_item_id"]]) {
    const keys = data[table].map((row) => row[key]).filter((value) => value !== null && value !== undefined);
    if (new Set(keys).size !== keys.length) throw new Error(`資料表 ${table} 存在重複的 ${key}。`);
  }
  detectSensitive(data);
  const checksum = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  if (checksum !== manifest.checksum) throw new Error("checksum 不一致；fixture 可能被修改，請重新匯出或人工審查。");
  console.log(JSON.stringify({ valid: true, fixtureId: manifest.fixtureId, status: manifest.status, counts: manifest.counts, checksum }, null, 2));
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === "export" && argument) await exportFixture(argument);
  else if (command === "validate" && argument) await validateFixture(argument);
  else throw new Error("用法：node scripts/testdata-sync.mjs export tc-test-example；或 validate supabase/test-fixtures/tc-test-example");
} catch (error) {
  console.error(`[testdata-sync] 停止：${error.message || error}`);
  process.exitCode = 1;
}
