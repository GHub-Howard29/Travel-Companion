import assert from "node:assert/strict";

import {
  isPlace,
  isValidIsoDate,
  isValidTime,
  normalizeTransitVehicle,
  parseDurationSeconds,
} from "../supabase/functions/travel-route/validation.ts";

assert.equal(isPlace({ placeId: "ChIJ_valid-place" }), true);
assert.equal(isPlace({ placeId: "short" }), false);
assert.equal(isValidTime("00:00"), true);
assert.equal(isValidTime("23:59"), true);
assert.equal(isValidTime("24:00"), false);
assert.equal(isValidTime("99:99"), false);
assert.equal(isValidIsoDate("2028-02-29"), true);
assert.equal(isValidIsoDate("2027-02-29"), false);
assert.equal(isValidIsoDate("2026-02-31"), false);
assert.equal(parseDurationSeconds("1260s"), 1260);
assert.equal(parseDurationSeconds("1.5s"), 2);
assert.equal(parseDurationSeconds("0s"), null);
assert.equal(normalizeTransitVehicle("BUS"), "bus");
assert.equal(normalizeTransitVehicle("SUBWAY"), "subway");
assert.equal(normalizeTransitVehicle("HEAVY_RAIL"), "rail");

console.log("Routes Edge Function 輸入與回應格式驗證通過。");
