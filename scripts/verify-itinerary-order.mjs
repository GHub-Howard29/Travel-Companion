import assert from "node:assert/strict";

import {
  createItineraryCopy,
  ensureItineraryDaysDataIds,
  insertItineraryCopyByTime,
  moveItineraryItem,
  reorderItineraryItems,
} from "../src/utils/itineraryOrder.ts";

const idFactory = (prefix = "id") => {
  let index = 0;
  return () => `${prefix}-${++index}`;
};

const route = {
  mode: "drive",
  durationSeconds: 600,
  distanceMeters: 1000,
  originKey: "place:origin-1234567890",
  destinationKey: "place:destination-1234567890",
  queriedAt: "2026-09-10T00:00:00.000Z",
  expiresAt: "2026-09-11T00:00:00.000Z",
};

const item = (id, time, title, extra = {}) => ({
  id,
  time,
  departureTime: time,
  title,
  type: "景點",
  typeColor: "",
  desc: "",
  location: title,
  ...extra,
});

const normalized = ensureItineraryDaysDataIds(
  {
    "1": [item(undefined, "09:00", "A"), item("duplicate", "10:00", "B")],
    "2": [item("duplicate", "11:00", "C"), item(undefined, "", "D")],
  },
  idFactory("stable"),
);
const normalizedIds = Object.values(normalized).flat().map((entry) => entry.id);
assert.equal(new Set(normalizedIds).size, 4, "舊卡片及重複 ID 應補成全旅程唯一 ID");

const original = [
  item("a", "09:00", "A", { travelModeToNext: "walk", travelToNext: route }),
  item("b", "10:00", "B", { travelModeToNext: "transit", travelToNext: route }),
  item("c", "11:00", "C"),
];
const reordered = reorderItineraryItems(original, "c", "a");
assert.deepEqual(reordered.map((entry) => entry.id), ["c", "a", "b"]);
assert.equal(reordered[1].travelToNext, route, "目的地未改變的路線快取應保留");
assert.equal(reordered[1].travelModeToNext, "walk", "交通方式偏好應保留");
assert.equal(reordered[0].travelToNext, undefined, "新位置不得沿用來源 Day 的路線快取");
assert.equal(reordered[2].travelToNext, undefined, "目的地改變的來源卡片應清除路線快取");

const movedBack = moveItineraryItem(reordered, "c", 1);
assert.deepEqual(movedBack.map((entry) => entry.id), ["a", "c", "b"]);

const copied = createItineraryCopy(original[0], () => "copy-a");
assert.equal(copied.id, "copy-a");
assert.equal(copied.travelModeToNext, undefined);
assert.equal(copied.travelToNext, undefined);
assert.equal(copied.title, "A");

const sameTimeInserted = insertItineraryCopyByTime(
  [item("x", "09:00", "X"), item("y", "09:00", "Y"), item("z", "10:00", "Z")],
  item("copy", "09:00", "Copy"),
);
assert.deepEqual(sameTimeInserted.map((entry) => entry.id), ["x", "y", "copy", "z"]);

const blankTimeInserted = insertItineraryCopyByTime(
  [item("x", "09:00", "X"), item("blank", "", "Blank")],
  item("copy", "", "Copy"),
);
assert.deepEqual(blankTimeInserted.map((entry) => entry.id), ["x", "blank", "copy"]);

console.log("每日行程排序與跨日複製純函式驗證通過。");
