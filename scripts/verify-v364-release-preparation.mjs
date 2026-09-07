import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (path) => readFileSync(resolve(projectRoot, path), "utf8");

const packageMetadata = JSON.parse(readProjectFile("package.json"));
const releaseTool = readProjectFile("scripts/prepare-v364-release.mjs");
const gitignore = readProjectFile(".gitignore");

assert.match(gitignore, /^\.release\/$/m);
assert.match(packageMetadata.scripts["release:v364:publish-assets"], /--add/);
assert.match(packageMetadata.scripts["release:v364:publish-assets"], /assert-assets-ready/);
assert.match(packageMetadata.scripts["release:v364:publish-metadata"], /--add/);
assert.match(packageMetadata.scripts["release:v364:publish-metadata"], /assert-metadata-ready/);
assert.match(releaseTool, /state\.phase, "assets-verified"/);
assert.match(releaseTool, /assertPreviousProductionMetadata/);
assert.match(releaseTool, /verifyRemoteManifest/);
assert.match(releaseTool, /liveMetadata\.forceUpdate, false/);
assert.match(releaseTool, /publicMetadata\.forceUpdate, true/);

console.log("V3.6.4 兩階段發布準備與防呆驗證通過。");
