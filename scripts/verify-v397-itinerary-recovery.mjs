import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260924050949_v397_itinerary_day_history.sql");
const itinerary = read("src/components/ItineraryPage.tsx");
const workspace = read("src/hooks/useTripWorkspace.ts");
const app = read("src/App.tsx");
const tool = read("scripts/itinerary-history-admin.mjs");

assert.match(migration, /create table private\.itinerary_day_history/);
assert.match(migration, /limit 30/);
assert.match(migration, /date_trunc\('hour'/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /revoke all .* authenticated/i);
assert.match(itinerary, /otherInfoFolderId/);
assert.match(itinerary, /查看地圖/);
assert.match(workspace, /consumeExternalReturnDay/);
assert.match(workspace, /getExternalReturnTripId/);
assert.match(app, /syncCloudOtherInfoItems/);
assert.doesNotMatch(app, /upsertCloudTripRecord/);
assert.match(tool, /expected-updated-at/);
assert.match(tool, /differenceFromCurrent/);
assert.match(tool, /RESTORE \$\{tripId\} DAY/);

const values = new Map();
globalThis.sessionStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const returnContext = await import(new URL("../src/utils/externalReturnContext.ts", import.meta.url));
returnContext.rememberExternalReturnContext("trip-b", 4);
assert.equal(returnContext.getExternalReturnTripId(["trip-a", "trip-b"]), "trip-b");
assert.equal(returnContext.consumeExternalReturnDay("trip-b", [1, 2, 3, 4]), 4);
assert.equal(returnContext.consumeExternalReturnDay("trip-b", [1, 2, 3, 4]), null);
console.log("V3.9.7 行程復原、Day 返回與子分類捷徑靜態契約通過。");
