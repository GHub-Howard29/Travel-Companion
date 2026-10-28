import { execFileSync } from "node:child_process";
import process from "node:process";

const run = (command, args, options = {}) => execFileSync(
  process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command,
  args,
  { encoding: "utf8", stdio: "inherit", shell: process.platform === "win32", ...options },
);

const capture = (command, args) => execFileSync(
  process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command,
  args,
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" },
);

const assertLocalSupabase = () => {
  const output = capture("npx", ["supabase", "status", "-o", "json"]);
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("無法讀取本機 Supabase 狀態；已停止，未執行資料庫變更。");
  const status = JSON.parse(output.slice(start, end + 1));
  const apiUrl = status.API_URL ?? status.api_url;
  if (!apiUrl) throw new Error("Supabase 狀態未提供 API_URL；已停止。");
  const host = new URL(apiUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`安全停止：Supabase API 不是 loopback 本機端點（${host}）。不會連線或修改遠端資料庫。`);
  }
  console.log(`[sync-local] 確認目標是本機 Supabase：${apiUrl}`);
};

try {
  const branch = capture("git", ["branch", "--show-current"]).trim();
  if (branch !== "develop") {
    throw new Error(`目前分支為「${branch}」，本流程只允許在 develop 執行。請先自行確認並切換到正確分支。`);
  }
  console.log("[sync-local] 步驟 1/4：確認分支與本機 Supabase 安全範圍");
  assertLocalSupabase();

  console.log("[sync-local] 步驟 2/4：只套用尚未執行的 Migration（不執行 reset、不刪除資料）");
  run("npx", ["supabase", "migration", "up", "--local"]);

  console.log("[sync-local] 步驟 3/4：依版本控制中的 fixture 更新標準合成測試資料");
  run("npm", ["run", "regression:local:prepare"]);

  console.log("[sync-local] 步驟 4/4：驗證資料庫權限、測試登入、Trip fixture 與 Edge Function 契約");
  run("npm", ["run", "regression:local:verify"]);

  console.log(JSON.stringify({
    synchronized: true,
    branch,
    database: "local loopback only",
    migrations: "pending migrations applied; no reset",
    fixture: "version-controlled synthetic baseline prepared",
    verification: "passed",
    limitations: "This synchronizes the schema and declared regression fixture, not arbitrary ad-hoc rows created during manual testing.",
  }, null, 2));
} catch (error) {
  console.error(`[sync-local] 失敗並停止：${error?.stderr?.toString().trim() || error.message || error}`);
  process.exitCode = 1;
}

