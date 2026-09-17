import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "vite";

import {
  parseEnvironmentFile,
  resolveProductionEnvironment,
} from "./lib/production-environment.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const productionEnvironmentPath = resolve(projectRoot, ".env");

if (!existsSync(productionEnvironmentPath)) {
  throw new Error(
    "找不到正式環境來源 .env；production build 不會讀取 .env.local，請先建立正式環境設定。",
  );
}

const productionEnvironment = resolveProductionEnvironment({
  fileValues: parseEnvironmentFile(productionEnvironmentPath),
  processValues: process.env,
});

process.env.VITE_SUPABASE_URL = productionEnvironment.VITE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = productionEnvironment.VITE_SUPABASE_ANON_KEY;

console.log(
  `正式建置環境已鎖定：${productionEnvironment.VITE_SUPABASE_URL}（未讀取 .env.local）`,
);

await build({
  root: projectRoot,
  mode: "production",
});
