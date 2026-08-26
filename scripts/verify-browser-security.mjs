import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const builtIndexPath = resolve(projectRoot, "dist", "index.html");
const sourceAppPath = resolve(projectRoot, "src", "App.tsx");
const iosBootstrapPath = resolve(projectRoot, "dist", "ios-standalone.js");

const fail = (message) => {
  throw new Error(`瀏覽器安全驗證失敗：${message}`);
};

if (!existsSync(builtIndexPath)) fail("找不到 dist/index.html，請先執行正式建置");
if (!existsSync(iosBootstrapPath)) fail("iOS PWA 啟動程式未輸出至 dist");

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

console.log("瀏覽器安全驗證通過：CSP、Referrer Policy、外部啟動程式與 OAuth DOM 均符合規則。");
