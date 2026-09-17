import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseEnvironmentFile,
  resolveProductionEnvironment,
} from "./lib/production-environment.mjs";

const projectRoot = process.cwd();
const builtIndexPath = resolve(projectRoot, "dist", "index.html");
const sourceAppPath = resolve(projectRoot, "src", "App.tsx");
const iosBootstrapPath = resolve(projectRoot, "dist", "ios-standalone.js");
const productionEnvironmentPath = resolve(projectRoot, ".env");

const fail = (message) => {
  throw new Error(`瀏覽器安全驗證失敗：${message}`);
};

if (!existsSync(builtIndexPath)) fail("找不到 dist/index.html，請先執行正式建置");
if (!existsSync(iosBootstrapPath)) fail("iOS PWA 啟動程式未輸出至 dist");
if (!existsSync(productionEnvironmentPath)) fail("找不到正式環境來源 .env");

const productionEnvironment = resolveProductionEnvironment({
  fileValues: parseEnvironmentFile(productionEnvironmentPath),
  processValues: process.env,
});

const collectArtifactFiles = (directoryPath) =>
  readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) return collectArtifactFiles(entryPath);
    return /\.(?:html|js|css|json)$/i.test(entry.name) ? [entryPath] : [];
  });

const artifactFiles = collectArtifactFiles(resolve(projectRoot, "dist"));
// Supabase SDK 本身含測試／URL 判斷用的 localhost 字串；這裡只拒絕會形成
// 本機 Supabase API 連線的 URL，避免把第三方函式庫常數誤判成 App 設定。
const forbiddenSupabaseLocalUrls = [
  /https?:\/\/localhost:54321(?:\/|["'`]|$)/i,
  /https?:\/\/127(?:\.\d{1,3}){3}:54321(?:\/|["'`]|$)/i,
  /https?:\/\/0\.0\.0\.0:54321(?:\/|["'`]|$)/i,
  /https?:\/\/\[::1\]:54321(?:\/|["'`]|$)/i,
  /wss?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]):54321(?:\/|["'`]|$)/i,
];

for (const artifactPath of artifactFiles) {
  const artifactSource = readFileSync(artifactPath, "utf8");
  for (const forbiddenPattern of forbiddenSupabaseLocalUrls) {
    if (forbiddenPattern.test(artifactSource)) {
      fail(`正式產物 ${artifactPath.slice(projectRoot.length + 1)} 含有本機 Supabase URL`);
    }
  }
}

const builtIndex = readFileSync(builtIndexPath, "utf8");
const sourceApp = readFileSync(sourceAppPath, "utf8");
const cspMatch = builtIndex.match(
  /<meta http-equiv="Content-Security-Policy" content="([^"]+)"\s*\/>/i,
);

if (!cspMatch) fail("正式 HTML 缺少 Content Security Policy");
if (builtIndex.includes("__TRAVEL_COMPANION_CSP__")) {
  fail("正式 HTML 仍包含 CSP placeholder");
}
if (!/<meta name="referrer" content="no-referrer"\s*\/>/i.test(builtIndex)) {
  fail("正式 HTML 缺少 no-referrer 政策");
}
if (sourceApp.includes(".innerHTML")) {
  fail("App 仍使用 innerHTML 建立 OAuth 視窗內容");
}

const csp = cspMatch[1];
if (!csp.includes(productionEnvironment.VITE_SUPABASE_URL)) {
  fail("CSP 未包含核准的 production Supabase origin");
}
if (!artifactFiles.some((artifactPath) =>
  readFileSync(artifactPath, "utf8").includes(productionEnvironment.VITE_SUPABASE_URL),
)) {
  fail("正式 JavaScript 產物未包含核准的 production Supabase origin");
}
const requiredDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "form-action 'self'",
];

for (const directive of requiredDirectives) {
  if (!csp.includes(directive)) fail(`CSP 缺少 ${directive}`);
}

const scriptPolicy = csp
  .split(";")
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith("script-src "));
if (!scriptPolicy) fail("CSP 缺少 script-src");
if (scriptPolicy.includes("'unsafe-inline'") || scriptPolicy.includes("'unsafe-eval'")) {
  fail("script-src 不得允許 unsafe-inline 或 unsafe-eval");
}

const inlineScripts = [...builtIndex.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)];
if (inlineScripts.length > 0) fail("正式 HTML 仍包含行內 script");

console.log(
  `瀏覽器安全驗證通過：CSP、production origin、全產物 loopback 掃描、Referrer Policy、外部啟動程式與 OAuth DOM 均符合規則（${productionEnvironment.VITE_SUPABASE_URL}）。`,
);
