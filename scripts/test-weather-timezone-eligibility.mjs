import assert from "node:assert/strict";
import { getDestinationLocalEligibility } from "../supabase/functions/weather-forecast/timezone-eligibility.ts";
import { formatWeatherFetchedAt } from "../src/utils/weatherTime.ts";

const taipeiLateEvening = new Date("2026-10-19T13:51:00.000Z");
assert.equal(getDestinationLocalEligibility(taipeiLateEvening, "2026-10-19", "23:00", "Asia/Taipei"), "eligible");
assert.equal(getDestinationLocalEligibility(taipeiLateEvening, "2026-10-19", "21:51", "Asia/Taipei"), "arrival_passed");
assert.equal(getDestinationLocalEligibility(taipeiLateEvening, "2026-10-19", "21:50", "Asia/Taipei"), "arrival_passed");

const tokyoLateEvening = new Date("2026-10-19T14:30:00.000Z");
assert.equal(getDestinationLocalEligibility(tokyoLateEvening, "2026-10-19", "23:00", "Asia/Tokyo"), "arrival_passed");
assert.equal(getDestinationLocalEligibility(tokyoLateEvening, "2026-10-20", "08:00", "Asia/Tokyo"), "eligible");

const losAngelesMorning = new Date("2026-10-19T13:51:00.000Z");
assert.equal(getDestinationLocalEligibility(losAngelesMorning, "2026-10-20", "08:00", "America/Los_Angeles"), "eligible");
assert.equal(getDestinationLocalEligibility(taipeiLateEvening, "2026-10-18", "23:00", "Asia/Taipei"), "date_passed");
assert.equal(getDestinationLocalEligibility(taipeiLateEvening, "2026-10-30", "08:00", "Asia/Taipei"), "long_range");

const fetchedAt = "2026-10-21T00:00:00.000Z";
const tokyoFetchedAt = formatWeatherFetchedAt(fetchedAt, "Asia/Tokyo");
assert.match(tokyoFetchedAt, /09:00/);
assert.match(tokyoFetchedAt, /日本標準時間/);
const losAngelesFetchedAt = formatWeatherFetchedAt(fetchedAt, "America/Los_Angeles");
assert.match(losAngelesFetchedAt, /17:00/);
assert.match(losAngelesFetchedAt, /太平洋夏令時間/);
assert.equal(
  formatWeatherFetchedAt(fetchedAt, "Invalid/Timezone"),
  "無法取得目的地時區，請通知系統管理員",
);
assert.equal(
  formatWeatherFetchedAt(fetchedAt),
  "無法取得目的地時區，請通知系統管理員",
);
assert.equal(formatWeatherFetchedAt("not-a-date", "Asia/Tokyo"), "時間未知");

console.log("Weather destination-timezone eligibility and display regression tests passed.");
