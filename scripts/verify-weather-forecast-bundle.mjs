import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const assetsDirectory = resolve(process.cwd(), "dist", "assets");
assert.ok(existsSync(assetsDirectory), "正式建置產物缺少 dist/assets，請先執行 npm run build");

const javascriptFiles = readdirSync(assetsDirectory)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => resolve(assetsDirectory, fileName));

assert.ok(javascriptFiles.length > 0, "dist/assets 中找不到 JavaScript 建置產物");

const artifacts = javascriptFiles.map((filePath) => ({
  filePath,
  source: readFileSync(filePath, "utf8"),
}));
const bundleSource = artifacts.map(({ source }) => source).join("\n");

const approvedLongRangeMessage = "目前為長期預報，請於出發前再次確認天氣";
const retiredMessages = [
  "目前不更新天氣；顯示上次成功取得的資料",
  "長期預報，仍可能變動",
];

assert.ok(
  bundleSource.includes(approvedLongRangeMessage),
  "正式前端 bundle 缺少 W15 定稿長期預報提示",
);

for (const retiredMessage of retiredMessages) {
  assert.ok(
    !bundleSource.includes(retiredMessage),
    `正式前端 bundle 仍包含已撤回文案：${retiredMessage}`,
  );
}

console.log("天氣文案 bundle 驗證通過：W15 定稿存在，已撤回文案未進入正式前端 JavaScript。");
