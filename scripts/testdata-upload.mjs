import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import {
  classifyTimestampSync,
  SYNC_CLOCK_SQL_PATH,
  SYNC_DATASET_DIRECTORY,
  SYNC_DATASET_ID,
  SYNC_TABLES,
  sqlTimestampLiteral,
  validateSyncTimestamp,
} from "./lib/testdata-clock-sync.mjs";
import { normalizeDatabaseDataset, validateDatabaseDataset, buildLocalDatabaseSnapshotSql } from "./lib/testdata-dataset.mjs";

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
    throw new Error("安全停止：只允許操作目前主機的 loopback Supabase API 與資料庫。");
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
  const file = path.join(os.tmpdir(), "tc-testdata-upload-" + process.pid + "-" + Date.now() + ".sql");
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
    throw new Error("資料庫上傳只允許在 develop 分支。");
  }
  const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream !== "origin/develop") throw new Error("develop upstream 必須是 origin/develop。");
  runGit(["fetch", "--quiet", "origin", "develop"]);
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error("上傳前 Git 工作樹必須乾淨；請先保存本次程式／文件修改。");
  const counts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"])
    .split(/\s+/).map(Number);
  if (counts[0] !== 0 || counts[1] !== 0) {
    throw new Error("本機與 origin/develop 不一致；拒絕自動合併或覆寫。");
  }
}

