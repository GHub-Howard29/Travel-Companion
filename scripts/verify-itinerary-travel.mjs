import assert from "node:assert/strict";

import {
  formatTravelDistance,
  formatTravelDuration,
  getAdjacentTravelOriginIndexesNeedingEstimate,
  getPlaceKey,
  getPreferredTravelMode,
  getSavedTravelEstimate,
  getTravelTimeWarning,
  hasDistinctConfirmedPlaces,
  isFlightConnection,
  removeExpiredTravelEstimates,
} from "../src/utils/itineraryTravel.ts";
import { sanitizeStoredTripRecord } from "../src/storage/tripStorage.ts";

const placeA = { placeId: "ChIJ-place-a" };
const placeB = { placeId: "ChIJ-place-b" };
const validEstimate = {
  mode: "drive",
  durationSeconds: 21 * 60,
  distanceMeters: 8_400,
  originKey: getPlaceKey(placeA),
  destinationKey: getPlaceKey(placeB),
  queriedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
const origin = {
  time: "10:00",
  departureTime: "11:10",
  title: "A",
  type: "景點",
  typeColor: "",
  desc: "",
  location: "A",
  place: placeA,
  travelToNext: validEstimate,
};
const destination = {
  time: "11:20",
  departureTime: "12:00",
  title: "B",
  type: "景點",
  typeColor: "",
  desc: "",
  location: "B",
  place: placeB,
};

assert.equal(getSavedTravelEstimate(origin, destination), validEstimate);
assert.equal(hasDistinctConfirmedPlaces(origin, destination), true);
assert.equal(hasDistinctConfirmedPlaces(origin, { ...destination, place: placeA }), false);
assert.deepEqual(getTravelTimeWarning(origin, destination, validEstimate), {
  type: "insufficient",
  shortfallMinutes: 11,
});
assert.deepEqual(
  getTravelTimeWarning(
    { ...origin, departureTime: "12:30" },
    destination,
    validEstimate,
  ),
  { type: "conflict" },
);
assert.equal(
  getSavedTravelEstimate(
    { ...origin, travelToNext: { ...validEstimate, expiresAt: "2020-01-01T00:00:00.000Z" } },
    destination,
  ),
  null,
);
assert.equal(
  getSavedTravelEstimate(origin, { ...destination, place: { placeId: "ChIJ-changed" } }),
  null,
);
assert.equal(
  getSavedTravelEstimate(
    {
      ...origin,
      travelToNext: {
        ...validEstimate,
        mode: "transit",
        departureTimeBasis: "10:30",
      },
    },
    destination,
  ),
  null,
);
assert.equal(isFlightConnection(
  { ...origin, travelKind: "flight" },
  { ...destination, travelKind: "flight" },
), true);
assert.equal(formatTravelDuration(21 * 60), "21 分鐘");
assert.equal(formatTravelDuration(90 * 60), "1 小時 30 分鐘");
assert.equal(formatTravelDistance(800), "800 公尺");
assert.equal(formatTravelDistance(8_400), "8.4 公里");
const expiredContent = removeExpiredTravelEstimates({
    daysData: {
      "1": [{
        ...origin,
        travelToNext: {
          ...validEstimate,
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
      }],
    },
  });
assert.equal(expiredContent.daysData["1"][0].travelToNext, undefined);
assert.equal(expiredContent.daysData["1"][0].travelModeToNext, "drive");
assert.equal(getPreferredTravelMode(expiredContent.daysData["1"][0]), "drive");
assert.deepEqual(
  getAdjacentTravelOriginIndexesNeedingEstimate(
    [
      { ...origin, travelToNext: undefined },
      destination,
      { ...destination, title: "C", place: { placeId: "ChIJ-place-c" } },
    ],
    1,
  ),
  [0, 1],
);
assert.deepEqual(
  getAdjacentTravelOriginIndexesNeedingEstimate([origin, destination], 1),
  [],
);
const unchangedContent = { daysData: { "1": [{ ...origin, travelToNext: undefined }] } };
assert.equal(removeExpiredTravelEstimates(unchangedContent), unchangedContent);
const expiredRecord = sanitizeStoredTripRecord({
  meta: { id: "test-trip" },
  detail: { id: "test-trip", content: {
    daysData: { "1": [{
      ...origin,
      travelToNext: { ...validEstimate, expiresAt: "2020-01-01T00:00:00.000Z" },
    }] },
  } },
  editorEmails: [],
  updatedAt: "2026-08-28T00:00:00.000Z",
});
assert.equal(expiredRecord.detail.content.daysData["1"][0].travelToNext, undefined);
assert.equal(expiredRecord.detail.content.daysData["1"][0].travelModeToNext, "drive");

console.log("行程交通區段、快取失效與時間警告驗證通過。");
