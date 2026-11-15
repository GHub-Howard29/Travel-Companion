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
      participantEmailMap: { simulated: "mock-participant-reference" },
      nested: { contactPhone: "mock-contact-reference" },
      carRental: {
        provider: "Mock Rental",
        reservationNumber: "MOCK-RENTAL-2026-001",
        pickup: { date: "2026-12-01", location: "Kagoshima Airport" },
        return: { date: "2026-12-05", location: "Kagoshima Airport" },
      },
    },
    participants: [{ name: "local only" }],
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: timestamp,
    updated_at: timestamp,
    is_public: false,
  }, {
    id: "trip-public",
    title: "Public trip",
    departure_date: "2026-12-02",
    currency_config: { code: "TWD", symbol: "NT$" },
    sidebar_config: [],
    content: { daysData: { "1": [] } },
    created_at: timestamp,
    updated_at: timestamp,
    is_public: true,
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
assert.equal(data.trips[0].content.testPurpose, "three-way-sync");
assert.deepEqual(data.trips[0].content.participantEmailMap, { simulated: "mock-participant-reference" });
assert.deepEqual(data.trips[0].content.nested, { contactPhone: "mock-contact-reference" });
assert.equal(data.trips[0].content.carRental.reservationNumber, "MOCK-RENTAL-2026-001");
assert.deepEqual(data.trips[0].content.carRental.pickup, { date: "2026-12-01", location: "Kagoshima Airport" });
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
assert.match(sql, /DELETE FROM public\.checklists c WHERE c\.scope = 'shared'/);
assert.match(sql, /DELETE FROM public\.checklist_items i USING public\.checklists c/);
assert.match(sql, /DELETE FROM public\.expenses e WHERE NOT EXISTS/);
assert.match(sql, /DELETE FROM public\.exchange_purchases e WHERE NOT EXISTS/);
assert.match(sql, /DELETE FROM public\.other_info_items o WHERE NOT EXISTS/);
assert.match(sql, /LOCK TABLE public\.trips, public\.checklists, public\.checklist_items, public\.expenses, public\.exchange_purchases, public\.other_info_items, public\.itinerary_card_edit_leases, public\.route_estimate_cache, private\.itinerary_day_history/);
assert.match(sql, /DELETE FROM public\.checklists c WHERE c\.scope = 'shared'/);
assert.match(sql, /DELETE FROM public\.trips t WHERE t\.id NOT IN \('free-travel-2026-01', 'group-tour-2026-10'\)/);
assert.ok(sql.indexOf("DELETE FROM public.trips t WHERE t.id NOT IN") < sql.indexOf("INSERT INTO public.trips"));
assert.doesNotMatch(sql, /t\.is_public = false|c\.trip_id IN \(SELECT id FROM public\.trips WHERE is_public=false\)/);
assert.ok(sql.indexOf("INSERT INTO public.trips") < sql.indexOf("INSERT INTO public.checklists"));
assert.doesNotMatch(sql, /pg_constraint/);
assert.doesNotMatch(sql, /information_schema\.columns/);
assert.match(sql, /content = EXCLUDED\.content/);
assert.match(sql, /UPDATE tc_testdata\.sync_state SET local_last_changed_at = '2026-11-12T00:00:00\.123456Z'::timestamptz, last_synced_at = '2026-11-12T00:00:00\.123456Z'::timestamptz/);
assert.match(sql, /END; \$tc_dataset\$;\s*$/);
assert.doesNotMatch(sql, /^BEGIN;|^COMMIT;/m);
assert.doesNotMatch(sql, /checksum|revision/i);
assert.match(sql, /reservationNumber/);
assert.match(sql, /participantEmailMap/);

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
assert.doesNotThrow(() => validateDatabaseDataset(publicTrip));

const wrongTrip = structuredClone(data);
wrongTrip.expenses[0].trip_id = "trip-other";
assert.throws(() => validateDatabaseDataset(wrongTrip), /同步範圍以外/);

const privateChecklist = structuredClone(data);
privateChecklist.checklists[0].scope = "private";
assert.throws(() => validateDatabaseDataset(privateChecklist), /必須是 shared/);

const simulatedPhoneContent = structuredClone(data);
simulatedPhoneContent.trips[0].content.mockContact = "Mock phone: 0912345678";
assert.throws(
  () => validateDatabaseDataset(simulatedPhoneContent),
  /Email、電話或憑證/,
);

const emailContent = structuredClone(data);
emailContent.other_info_items[0].content = "contact me at user@example.com";
assert.throws(() => validateDatabaseDataset(emailContent), /Email、電話或憑證/);

const phoneContent = structuredClone(data);
phoneContent.other_info_items[0].content = "Call 0912-345-678";
assert.throws(() => validateDatabaseDataset(phoneContent), /Email、電話或憑證/);

console.log("test-testdata-download: dataset validation and transactional SQL assertions passed");
