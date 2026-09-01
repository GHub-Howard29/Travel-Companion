import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatTripDate,
  getMillisecondsUntilNextTaipeiDay,
  getRemovedDayImpacts,
  getTripEndDate,
  getTripLockDate,
  isHistoricalTrip,
} from "../src/utils/tripHelpers.ts";

const meta = {
  id: "v362-test",
  title: "V3.6.2 test",
  departureDate: "2026-08-29",
  dayCount: 4,
  participants: [],
  currencyConfig: { code: "TWD", symbol: "NT$" },
};

assert.equal(getTripEndDate(meta), "2026-09-01");
assert.equal(getTripLockDate(meta), "2026-09-02");
assert.equal(formatTripDate(getTripEndDate(meta)), "2026/9/1");
assert.equal(
  isHistoricalTrip(meta, new Date("2026-09-01T15:59:59.999Z")),
  false,
  "台灣時間最後一天 23:59:59 前仍可編輯",
);
assert.equal(
  isHistoricalTrip(meta, new Date("2026-09-01T16:00:00.000Z")),
  true,
  "台灣時間翌日 00:00 起鎖定",
);
assert.equal(
  getMillisecondsUntilNextTaipeiDay(new Date("2026-09-01T15:59:59.999Z")),
  1,
  "跨入台灣翌日的重新判定排程必須精確到午夜",
);

const emptyItem = (title) => ({
  time: "09:00",
  title,
  type: "景點",
  typeColor: "",
  desc: "",
  location: "",
});
const route = {
  mode: "drive",
  durationSeconds: 600,
  distanceMeters: 2_000,
  originKey: "a",
  destinationKey: "b",
  queriedAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
};
const detail = {
  id: meta.id,
  title: meta.title,
  departureDate: meta.departureDate,
  isPublic: true,
  sidebarConfig: [],
  content: {
    days: [1, 2, 3, 4, 5, 6, 7, 8],
    custom_tab_1: { subtitle: "", mainText: "" },
    checklistData: [],
    daysData: {
      "1": [], "2": [], "3": [], "4": [], "5": [],
      "6": [
        { ...emptyItem("A"), travelToNext: route },
        { ...emptyItem("B"), travelModeToNext: "walk" },
        emptyItem("C"),
      ],
      "7": [],
      "8": [emptyItem("D")],
    },
  },
};

assert.deepEqual(getRemovedDayImpacts(detail, 5), [
  { day: 6, cardCount: 3, routeCount: 2 },
  { day: 7, cardCount: 0, routeCount: 0 },
  { day: 8, cardCount: 1, routeCount: 0 },
]);
assert.deepEqual(getRemovedDayImpacts(detail, 7), [
  { day: 8, cardCount: 1, routeCount: 0 },
]);
assert.deepEqual(getRemovedDayImpacts(detail, 8), []);
assert.deepEqual(getRemovedDayImpacts(detail, 10), []);

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260901064451_v362_historical_trip_write_lock.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /time zone 'Asia\/Taipei'/);
assert.match(migration, /private\.tc_can_write_shared_trip/);
assert.match(migration, /create policy trips_update_policy/);
assert.match(migration, /old\.departure_date \+ stored_day_count - 1/);
assert.match(migration, /trips_reject_historical_trip_editor_update/);
assert.match(migration, /create policy expenses_insert_policy/);
assert.match(migration, /create policy expense_attachments_insert_v351/);
assert.doesNotMatch(
  migration,
  /create or replace function public\.tc_can_sync_private_checklist/,
  "V3.6.2 不得改寫私人清單同步規則",
);

console.log("V3.6.2 台灣跨日、縮短天數摘要與歷史共用資料鎖定驗證通過。");
