import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("目前只建立 Windows x64 可攜版");
}

const source = dirname(fileURLToPath(import.meta.url));
const releaseRoot = resolve(source, "..", "..", ".release");
const packageName = "TravelCompanion-Itinerary-Rescue-v1.0.0-win-x64";
const staging = join(releaseRoot, packageName);
const zipPath = join(releaseRoot, `${packageName}.zip`);
const runtimeModules = join(source, "node_modules");
if (!existsSync(join(runtimeModules, "classic-level"))) {
  throw new Error("請先在 tools/offline-itinerary-rescue 執行 npm ci");
}

rmSync(staging, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(staging, { recursive: true });
for (const file of [
  "offline-itinerary-rescue.mjs",
  "rescue-core.mjs",
  "package.json",
  "README.txt",
  "START-RESCUE.cmd",
]) cpSync(join(source, file), join(staging, file));
cpSync(runtimeModules, join(staging, "node_modules"), { recursive: true });
cpSync(process.execPath, join(staging, "node.exe"));
const nodeLicense = join(dirname(process.execPath), "LICENSE");
if (existsSync(nodeLicense)) cpSync(nodeLicense, join(staging, "NODE-LICENSE.txt"));

const packed = spawnSync("tar.exe", ["-a", "-c", "-f", zipPath, "-C", releaseRoot, packageName], {
  stdio: "inherit",
});
if (packed.status !== 0) throw new Error("無法建立 ZIP");
console.log(zipPath);
