import assert from "node:assert/strict";
import {
  normalizeDatabaseDataset,
  validateDatabaseDataset,
  buildDatabaseDatasetImportSql,
} from "./lib/testdata-dataset.mjs";

const timestamp = "2026-11-12T00:00:00.123456Z";
const raw = {
  trips: [{
    id: "trip-a",
    title: "Test trip",
    departure_date: "2026-12-01",
    currency_config: { code: "JPY", symbol: "￥" },
    sidebar_config: [],
    content: {
      daysData: { "1": [] },
      testPurpose: "three-way-sync",
      participantEmailMap: { private: "private@example.com" },
      nested: { contactPhone: "0912-345-678" },
    },
    participants: [{ name: "local only" }],
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: timestamp,
    updated_at: timestamp,
    is_public: false,
  }],
  checklists: [{
    id: "checklist-a",
    trip_id: "trip-a",
    scope: "shared",
    title: "Shared checklist",
    created_at: timestamp,
    updated_at: timestamp,
  }],
  checklist_items: [{
    id: "item-a",
    checklist_id: "checklist-a",
    client_item_id: "client-item-a",
    label: "Passport",
    is_checked: false,
    sort_order: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    category: "travel",
  }],
  expenses: [{
    trip_id: "trip-a",
    title: "Train",
    amount: 1200,
    currency: "JPY",
    payer: "local identity only",
    created_at: timestamp,
    expense_date: "2026-12-01",
    client_item_id: "expense-a",
    updated_at: timestamp,
    deleted_at: null,
  }],
  exchange_purchases: [{
    id: "exchange-a",
    trip_id: "trip-a",
    client_item_id: "exchange-client-a",
    foreign_currency: "JPY",
    purchase_date: "2026-12-01",
    twd_amount: 2500,
    foreign_amount: 10000,
    created_at: timestamp,
    updated_at: timestamp,
  }],
  other_info_items: [{
    id: "other-a",
    trip_id: "trip-a",
    client_item_id: "other-client-a",
    folder_id: "",
    title: "Emergency note",
    content: "Keep a copy of the booking.",
    allowed_roles: ["owner"],
    sort_order: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }],
};

const data = normalizeDatabaseDataset(raw);
assert.equal(Object.hasOwn(data.trips[0], "participants"), false);
assert.equal(Object.hasOwn(data.trips[0], "created_by"), false);
assert.equal(Object.hasOwn(data.expenses[0], "payer"), false);
assert.equal(Object.hasOwn(data.trips[0].content, "testPurpose"), false);
assert.equal(Object.hasOwn(data.trips[0].content, "participantEmailMap"), false);
assert.deepEqual(data.trips[0].content.nested, {});
assert.deepEqual(validateDatabaseDataset(data), data);

const sql = buildDatabaseDatasetImportSql({
  data,
  gitLastChangedAt: timestamp,
  expectedLocalLastChangedAt: timestamp,
  expectedLastSyncedAt: timestamp,
});
assert.match(sql, /^DO \$tc_dataset\$/);
assert.match(sql, /EXECUTE 'LOCK TABLE public\.trips, public\.checklists, public\.checklist_items/);
assert.match(sql, /Local database changed after sync preflight/);
assert.match(sql, /DELETE FROM public\.checklist_items/);
assert.match(sql, /DELETE FROM public\.checklists/);
assert.match(sql, /DELETE FROM public\.expenses/);
assert.match(sql, /DELETE FROM public\.trips/);
assert.match(sql, /DELETE FROM public\.checklists c USING public\.trips t/);
assert.match(sql, /DELETE FROM public\.checklist_items i USING public\.checklists c, public\.trips t/);
assert.match(sql, /DELETE FROM public\.expenses e USING public\.trips t/);
assert.match(sql, /DELETE FROM public\.exchange_purchases e USING public\.trips t/);
assert.match(sql, /DELETE FROM public\.other_info_items o USING public\.trips t/);
assert.match(sql, /LOCK TABLE public\.trips, public\.checklists, public\.checklist_items, public\.expenses, public\.exchange_purchases, public\.other_info_items, public\.itinerary_card_edit_leases, public\.route_estimate_cache, private\.itinerary_day_history/);
assert.doesNotMatch(sql, /DELETE FROM public\.checklists c WHERE c\.scope = 'shared'/);
assert.match(sql, /DELETE FROM public\.trips t WHERE t\.is_public = false/);
assert.ok(sql.indexOf("DELETE FROM public.trips t WHERE t.is_public = false") < sql.indexOf("INSERT INTO public.trips"));
assert.ok(sql.indexOf("DELETE FROM public.trips t WHERE t.is_public = false") < sql.indexOf("DELETE FROM public.checklists c USING public.trips t"));
assert.ok(sql.indexOf("DELETE FROM public.checklists c USING public.trips t") > sql.indexOf("DELETE FROM public.trips t"));
assert.ok(sql.indexOf("INSERT INTO public.trips") < sql.indexOf("INSERT INTO public.checklists"));
assert.doesNotMatch(sql, /pg_constraint/);
assert.doesNotMatch(sql, /information_schema\.columns/);
assert.match(sql, /content = EXCLUDED\.content/);
assert.match(sql, /UPDATE tc_testdata\.sync_state SET local_last_changed_at = '2026-11-12T00:00:00\.123456Z'::timestamptz, last_synced_at = '2026-11-12T00:00:00\.123456Z'::timestamptz/);
assert.match(sql, /END; \$tc_dataset\$;\s*$/);
assert.doesNotMatch(sql, /^BEGIN;|^COMMIT;/m);
assert.doesNotMatch(sql, /checksum|revision|testPurpose/i);

const initialSql = buildDatabaseDatasetImportSql({
  data,
  gitLastChangedAt: timestamp,
  expectedLocalLastChangedAt: timestamp,
  expectedLastSyncedAt: null,
  initialize: true,
});
assert.doesNotMatch(initialSql, /Initial download requires an empty local private-trip dataset/);
assert.match(initialSql, /DELETE FROM public\.trips/);

const publicTrip = normalizeDatabaseDataset({
  ...data,
  trips: [{ ...data.trips[0], is_public: true }],
});
assert.throws(() => validateDatabaseDataset(publicTrip), /非公開行程/);

const wrongTrip = structuredClone(data);
wrongTrip.expenses[0].trip_id = "trip-other";
assert.throws(() => validateDatabaseDataset(wrongTrip), /同步範圍以外/);

const privateChecklist = structuredClone(data);
privateChecklist.checklists[0].scope = "private";
assert.throws(() => validateDatabaseDataset(privateChecklist), /scope 必須為 shared/);

const sensitiveContent = structuredClone(data);
sensitiveContent.trips[0].content.contactPhone = "0912345678";
const sanitizedSensitiveContent = normalizeDatabaseDataset(sensitiveContent);
assert.equal(Object.hasOwn(sanitizedSensitiveContent.trips[0].content, "contactPhone"), false);
assert.doesNotThrow(() => validateDatabaseDataset(sanitizedSensitiveContent));

const emailContent = structuredClone(data);
emailContent.other_info_items[0].content = "contact me at user@example.com";
assert.throws(() => validateDatabaseDataset(emailContent), /Email 或憑證/);

const phoneContent = structuredClone(data);
phoneContent.other_info_items[0].content = "Call 0912-345-678";
assert.throws(() => validateDatabaseDataset(phoneContent), /Email 或憑證/);

console.log("test-testdata-download: dataset validation and transactional SQL assertions passed");
