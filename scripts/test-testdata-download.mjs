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
assert.match(downloadSource, /\[testdata-download\] 下載檢查完成/,
  "successful download must print a visible completion summary");
assert.match(downloadSource, /success: true/,
  "successful download must emit an explicit success result");
assert.match(downloadSource, /下載失敗：\$\{error\.message\}/,
  "failed download must print a clear error");
assert.match(downloadSource, /error\?\.stack/,
  "failed download must print stack details for diagnosis");
console.log("testdata download checks passed (content comparison and visible success/failure reporting)");
