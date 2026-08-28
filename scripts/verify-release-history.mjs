import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (relativePath) =>
  readFileSync(resolve(projectRoot, relativePath), "utf8");

const appVersionSource = readProjectFile("src/config/appVersion.ts");
const versionHistorySource = readProjectFile("src/config/versionHistory.ts");
const publicVersionMetadata = JSON.parse(readProjectFile("public/app-version.json"));

const getExportedString = (name) => {
  const match = appVersionSource.match(
    new RegExp(`export const ${name} = "([^"]+)"`),
  );

  if (!match) {
    throw new Error(`src/config/appVersion.ts 缺少 ${name}。`);
  }

  return match[1];
};

const appVersion = getExportedString("APP_VERSION");
const previousReleaseVersion = getExportedString("PREVIOUS_RELEASE_VERSION");
const minimumSupportedVersion = getExportedString("MINIMUM_SUPPORTED_VERSION");
const releaseDate = getExportedString("RELEASE_DATE");
const packageMetadata = JSON.parse(readProjectFile("package.json"));
const historyVersions = [
  ...versionHistorySource.matchAll(/version:\s*"([^"]+)"/g),
].map((match) => match[1]);

if (appVersion === previousReleaseVersion) {
  throw new Error("APP_VERSION 不可與 PREVIOUS_RELEASE_VERSION 相同。\n");
}

if (publicVersionMetadata.version !== appVersion) {
  throw new Error(
    `public/app-version.json 版本 ${publicVersionMetadata.version} 與 APP_VERSION ${appVersion} 不一致。`,
  );
}

if (packageMetadata.version !== appVersion) {
  throw new Error(`package.json 版本 ${packageMetadata.version} 與 APP_VERSION ${appVersion} 不一致。`);
}

if (publicVersionMetadata.minimumSupportedVersion !== minimumSupportedVersion) {
  throw new Error("公開 metadata 與 App 的 minimumSupportedVersion 不一致。");
}

if (publicVersionMetadata.releaseDate !== releaseDate) {
  throw new Error("公開 metadata 與 App 的發布日期不一致。");
}

const parseVersion = (value) => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  return match ? match.slice(1).map(Number) : null;
};
const compareVersions = (left, right) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
};

if (compareVersions(minimumSupportedVersion, appVersion) > 0) {
  throw new Error("minimumSupportedVersion 不可高於目前發布版本。");
}

if (publicVersionMetadata.forceUpdate !== true) {
  throw new Error("版本政策橋接期間 public/app-version.json 的 forceUpdate 必須維持 true。");
}

if (!historyVersions.includes(previousReleaseVersion)) {
  throw new Error(
    `版本歷史缺少上一個發布版本 ${previousReleaseVersion}。請先更新 src/config/versionHistory.ts。`,
  );
}

if (historyVersions.includes(appVersion)) {
  throw new Error(`版本歷史不應包含目前版本 ${appVersion}。`);
}

if (new Set(historyVersions).size !== historyVersions.length) {
  throw new Error("版本歷史包含重複版本號。\n");
}

console.log(
  `版本歷史驗證通過：目前 ${appVersion}，上一版 ${previousReleaseVersion} 已收錄。`,
);
