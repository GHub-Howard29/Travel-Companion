import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonical, withoutDatabaseTimestamps, sameFixtureRows } from "./testdata-download.mjs";

const syncLocalSource = await readFile(new URL("./sync-local-database.mjs", import.meta.url), "utf8");
assert.match(syncLocalSource, /npm\", \[\"run\", \"testdata:download\"\]/,
  "db:sync:local must use content-based download");
assert.doesNotMatch(syncLocalSource, /testdata:handoff|testdata:import:all/,
  "db:sync:local must not call version-chain handoff/import commands");

const fixture = {
  trips: [{ id: "tc-test-download", title: "Synthetic", created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z", content: { __testFixture: true, nested: { b: 2, a: 1 } } }],
  checklists: [{ id: "c1", trip_id: "tc-test-download", scope: "shared", title: "List" }],
  checklist_items: [{ id: "i1", checklist_id: "c1", label: "Item" }],
  expenses: [],
  exchange_purchases: [],
  other_info_items: [],
};
const local = structuredClone(fixture);
local.trips[0].created_at = "2026-11-06T00:00:00Z";
local.trips[0].updated_at = "2026-11-06T00:00:00Z";
assert.equal(sameFixtureRows(local, fixture, { ignoreTimestamps: true }), true,
  "database timestamps alone must not trigger a download");

const contentChanged = structuredClone(fixture);
contentChanged.checklist_items[0].label = "Edited locally";
assert.equal(sameFixtureRows(contentChanged, fixture, { ignoreTimestamps: true }), false,
  "different local content must trigger B-side overwrite");

const orderChanged = structuredClone(fixture);
orderChanged.checklists.reverse();
orderChanged.trips[0].content = { nested: { a: 1, b: 2 }, __testFixture: true };
assert.equal(sameFixtureRows(orderChanged, fixture, { ignoreTimestamps: true }), true,
  "JSON object key order and row order must not trigger a download");

const missingRow = structuredClone(fixture);
missingRow.expenses.push({ trip_id: "tc-test-download", title: "Local extra" });
assert.equal(sameFixtureRows(missingRow, fixture, { ignoreTimestamps: true }), false,
  "extra local rows must be replaced by the B-side snapshot");

assert.equal(sameFixtureRows(fixture, fixture), true);

const downloadSource = await readFile(new URL("./testdata-download.mjs", import.meta.url), "utf8");
const uploadSource = await readFile(new URL("./testdata-upload.mjs", import.meta.url), "utf8");
assert.match(downloadSource, /\[testdata-download\] 下載檢查完成/,
  "successful download must print a visible completion summary");
assert.match(downloadSource, /success: !excelFailed/,
  "overall result must report an Excel RPC dataset failure independently");
assert.match(downloadSource, /下載失敗：\$\{error\.message\}/,
  "failed download must print a clear error");
assert.match(downloadSource, /error\?\.stack/,
  "failed download must print stack details for diagnosis");
assert.match(downloadSource, /fileURLToPath\(import\.meta\.url\)/,
  "direct CLI detection must convert the module URL to a platform-native path");
assert.doesNotMatch(downloadSource, /new URL\(import\.meta\.url\)\.pathname/,
  "direct CLI detection must not compare against URL.pathname on Windows");
assert.equal(downloadSource.includes("tripPattern"), false,
  "fixture discovery must not depend on a fixed TRIP ID format");
assert.match(downloadSource, /try\s*\{\s*excelPlan = await prepareExcelRpcDatasetDownload\(\)/,
  "RPC dataset validation failure must be isolated from TRIP fixture discovery");
assert.match(downloadSource, /const fixturePlans = \[\]/,
  "TRIP fixtures must be planned independently of the RPC dataset");
assert.match(uploadSource, /where is_public = false and coalesce\(content->>'testPurpose', ''\) = 'three-way-sync'/,
  "upload must select all private marked test trips");
assert.equal(uploadSource.includes("tripPattern"), false,
  "upload must not require a fixed TRIP ID format");
assert.match(uploadSource, /let excelRpcReport[\s\S]*catch \(error\)[\s\S]*excelRpcReport = \{ fixtureId: EXCEL_RPC_DATASET_ID, result: "error"/,
  "RPC dataset errors must be reported separately from TRIP fixture processing");
assert.match(uploadSource, /const candidateIds = await query\([\s\S]*?const fixtureReports = \[\]/,
  "TRIP fixture scanning must continue after RPC dataset handling");

console.log("testdata download checks passed (multi-fixture IDs, independent RPC handling, content comparison, visible reporting, and Windows CLI entrypoint)");
