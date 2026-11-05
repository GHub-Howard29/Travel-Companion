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
assert.doesNotMatch(sql, /parent revision|parentChecksum|parentVersion|checksum mismatch|row count mismatch/);
assert.match(sql, /checklist_id = 'checklist-1' AND client_item_id = 'item-client-2'/);
assert.match(sql, /INSERT INTO public\.trips/);
assert.match(sql, /INSERT INTO public\.checklist_items/);
assert.match(sql, /END \$tc_fixture\$;/);
assert.doesNotMatch(sql, /owner_user_id|created_by|attachment_path|attachment_bucket|attachment_name/);
assert.match(sql, /DELETE FROM public\.checklist_items i WHERE .* NOT IN/);
assert.match(deleteSql, /DELETE FROM public\.checklist_items i WHERE .*checklist_id IN/);
assert.doesNotMatch(deleteSql, /NOT IN \(NULL\)/);
assert.match(deleteSql, /DELETE FROM public\.checklists c WHERE .*scope = 'shared' AND c\.id NOT IN/);
assert.match(deleteSql, /DELETE FROM public\.expenses e WHERE .*trip_id = 'tc-test-import-sql' AND e\.client_item_id NOT IN/);
assert.match(deleteSql, /DELETE FROM public\.exchange_purchases e WHERE e\.trip_id = 'tc-test-import-sql';/);
assert.match(deleteSql, /DELETE FROM public\.other_info_items o WHERE o\.trip_id = 'tc-test-import-sql';/);
assert.throws(() => buildFixtureImportSql([{
  manifest: { fixtureId: tripId },
  data: { ...deleteData, expenses: [{ ...data.expenses[0], trip_id: "tc-test-outside" }] },
}]), /outside its synthetic trip scope/);
assert.throws(() => buildFixtureImportSql([{
  manifest: { fixtureId: tripId },
  data: { ...deleteData, checklist_items: [{ ...data.checklist_items[0], checklist_id: "not-in-fixture" }] },
}]), /unknown checklist reference/);
assert.throws(() => buildFixtureImportSql([{
  manifest: { fixtureId: tripId },
  data: { ...deleteData, expenses: [{ ...data.expenses[0], client_item_id: null }] },
}]), /missing or duplicate expense client_item_id/);

const reordered = structuredClone(data);
reordered.checklist_items.reverse();
assert.equal(checksumFixture(data), checksumFixture(reordered), "checksum must ignore row order using business keys");
assert.deepEqual(normalizeFixtureRows(reordered).checklist_items.map((row) => row.id), ["item-1"]);

const bootstrapSql = buildFixtureImportSql([{
  manifest: { fixtureId: tripId, version: 1 },
  data,
  previousData: null,
}]);
assert.match(bootstrapSql, /Fixture target exists but is not marked synthetic/);
assert.match(bootstrapSql, /INSERT INTO public\.trips/);
assert.doesNotMatch(bootstrapSql, /parentVersion|parentChecksum|initial import target already exists/);

console.log("testdata import SQL generation checks passed (transaction, content snapshot, synthetic marker, local-only fields, business keys)");
