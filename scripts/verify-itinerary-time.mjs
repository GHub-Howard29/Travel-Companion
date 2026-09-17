import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatCompleteNumericTimeInput,
  getItineraryTimeValue,
  isDepartureBeforeArrival,
  normalizeItineraryTime,
  sortItineraryItemsByTime,
  validateItineraryTime,
  validateRequiredItineraryTimeRange,
} from "../src/utils/itineraryTime.ts";

const itineraryPage = readFileSync(resolve(import.meta.dirname, "../src/components/ItineraryPage.tsx"), "utf8");

assert.equal(formatCompleteNumericTimeInput("1400"), "14:00");
assert.equal(formatCompleteNumericTimeInput("0930"), "09:30");
assert.equal(formatCompleteNumericTimeInput("０９３０"), "09:30");
assert.equal(formatCompleteNumericTimeInput("2400"), "2400");
assert.equal(formatCompleteNumericTimeInput("2460"), "2460");
assert.equal(formatCompleteNumericTimeInput("14000"), "14000");
assert.equal(formatCompleteNumericTimeInput("1 400"), "1 400");
assert.equal(formatCompleteNumericTimeInput("14-00"), "14-00");

assert.equal(getItineraryTimeValue("08:00"), 8 * 60);
assert.equal(getItineraryTimeValue("8:00"), 8 * 60);
assert.equal(getItineraryTimeValue("08：00"), 8 * 60);
assert.equal(getItineraryTimeValue("08 : 00"), null);
assert.equal(getItineraryTimeValue("08 ： 00"), null);
assert.equal(getItineraryTimeValue("24:00"), null);
assert.equal(getItineraryTimeValue("08:60"), null);
assert.equal(getItineraryTimeValue(""), null);

assert.equal(normalizeItineraryTime("8：00"), "08:00");
assert.equal(normalizeItineraryTime(" 08:00 "), "08:00");
assert.equal(normalizeItineraryTime("08 : 00"), "08 : 00");
assert.equal(isDepartureBeforeArrival("08:00", "06:00"), true);
assert.equal(isDepartureBeforeArrival("08：00", "06：00"), true);
assert.equal(isDepartureBeforeArrival("08:00", "08:00"), false);
assert.equal(isDepartureBeforeArrival("08:00", "09:00"), false);
assert.equal(isDepartureBeforeArrival("", "06:00"), false);
assert.equal(isDepartureBeforeArrival("08:00", ""), false);
assert.equal(isDepartureBeforeArrival("格式錯誤", "06:00"), false);
assert.deepEqual(validateItineraryTime(""), { isValid: true, normalized: "" });
assert.deepEqual(validateItineraryTime("  "), { isValid: true, normalized: "" });
assert.deepEqual(validateItineraryTime("8：00"), { isValid: true, normalized: "08:00" });
assert.deepEqual(validateItineraryTime("08 : 00"), {
  isValid: false,
  normalized: "08 : 00",
});
for (const invalidTime of ["08-00", "上午八點", "24:00", "08:60", "8:", ":00"]) {
  assert.equal(validateItineraryTime(invalidTime).isValid, false, invalidTime);
}

assert.deepEqual(validateRequiredItineraryTimeRange("", ""), {
  isValid: false,
  arrivalTime: "",
  departureTime: "",
  arrivalError: "required",
  departureError: "required",
});
assert.deepEqual(validateRequiredItineraryTimeRange("9：05", "11：30"), {
  isValid: true,
  arrivalTime: "09:05",
  departureTime: "11:30",
  arrivalError: undefined,
  departureError: undefined,
});
assert.deepEqual(validateRequiredItineraryTimeRange("０９３０", "1400"), {
  isValid: true,
  arrivalTime: "09:30",
  departureTime: "14:00",
  arrivalError: undefined,
  departureError: undefined,
});
assert.equal(
  validateRequiredItineraryTimeRange("09:00", "格式錯誤").departureError,
  "invalid-format",
);
assert.equal(validateRequiredItineraryTimeRange("2400", "2460").arrivalError, "invalid-range");
assert.equal(validateRequiredItineraryTimeRange("2400", "2460").departureError, "invalid-range");
assert.equal(
  validateRequiredItineraryTimeRange("09:00", "08:59").departureError,
  "before-arrival",
);
assert.equal(validateRequiredItineraryTimeRange("09:00", "09:00").isValid, true);

assert.match(itineraryPage, /id="copy-arrival-time-input"[\s\S]{0,500}type="text"[\s\S]{0,500}inputMode="numeric"/);
assert.match(itineraryPage, /id="copy-departure-time-input"[\s\S]{0,500}type="text"[\s\S]{0,500}inputMode="numeric"/);
assert.match(itineraryPage, /formatCompleteNumericTimeInput/);
assert.match(itineraryPage, /onCompositionStart/);
assert.match(itineraryPage, /onCompositionEnd/);
assert.match(itineraryPage, /role="alertdialog"/);
assert.match(itineraryPage, /請檢查時間格式/);
assert.match(itineraryPage, /copyTimeAlertErrors\.map/);
assert.doesNotMatch(itineraryPage, /copyTargetDays\.length === 0 \|\| !copyTimeValidation\.isValid/);

const sortedItems = sortItineraryItemsByTime([
  { id: "afternoon", time: "15:00" },
  { id: "morning-fullwidth", time: "08：00" },
  { id: "spaced-invalid", time: "07 : 00" },
  { id: "empty", time: "" },
]);

assert.deepEqual(
  sortedItems.map((item) => item.id),
  ["morning-fullwidth", "afternoon", "spaced-invalid", "empty"],
);

console.log("行程時間格式與排序驗證通過。");
