import { execFileSync } from "node:child_process";

const scripts = [
  'verify:v391-cover-photo',
  'verify:v3912-three-stage'
];

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("找不到 npm_execpath，請透過 npm run verify:v391:all 執行。");
}

console.log("Running V3.9.1 retained cover and V3.9.12 three-stage verification...");
for (const script of scripts) {
  console.log(`Executing ${script}...`);
  try {
    execFileSync(process.execPath, [npmCli, "run", script], { stdio: "inherit" });
  } catch {
    console.error(`Error executing ${script}`);
    process.exit(1);
  }
}

console.log(`Commons photo verification passed (${scripts.length} scripts).`);
