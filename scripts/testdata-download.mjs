import { execFileSync } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import {
  classifyTimestampSync,
  SYNC_CLOCK_SQL_PATH,
  SYNC_DATASET_DIRECTORY,
  SYNC_DATASET_ID,
  SYNC_TABLES,
  validateSyncTimestamp,
} from "./lib/testdata-clock-sync.mjs";
import { normalizeDatabaseDataset, validateDatabaseDataset, buildDatabaseDatasetImportSql, buildLocalDatabaseSnapshotSql } from "./lib/testdata-dataset.mjs";

process.env.SUPABASE_TELEMETRY_DISABLED = "1";
const root = process.cwd();
const datasetDirectory = path.resolve(root, SYNC_DATASET_DIRECTORY);
const manifestPath = path.join(datasetDirectory, "manifest.json");
const dataPath = path.join(datasetDirectory, "data.json");

function runGit(args) {
  return execFileSync("git.exe", args, { cwd: root, encoding: "utf8", shell: true }).trim();
}

function runCli(args) {
  return execFileSync("npx.cmd", ["supabase", ...args], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });
}

function assertLocalOnly() {
  const output = runCli(["status", "-o", "json"]);
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("無法確認本機 Supabase 連線位置。");
  const status = JSON.parse(output.slice(start, end + 1));
  const url = status.API_URL ?? status.api_url;
  const databaseUrl = status.DB_URL ?? status.db_url;
  const loopbackHosts = ["localhost", "127.0.0.1", "::1"];
  if (!url || !databaseUrl || !loopbackHosts.includes(new URL(url).hostname) ||
      !loopbackHosts.includes(new URL(databaseUrl).hostname)) {
    throw new Error("安全停止：下載只允許寫入目前主機的 loopback Supabase API 與資料庫。");
  }
}

function parseQueryRows(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("本機 Supabase SQL 未回傳預期 JSON。");
  const rows = JSON.parse(output.slice(start, end + 1));
  if (!Array.isArray(rows)) throw new Error("本機 Supabase SQL 回傳格式不符。");
  return rows.map((row) => Object.hasOwn(row, "payload") ? row.payload : row);
}

async function runSqlFile(sql, prefix) {
  const file = path.join(os.tmpdir(), prefix + "-" + process.pid + "-" + Date.now() + ".sql");
  try {
    await writeFile(file, sql, { flag: "wx" });
    return runCli(["db", "query", "--local", "--file", file]);
  } finally {
    await rm(file, { force: true });
  }
}

async function queryPayload(sql) {
  const file = path.join(os.tmpdir(), "tc-testdata-download-" + process.pid + "-" + Date.now() + ".sql");
  try {
    await writeFile(file, sql, { flag: "wx" });
    const rows = parseQueryRows(runCli([
      "db", "query", "--local", "--output-format", "json", "--file", file,
    ]));
    if (rows.length !== 1) throw new Error("本機同步 metadata／資料快照查詢筆數不符。");
    return rows[0];
  } finally {
    await rm(file, { force: true });
  }
}

async function ensureClock() {
  const sql = await readFile(path.resolve(root, SYNC_CLOCK_SQL_PATH), "utf8");
  await runSqlFile(sql, "tc-testdata-clock");
}

async function readLocalSnapshot() {
  const payload = await queryPayload(buildLocalDatabaseSnapshotSql());
  const localLastChangedAt = validateSyncTimestamp(payload.local_last_changed_at, "local_last_changed_at");
  const lastSyncedAt = payload.last_synced_at === null
    ? null
    : validateSyncTimestamp(payload.last_synced_at, "last_synced_at");
  const data = validateDatabaseDataset(normalizeDatabaseDataset(payload.data));
  return { localLastChangedAt, lastSyncedAt, data };
}

async function readGitDataset() {
  let manifest;
  let data;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await readFile(dataPath, "utf8");
      throw new Error("Git 資料庫 data.json 存在，但 manifest.json 缺失。");
    } catch (dataError) {
      if (dataError.code === "ENOENT") return null;
      throw dataError;
    }
  }
  try {
    data = JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    throw new Error("Git 資料庫 manifest 存在，但 data.json 缺失或無法讀取。");
  }
  if (!manifest || manifest.schemaVersion !== 1 || manifest.datasetId !== SYNC_DATASET_ID ||
      !Array.isArray(manifest.tables) || manifest.tables.length !== SYNC_TABLES.length ||
      SYNC_TABLES.some((table) => !manifest.tables.includes(table))) {
    throw new Error("Git 本機資料庫 manifest 結構無效；停止同步。");
  }
  const gitLastChangedAt = validateSyncTimestamp(manifest.git_last_changed_at, "git_last_changed_at");
  const normalized = validateDatabaseDataset(normalizeDatabaseDataset(data));
  for (const table of SYNC_TABLES) {
    if (manifest.counts?.[table] !== normalized[table].length) {
      throw new Error("Git 資料集筆數與 manifest 不一致：" + table);
    }
  }
  return { manifest, data: normalized, gitLastChangedAt };
}

