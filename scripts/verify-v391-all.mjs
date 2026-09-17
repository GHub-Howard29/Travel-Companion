import { execFileSync } from "node:child_process";

const scripts = [
  'verify:v391-cover-photo',
  'verify:v391-commons-precision',
  'verify:v391-wikimedia-parsers',
  'verify:v391-precision-pipeline',
  'verify:v391-precision-session',
  'verify:v391-precision-transport',
  'verify:v391-precision-response',
  'verify:v391-precision-quota',
  'verify:v391-precision-cache',
  'verify:v391-precision-usage',
  'verify:v391-precision-usage-daily',
  'verify:v391-precision-usage-persistence',
  'verify:v391-precision-engine',
  'verify:v391-precision-fetch',
  'verify:v391-precision-database',
  'verify:v391-precision-integration',
  'verify:v391-regression-fixture'
];

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("找不到 npm_execpath，請透過 npm run verify:v391:all 執行。");
}

console.log("Running V3.9.1 all verification...");
for (const script of scripts) {
  console.log(`Executing ${script}...`);
  try {
    execFileSync(process.execPath, [npmCli, "run", script], { stdio: "inherit" });
  } catch {
    console.error(`Error executing ${script}`);
    process.exit(1);
  }
}

console.log(`V3.9.1 all verification passed (${scripts.length} scripts).`);
