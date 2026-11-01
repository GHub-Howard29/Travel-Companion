import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const appVersionSource = read("src/config/appVersion.ts");
const metadata = JSON.parse(read("public/app-version.json"));
const packageJson = JSON.parse(read("package.json"));
const viteConfig = read("vite.config.ts");

const readStringConstant = (name) => {
  const match = appVersionSource.match(new RegExp(`export const ${name} = "([^"]+)";`));
  assert.ok(match, `appVersion.ts 缺少 ${name}`);
  return match[1];
};

const readBooleanConstant = (name) => {
  const match = appVersionSource.match(new RegExp(`export const ${name} = (true|false);`));
  assert.ok(match, `appVersion.ts 缺少 ${name}`);
  return match[1] === "true";
};

const appVersion = readStringConstant("APP_VERSION");
assert.equal(packageJson.version, appVersion, "package.json 與 App 版本不一致");
assert.equal(metadata.version, appVersion, "公開 app-version.json 與 App 版本不一致");
assert.equal(
  metadata.minimumSupportedVersion,
  readStringConstant("MINIMUM_SUPPORTED_VERSION"),
  "公開最低支援版本與 App 設定不一致",
);
assert.equal(metadata.releaseDate, readStringConstant("RELEASE_DATE"), "公開發布日期與 App 設定不一致");
assert.equal(metadata.forceUpdate, readBooleanConstant("FORCE_UPDATE"), "公開 forceUpdate 與 App 設定不一致");
assert.equal(
  readBooleanConstant("IS_MANDATORY_RELEASE"),
  metadata.forceUpdate,
  "必要更新標籤與舊版相容 forceUpdate 旗標不一致",
);

// Lock only the PWA plugin settings that materially affect the established
// prompt-based update flow. Detailed lifecycle behavior stays in its own test.
assert.match(viteConfig, /VitePWA\(/, "Vite PWA plugin 不可被移除");
assert.match(viteConfig, /registerType:\s*['"]prompt['"]/, "更新必須維持 prompt 模式");
assert.match(
  viteConfig,
  /globIgnores:\s*\[[^\]]*app-version\.json/,
  "app-version.json 不可進入 precache，避免讀到舊版本政策",
);
assert.match(
  viteConfig,
  /clientsClaim:\s*true/,
  "Workbox clientsClaim 與目前正式基線不同；若要調整須另行審查",
);

// Make the build gate enforce the existing focused tests instead of copying
// their assertions into this file.
const buildScript = packageJson.scripts.build;
for (const requiredCheck of [
  "verify:pwa-update-policy",
  "verify:update-policy",
  "verify:v3913-update-race",
]) {
  assert.ok(
    buildScript.includes(`npm run ${requiredCheck}`),
    `npm run build 必須包含 ${requiredCheck}`,
  );
}

console.log("PWA 更新設定與發布 metadata 一致性檢查通過；專責 handoff／reload regression 已由既有測試執行。");
