import assert from "node:assert/strict";

import {
  copyItineraryItemToDays,
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

const coverPhoto = {
  source: "wikimedia-commons",
  storagePath: "s_74726970/s_6974656d/12345678-1234-1234-1234-123456789abc.webp",
  fileTitle: "File:Cape Manzamo.jpg",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Cape_Manzamo.jpg",
  creator: "Photographer",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  selectedAt: "2026-09-12T00:00:00.000Z",
  modified: true,
  width: 640,
  height: 426,
  mime: "image/webp",
  size: 100_000,
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
  item("a", "09:00", "A", {
    typeColor: "bg-purple-50 text-purple-700",
    desc: "保留說明",
    location: "熊本城",
    place: { placeId: "place-a" },
    travelKind: "flight",
    travelModeToNext: "walk",
    travelToNext: route,
    coverPhoto,
  }),
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

const copied = createItineraryCopy(original[0], "13:30", "15:00", () => "copy-a");
assert.equal(copied.id, "copy-a");
assert.equal(copied.time, "13:30");
assert.equal(copied.departureTime, "15:00");
assert.equal(copied.travelModeToNext, undefined);
assert.equal(copied.travelToNext, undefined);
assert.equal(copied.title, "A");
assert.equal(copied.typeColor, "bg-purple-50 text-purple-700");
assert.equal(copied.desc, "保留說明");
assert.equal(copied.location, "熊本城");
assert.deepEqual(copied.place, { placeId: "place-a" });
assert.equal(copied.travelKind, "flight");
assert.equal(copied.coverPhoto, coverPhoto, "跨日副本應沿用同一照片引用");
assert.equal(original[0].time, "09:00", "來源卡片時間不得被修改");

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

const daysBeforeCopy = {
  "1": [original[0]],
  "2": [
    item("early", "08:00", "Early", { travelModeToNext: "walk", travelToNext: route }),
    item("late", "16:00", "Late"),
  ],
  "3": [
    item("same-a", "13:30", "Same A"),
    item("same-b", "13:30", "Same B"),
    item("untimed", "", "Untimed"),
  ],
};
const copiedToDays = copyItineraryItemToDays(
  daysBeforeCopy,
  [2, 3],
  original[0],
  "13:30",
  "15:00",
  idFactory("copy"),
);
assert.deepEqual(
  copiedToDays["2"].map((entry) => entry.id),
  ["early", "copy-1", "late"],
  "較早時間之後、較晚時間之前應正確插入",
);
assert.deepEqual(
  copiedToDays["3"].map((entry) => entry.id),
  ["same-a", "same-b", "copy-2", "untimed"],
  "相同時間應放在所有既有同時段卡片之後",
);
assert.equal(copiedToDays["2"][0].travelToNext, undefined, "插入點前一張卡片應清除舊路線");
assert.equal(copiedToDays["2"][0].travelModeToNext, "walk", "交通方式偏好應保留");
assert.equal(copiedToDays["2"][1].departureTime, "15:00");
assert.equal(copiedToDays["3"][2].departureTime, "15:00");
assert.notEqual(copiedToDays["2"][1].id, copiedToDays["3"][2].id, "每個 Day 應建立獨立 ID");
assert.deepEqual(daysBeforeCopy["2"].map((entry) => entry.id), ["early", "late"]);
assert.deepEqual(daysBeforeCopy["3"].map((entry) => entry.id), ["same-a", "same-b", "untimed"]);

console.log("每日行程排序與跨日複製純函式驗證通過。");