async function writeDatasetPair(data, manifest) {
  await mkdir(datasetDirectory, { recursive: true });
  const suffix = ".tmp-" + process.pid + "-" + Date.now();
  const tempData = dataPath + suffix;
  const tempManifest = manifestPath + suffix;
  const readPrevious = async (file) => readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const oldData = await readPrevious(dataPath);
  const oldManifest = await readPrevious(manifestPath);
  try {
    await writeFile(tempData, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    await writeFile(tempManifest, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    await rename(tempData, dataPath);
    await rename(tempManifest, manifestPath);
  } catch (error) {
    if (oldData === null) await rm(dataPath, { force: true });
    else await writeFile(dataPath, oldData);
    if (oldManifest === null) await rm(manifestPath, { force: true });
    else await writeFile(manifestPath, oldManifest);
    throw error;
  } finally {
    await rm(tempData, { force: true });
    await rm(tempManifest, { force: true });
  }
}

async function updateLocalBaseline(timestamp) {
  const sql = [
    "DO $tc_sync_baseline$",
    "DECLARE current_local timestamptz;",
    "BEGIN",
    "  SELECT local_last_changed_at INTO current_local FROM tc_testdata.sync_state WHERE singleton=true FOR UPDATE;",
    "  IF current_local < " + sqlTimestampLiteral(timestamp, "local_last_changed_at") + " THEN",
    "    RAISE EXCEPTION 'Local change clock is older than the published snapshot.';",
    "  END IF;",
    "  UPDATE tc_testdata.sync_state SET last_synced_at = " + sqlTimestampLiteral(timestamp, "last_synced_at") + " WHERE singleton=true;",
    "END; $tc_sync_baseline$;",
  ].join("\n");
  await runSqlFile(sql, "tc-testdata-baseline");
}

async function main() {
  if (process.platform !== "win32") throw new Error("此同步入口目前只支援專案 Windows 節點。");
  if (!process.env.COMPUTERNAME) throw new Error("無法識別目前節點主機名稱。");
  assertLocalOnly();
  await ensureClock();

  const local = await readLocalSnapshot();
  const remote = await readGitDataset();
  const initialize = process.argv.includes("--initialize");
  const preview = process.argv.includes("--preview");

  let decision;
  if (local.lastSyncedAt === null) {
    if (remote) {
      throw new Error("本機尚無 last_synced_at，但 Git 已有資料集；此節點應走首次下載流程，不可上傳覆蓋。");
    }
    if (!initialize) {
      throw new Error("尚未建立同步基準。首次上傳必須明確指定初始來源：npm run testdata:upload -- --initialize");
    }
    decision = { action: "initial-upload" };
  } else {
    if (!remote) throw new Error("本機已有同步基準，但 Git 資料集不存在；拒絕自行重建基準。");
    decision = classifyTimestampSync({
      localLastChangedAt: local.localLastChangedAt,
      lastSyncedAt: local.lastSyncedAt,
      gitLastChangedAt: remote.gitLastChangedAt,
    });
  }

  if (decision.action === "unchanged") {
    console.log(JSON.stringify({
      uploaded: false,
      result: "unchanged",
      local_last_changed_at: local.localLastChangedAt,
      last_synced_at: local.lastSyncedAt,
      git_last_changed_at: remote.gitLastChangedAt,
    }, null, 2));
    return;
  }
  if (!["upload", "initial-upload"].includes(decision.action)) {
    const reason = decision.action === "conflict"
      ? "本機與 Git 都在本機同步基準之後有變更，屬於衝突。"
      : decision.action === "download"
        ? "Git 有新變更，本機沒有新變更；請改執行 /下載資料庫。"
        : "首次同步方向不正確或基準缺失。";
    throw new Error(reason + " 本次不會覆蓋任一端。");
  }

  const data = validateDatabaseDataset(local.data);
  const gitLastChangedAt = local.localLastChangedAt;
  const manifest = {
    schemaVersion: 1,
    datasetId: SYNC_DATASET_ID,
    tables: SYNC_TABLES,
    counts: Object.fromEntries(SYNC_TABLES.map((table) => [table, data[table].length])),
    git_last_changed_at: gitLastChangedAt,
  };

  if (preview) {
    console.log(JSON.stringify({
      preview: true,
      action: decision.action,
      wouldPublish: { manifest, counts: manifest.counts },
      note: "預覽模式未寫入 fixture、未 commit/push，也未更新本機 last_synced_at。",
    }, null, 2));
    return;
  }

  assertGitReady();
  await writeDatasetPair(data, manifest);
  const relativeFiles = [
    SYNC_DATASET_DIRECTORY + "/data.json",
    SYNC_DATASET_DIRECTORY + "/manifest.json",
  ];
  for (const file of relativeFiles) runGit(["add", "--", file]);
  const staged = runGit(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
  if (staged.length !== relativeFiles.length || staged.some((file) => !relativeFiles.includes(file))) {
    throw new Error("上傳 stage 超出本機資料庫資料集白名單；停止 commit/push。");
  }
  runGit(["diff", "--cached", "--check"]);
  runGit(["commit", "-m", "更新本機測試資料庫資料集"]);
  const remaining = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (remaining) throw new Error("資料集 commit 後工作樹不乾淨；停止 push。");
  const remoteCounts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"])
    .split(/\s+/).map(Number);
  if (remoteCounts[0] !== 1 || remoteCounts[1] !== 0) {
    throw new Error("commit 後遠端已變更或分支差異異常；停止 push。");
  }
  runGit(["push", "origin", "develop"]);
  runGit(["fetch", "--quiet", "origin", "develop"]);
  const finalCounts = runGit(["rev-list", "--left-right", "--count", "HEAD...origin/develop"])
    .split(/\s+/).map(Number);
  if (finalCounts[0] !== 0 || finalCounts[1] !== 0) {
    throw new Error("push 後本機與 origin/develop 未一致；不更新本機同步基準。");
  }

  await updateLocalBaseline(gitLastChangedAt);
  console.log(JSON.stringify({
    uploaded: true,
    committed: true,
    pushed: true,
    git_last_changed_at: gitLastChangedAt,
    local_last_changed_at: local.localLastChangedAt,
    last_synced_at: gitLastChangedAt,
    next: "另一台電腦先 git pull --ff-only origin develop，再執行 npm run testdata:download -- --initialize（僅限首次且本機同步範圍為空）。",
  }, null, 2));
}

main().catch((error) => {
  console.error("[testdata-upload] 停止：" + error.message);
  if (error?.stack) console.error(error.stack);
  process.exitCode = 1;
});
