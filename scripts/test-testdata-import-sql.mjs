import assert from "node:assert/strict";
import { buildFixtureImportSql, checksumFixture, latestFixtureTimestamp, normalizeFixtureRows } from "./lib/testdata-download-apply.mjs";

const tripId = "trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab";
const previousData = normalizeFixtureRows({
  trips: [{ id: tripId, title: "Old", departure_date: "2026-11-01", currency_config: {}, sidebar_config: {}, content: { testPurpose: "three-way-sync", participants: ["local-only"], participantEmailMap: { ignored: "local-only" } }, participants: ["local-only"], created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", is_public: false }],
  checklists: [{ id: "checklist-1", trip_id: tripId, scope: "shared", title: "Old list", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }],
  checklist_items: [{ id: "item-1", checklist_id: "checklist-1", client_item_id: "item-client-1", label: "Old item", is_checked: false, sort_order: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null, category: "general" }],
  expenses: [{ trip_id: tripId, title: "Old expense", amount: 10, payer: "local-only", currency: "TWD", created_at: "2026-11-01T00:00:00Z", expense_date: "2026-11-01", client_item_id: "expense-1", updated_at: "2026-11-01T00:00:00Z", deleted_at: null }],
  exchange_purchases: [],
  other_info_items: [],
});
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
assert.match(sql, /SELECT \* INTO existing_trip FROM public\.trips WHERE id = 'trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab' FOR UPDATE/);
assert.match(sql, /PERFORM 1 FROM public\.trips t WHERE .* FOR UPDATE/);
assert.doesNotMatch(sql, /parent revision|parentChecksum|parentVersion|checksum mismatch|row count mismatch/);
assert.match(sql, /checklist_id = 'checklist-1' AND client_item_id = 'item-client-2'/);
assert.match(sql, /INSERT INTO public\.trips/);
assert.match(sql, /DISABLE TRIGGER trips_touch_updated_at/);
assert.match(sql, /ENABLE TRIGGER trips_touch_updated_at/);
assert.match(sql, /INSERT INTO public\.trips \(id, title, departure_date, currency_config, sidebar_config, content, created_at, updated_at, is_public\)/);
assert.match(sql, /INSERT INTO public\.checklists \(id, trip_id, scope, title, created_at, updated_at\)/);
assert.match(sql, /INSERT INTO public\.checklist_items \([^)]*created_at, updated_at/);
assert.match(sql, /INSERT INTO public\.expenses \([^)]*created_at[^)]*updated_at/);
assert.equal(latestFixtureTimestamp(data), "2026-11-01T00:00:00.000Z");
assert.match(sql, /existing_trip\.content -> '__testFixture' IS DISTINCT FROM 'true'::jsonb/,
  "existing explicitly marked legacy synthetic trips must be safe import targets");
assert.match(sql, /content = \(public\.trips\.content - 'testPurpose' - 'fixtureDescription' - 'checklistData' - '__testFixture'\) \|\| EXCLUDED\.content/,
  "download must replace the legacy marker with the current testPurpose marker");
assert.doesNotMatch(sql, /INSERT INTO public\.trips \([^)]*participants/);
assert.doesNotMatch(sql, /UPDATE SET[^;]*participants/);
assert.doesNotMatch(sql, /payer/);
assert.doesNotMatch(JSON.stringify(normalizeFixtureRows(data)), /participants|participantEmailMap|checklistData|payer/);
assert.equal(Object.hasOwn(normalizeFixtureRows(data).expenses[0], "payer"), false);
assert.match(sql, /INSERT INTO public\.checklist_items/);
assert.match(sql, /END \$tc_fixture\$;/);
assert.doesNotMatch(sql, /owner_user_id|created_by|attachment_path|attachment_bucket|attachment_name/);
assert.match(sql, /DELETE FROM public\.checklist_items i WHERE .* NOT IN/);
assert.match(deleteSql, /DELETE FROM public\.checklist_items i WHERE .*checklist_id IN/);
assert.doesNotMatch(deleteSql, /NOT IN \(NULL\)/);
assert.match(deleteSql, /DELETE FROM public\.checklists c WHERE .*scope = 'shared' AND c\.id NOT IN/);
assert.match(deleteSql, /DELETE FROM public\.expenses e WHERE .*trip_id = 'trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab' AND e\.client_item_id NOT IN/);
assert.match(deleteSql, /DELETE FROM public\.exchange_purchases e WHERE e\.trip_id = 'trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab';/);
assert.match(deleteSql, /DELETE FROM public\.other_info_items o WHERE o\.trip_id = 'trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab';/);
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
assert.match(bootstrapSql, /Fixture target exists but is not marked test data/);
assert.match(bootstrapSql, /INSERT INTO public\.trips/);
assert.doesNotMatch(bootstrapSql, /parentVersion|parentChecksum|initial import target already exists/);

const secondTripId = "custom-test-trip-第二筆";
const secondData = normalizeFixtureRows({
  trips: [{ id: secondTripId, title: "Second Trip", departure_date: "2026-11-02", currency_config: {}, sidebar_config: {}, content: { testPurpose: "three-way-sync" }, created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", is_public: false }],
  checklists: [{ id: "checklist-2", trip_id: secondTripId, scope: "shared", title: "Second list" }],
  checklist_items: [{ id: "item-2", checklist_id: "checklist-2", client_item_id: "item-client-2", label: "Second item", is_checked: false, sort_order: 0 }],
  expenses: [],
  exchange_purchases: [],
  other_info_items: [],
});
const multiFixtureSql = buildFixtureImportSql([
  { manifest: { fixtureId: tripId }, data: previousData },
  { manifest: { fixtureId: secondTripId }, data: secondData },
]);
assert.ok(multiFixtureSql.includes(`"id":"${tripId}"`));
assert.ok(multiFixtureSql.includes(`"id":"${secondTripId}"`));
assert.ok(multiFixtureSql.startsWith("DO $tc_fixture$"));
assert.ok(multiFixtureSql.trimEnd().endsWith("END $tc_fixture$;"));
assert.equal(multiFixtureSql.split("END $tc_fixture$;").length - 1, 1,
  "multiple trips must be applied in one SQL transaction");

console.log("testdata import SQL generation checks passed (multi-fixture transaction, content snapshot, synthetic marker, local-only fields, business keys)");
