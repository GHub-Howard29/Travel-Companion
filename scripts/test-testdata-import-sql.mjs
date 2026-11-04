import assert from "node:assert/strict";
import { buildFixtureImportSql, checksumFixture, normalizeFixtureRows } from "./lib/testdata-download-apply.mjs";

const tripId = "tc-test-import-sql";
const previousData = {
  trips: [{ id: tripId, title: "Old", departure_date: "2026-11-01", participants: [], currency_config: {}, sidebar_config: {}, content: { __testFixture: true }, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", is_public: false }],
  checklists: [{ id: "checklist-1", trip_id: tripId, scope: "shared", title: "Old list", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }],
  checklist_items: [{ id: "item-1", checklist_id: "checklist-1", client_item_id: "item-client-1", label: "Old item", is_checked: false, sort_order: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null, category: "general" }],
  expenses: [{ trip_id: tripId, title: "Old expense", amount: 10, payer: "A", currency: "TWD", created_at: "2026-11-01T00:00:00Z", expense_date: "2026-11-01", client_item_id: "expense-1", updated_at: "2026-11-01T00:00:00Z", deleted_at: null }],
  exchange_purchases: [],
  other_info_items: [],
};
const data = structuredClone(previousData);
data.trips[0].title = "New";
data.checklist_items[0].label = "New item";
data.checklist_items[0].client_item_id = "item-client-2";

const sql = buildFixtureImportSql([{
  manifest: { fixtureId: tripId, version: 2, parentVersion: 1 },
  previousData,
  data,
}]);

const deleteData = structuredClone(data);
deleteData.checklist_items = [];
const deleteSql = buildFixtureImportSql([{
  manifest: { fixtureId: tripId, version: 2, parentVersion: 1 },
  previousData,
  data: deleteData,
}]);

assert.match(sql, /^DO \$tc_fixture\$/);
assert.match(sql, /SELECT \* INTO existing_trip FROM public\.trips WHERE id = 'tc-test-import-sql' FOR UPDATE/);
assert.match(sql, /PERFORM 1 FROM public\.trips t WHERE .* FOR UPDATE/);
assert.match(sql, /Fixture target row count mismatch in trips/);
assert.match(sql, /Fixture target differs from parent revision in trips/);
assert.match(sql, /t\.checklist_id = .* AND t\.client_item_id = .*\.client_item_id/);
assert.match(sql, /Fixture target differs from parent revision in checklist_items/);
assert.match(sql, /UPDATE public\.trips AS t SET/);
assert.match(sql, /INSERT INTO public\.checklist_items/);
assert.match(sql, /END \$tc_fixture\$;/);
assert.doesNotMatch(sql, /owner_user_id|created_by|attachment_path|attachment_bucket|attachment_name/);
assert.ok(sql.indexOf("parent revision in trips") < sql.indexOf("UPDATE public.trips"), "parent validation must precede updates");
assert.doesNotMatch(sql, /DELETE FROM public\.checklist_items/);
assert.match(deleteSql, /DELETE FROM public\.checklist_items WHERE id = 'item-1' AND checklist_id IN \(SELECT id FROM public\.checklists WHERE trip_id = 'tc-test-import-sql' AND scope = 'shared'\)/);
assert.ok(deleteSql.indexOf("parent revision in checklist_items") < deleteSql.indexOf("DELETE FROM public.checklist_items"), "parent validation must precede deletes");

const reordered = structuredClone(data);
reordered.checklist_items.reverse();
assert.equal(checksumFixture(data), checksumFixture(reordered), "checksum must ignore row order using business keys");
assert.deepEqual(normalizeFixtureRows(reordered).checklist_items.map((row) => row.id), ["item-1"]);

const bootstrapSql = buildFixtureImportSql([{
  manifest: { fixtureId: tripId, version: 1 },
  data,
  previousData: null,
}]);
assert.match(bootstrapSql, /Fixture initial import target already exists/);
assert.match(bootstrapSql, /INSERT INTO public\.trips/);

console.log("testdata import SQL generation checks passed (transaction, locks, parent checks, local-only fields, business keys, bootstrap)");