function assertGitReady() {
  if (runGit(["branch", "--show-current"]) !== "develop") {
    throw new Error("資料庫下載只允許在 develop 分支。");
  }
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream !== "origin/develop") throw new Error("develop upstream 必須是 origin/develop。");
  runGit(["fetch", "--quiet", "origin", "develop"]);
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error("下載前 Git 工作樹必須乾淨；請先保存／提交其他變更。");
  const counts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"])
    .split(/\s+/).map(Number);
  if (counts[0] !== 0 || counts[1] !== 0) {
    throw new Error("本機 Git 尚未與 origin/develop 同步；請先自行執行 git pull --ff-only origin develop。");
  }
}

async function applyDataset({ remote, local, initialize }) {
  const sql = buildDatabaseDatasetImportSql({
    data: remote.data,
    gitLastChangedAt: remote.gitLastChangedAt,
    expectedLocalLastChangedAt: local.localLastChangedAt,
    expectedLastSyncedAt: local.lastSyncedAt,
    initialize,
  });
  await runSqlFile(sql, "tc-testdata-import");
}

async function main() {
  if (process.platform !== "win32") throw new Error("此同步入口目前只支援專案 Windows 節點。");
  if (!process.env.COMPUTERNAME) throw new Error("無法識別目前節點主機名稱。");
  assertLocalOnly();
  await ensureClock();
  const local = await readLocalSnapshot();
  const remote = await readGitDataset();
  if (!remote) {
    throw new Error("Git 尚無 local-database 資料集；請先指定初始來源並完成首次上傳。");
  }

  const initialize = process.argv.includes("--initialize");
  const preview = process.argv.includes("--preview");
  if (!preview) assertGitReady();
  let decision;
  if (local.lastSyncedAt === null) {
    if (!initialize) {
      throw new Error("本機尚未建立同步基準。首次下載必須明確指定：npm run testdata:download -- --initialize");
    }
    decision = { action: "initial-download" };
  } else {
    decision = classifyTimestampSync({
      localLastChangedAt: local.localLastChangedAt,
      lastSyncedAt: local.lastSyncedAt,
      gitLastChangedAt: remote.gitLastChangedAt,
    });
  }

  if (decision.action === "unchanged") {
    console.log(JSON.stringify({
      downloaded: false,
      result: "unchanged",
      local_last_changed_at: local.localLastChangedAt,
      last_synced_at: local.lastSyncedAt,
      git_last_changed_at: remote.gitLastChangedAt,
    }, null, 2));
    return;
  }
  if (!["download", "initial-download"].includes(decision.action)) {
    const reason = decision.action === "conflict"
      ? "本機與 Git 都在本機同步基準之後有變更，屬於衝突。"
      : decision.action === "upload"
        ? "本機有未同步變更；請執行 /上傳資料庫，不會在下載命令中覆蓋本機。"
        : "首次同步方向不正確或基準缺失。";
    throw new Error(reason + " 本次不會覆蓋任一端。");
  }

  if (preview) {
    console.log(JSON.stringify({
      preview: true,
      action: decision.action,
      git_last_changed_at: remote.gitLastChangedAt,
      counts: Object.fromEntries(SYNC_TABLES.map((table) => [table, remote.data[table].length])),
      note: "預覽模式未寫入本機資料庫或更新同步基準。",
    }, null, 2));
    return;
  }

  await applyDataset({ remote, local, initialize: decision.action === "initial-download" });
  const verified = await readLocalSnapshot();
  if (verified.localLastChangedAt !== remote.gitLastChangedAt ||
      verified.lastSyncedAt !== remote.gitLastChangedAt) {
    throw new Error("下載交易完成後，本機時間戳未正確校正；請停止後續同步並檢查本機 metadata。");
  }

  console.log(JSON.stringify({
    downloaded: true,
    applied: true,
    initial: decision.action === "initial-download",
    git_last_changed_at: remote.gitLastChangedAt,
    local_last_changed_at: verified.localLastChangedAt,
    last_synced_at: verified.lastSyncedAt,
    counts: Object.fromEntries(SYNC_TABLES.map((table) => [table, remote.data[table].length])),
    next: "本機資料已更新；另一台電腦的 last_synced_at 不會被修改。",
  }, null, 2));
}

main().catch((error) => {
  console.error("[testdata-download] 停止：" + error.message);
  if (error?.stack) console.error(error.stack);
  process.exitCode = 1;
});
