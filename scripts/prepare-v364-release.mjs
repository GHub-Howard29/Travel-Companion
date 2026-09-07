import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const distDir = resolve(projectRoot, "dist");
const releaseDir = resolve(projectRoot, ".release");
const stagedAssetsDir = resolve(releaseDir, "v364-assets");
const statePath = resolve(releaseDir, "v364-state.json");
const publicMetadataPath = resolve(projectRoot, "public", "app-version.json");
const distMetadataPath = resolve(distDir, "app-version.json");
const productionBaseUrl = "https://ghub-howard29.github.io/Travel-Companion/";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const hashBuffer = (buffer) => createHash("sha256").update(buffer).digest("hex");
const hashFile = (path) => hashBuffer(readFileSync(path));

const listFiles = (root, current = root) =>
  readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(current, entry.name);
    return entry.isDirectory() ? listFiles(root, absolutePath) : [relative(root, absolutePath).split(sep).join("/")];
  }).sort();

const createManifest = (root) =>
  Object.fromEntries(
    listFiles(root)
      .filter((path) => path !== "app-version.json")
      .map((path) => [path, hashFile(resolve(root, path))]),
  );

const assertManifest = (root, expected) => {
  assert.deepEqual(createManifest(root), expected, `${relative(projectRoot, root)} 的發布資產已改變，請重新準備。`);
};

const getVersionConstant = (name) => {
  const source = readFileSync(resolve(projectRoot, "src", "config", "appVersion.ts"), "utf8");
  const match = source.match(new RegExp(`export const ${name} = "([^"]+)"`));
  assert(match, `找不到 ${name}。`);
  return match[1];
};

const fetchProduction = async (path) => {
  const url = new URL(path, productionBaseUrl);
  url.searchParams.set("release-check", Date.now().toString());
  const response = await fetch(url, { cache: "no-store" });
  assert(response.ok, `正式站 ${path} 回傳 HTTP ${response.status}。`);
  return Buffer.from(await response.arrayBuffer());
};

const fetchProductionMetadata = async () =>
  JSON.parse((await fetchProduction("app-version.json")).toString("utf8"));

const assertMetadataEqual = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
};

const loadState = () => {
  assert(existsSync(statePath), "找不到 .release/v364-state.json，請先執行 prepare-assets。");
  return readJson(statePath);
};

const saveState = (state) => writeJson(statePath, state);

const assertCandidateBuild = () => {
  assert(existsSync(distMetadataPath), "找不到 dist/app-version.json，請先完成 production build。");
  const publicMetadata = readJson(publicMetadataPath);
  const distMetadata = readJson(distMetadataPath);
  assertMetadataEqual(distMetadata, publicMetadata, "dist 與 public 的候選 metadata 不一致。");
  assert.equal(publicMetadata.version, getVersionConstant("APP_VERSION"));
  assert.equal(publicMetadata.version, "3.6.4", "此工具只允許 V3.6.4。");
  assert.equal(publicMetadata.forceUpdate, true, "V3.6.4 必須維持必要更新。");
  return publicMetadata;
};

const assertPreviousProductionMetadata = async (state) => {
  const liveMetadata = await fetchProductionMetadata();
  assertMetadataEqual(
    liveMetadata,
    state.previousProductionMetadata,
    "正式 app-version.json 已改變，停止發布並重新執行 preflight。",
  );
};

const verifyRemoteManifest = async (manifest) => {
  for (const [path, expectedHash] of Object.entries(manifest)) {
    const remoteContent = await fetchProduction(path);
    assert.equal(hashBuffer(remoteContent), expectedHash, `正式站 ${path} 與候選資產不一致。`);
  }
};

const prepareAssets = async () => {
  const candidateMetadata = assertCandidateBuild();
  const previousVersion = getVersionConstant("PREVIOUS_RELEASE_VERSION");
  const liveMetadata = await fetchProductionMetadata();
  assert.equal(liveMetadata.version, previousVersion, `正式站版本不是預期的 ${previousVersion}。`);
  assert.equal(liveMetadata.forceUpdate, false, "第一階段前的正式 metadata 不應要求強制更新。");

  rmSync(releaseDir, { recursive: true, force: true });
  cpSync(distDir, stagedAssetsDir, { recursive: true });
  writeJson(resolve(stagedAssetsDir, "app-version.json"), liveMetadata);

  const state = {
    version: candidateMetadata.version,
    previousVersion,
    phase: "assets-prepared",
    preparedAt: new Date().toISOString(),
    previousProductionMetadata: liveMetadata,
    candidateMetadata,
    assetManifest: createManifest(distDir),
  };
  saveState(state);
  assertManifest(stagedAssetsDir, state.assetManifest);
  console.log("V3.6.4 第一階段資產已準備；staged metadata 仍為 V3.6.3。");
};

const assertAssetsReady = async () => {
  const state = loadState();
  assert.equal(state.phase, "assets-prepared", "第一階段狀態不正確，請重新準備資產。");
  assertManifest(stagedAssetsDir, state.assetManifest);
  assertMetadataEqual(readJson(resolve(stagedAssetsDir, "app-version.json")), state.previousProductionMetadata);
  await assertPreviousProductionMetadata(state);
  console.log("第一階段發布前檢查通過。");
};

const verifyAssets = async () => {
  const state = loadState();
  assert.equal(state.phase, "assets-prepared", "請先完成第一階段資產發布。");
  await assertPreviousProductionMetadata(state);
  await verifyRemoteManifest(state.assetManifest);
  state.phase = "assets-verified";
  state.assetsVerifiedAt = new Date().toISOString();
  saveState(state);
  console.log("正式 V3.6.4 資產逐檔驗證通過，metadata 仍為 V3.6.3。");
};

const assertMetadataReady = async () => {
  const state = loadState();
  assert.equal(state.phase, "assets-verified", "必須先完成第一階段正式資產驗證。");
  const candidateMetadata = assertCandidateBuild();
  assertMetadataEqual(candidateMetadata, state.candidateMetadata, "候選 metadata 已改變，停止發布。");
  assertManifest(distDir, state.assetManifest);
  await assertPreviousProductionMetadata(state);
  console.log("V3.6.4 metadata 發布前檢查通過。");
};

const verifyMetadata = async () => {
  const state = loadState();
  assert.equal(state.phase, "assets-verified", "metadata 驗證狀態不正確。");
  const liveMetadata = await fetchProductionMetadata();
  assertMetadataEqual(liveMetadata, state.candidateMetadata, "正式 V3.6.4 metadata 不一致。");
  await verifyRemoteManifest(state.assetManifest);
  state.phase = "metadata-verified";
  state.metadataVerifiedAt = new Date().toISOString();
  saveState(state);
  console.log("正式 V3.6.4 metadata 與資產驗證通過。");
};

const cleanup = () => {
  rmSync(releaseDir, { recursive: true, force: true });
  console.log("已清除本機 V3.6.4 發布 staging；dist 保留供必要查核。");
};

const modes = {
  "prepare-assets": prepareAssets,
  "assert-assets-ready": assertAssetsReady,
  "verify-assets": verifyAssets,
  "assert-metadata-ready": assertMetadataReady,
  "verify-metadata": verifyMetadata,
  cleanup,
};

const mode = process.argv[2];
assert(mode in modes, `未知模式：${mode ?? "(空白)"}`);
await modes[mode]();
