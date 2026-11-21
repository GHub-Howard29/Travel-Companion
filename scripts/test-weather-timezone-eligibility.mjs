import assert from "node:assert/strict";
import { getDestinationLocalEligibility } from "../supabase/functions/weather-forecast/timezone-eligibility.ts";

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

// Cards sharing one place/date still qualify independently; one card cannot make the other eligible.
const sameTargetNow = new Date("2026-11-20T02:00:00.000Z"); // 10:00 in Taipei
const sameTargetCardA = getDestinationLocalEligibility(sameTargetNow, "2026-11-20", "09:00", "Asia/Taipei");
const sameTargetCardB = getDestinationLocalEligibility(sameTargetNow, "2026-11-20", "12:00", "Asia/Taipei");
assert.equal(sameTargetCardA, "arrival_passed");
assert.equal(sameTargetCardB, "eligible");

console.log("Weather destination-timezone eligibility regression tests passed.");
