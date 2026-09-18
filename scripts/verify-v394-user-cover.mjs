import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clampItineraryCoverCrop,
  getItineraryCoverCropMaxZoom,
  getItineraryCoverPlacement,
} from "../src/utils/itineraryCoverCrop.ts";
import { isItineraryCoverPhoto } from "../src/utils/itineraryCoverPhoto.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");

assert.equal(getItineraryCoverCropMaxZoom(320, 180), 2.5);
assert.deepEqual(clampItineraryCoverCrop({ zoom: 9, offsetX: -2, offsetY: 2 }, 2.5), {
  zoom: 2.5,
  offsetX: -1,
  offsetY: 1,
});
assert.deepEqual(getItineraryCoverPlacement(1600, 900, { zoom: 1, offsetX: 0, offsetY: 0 }), {
  x: 0,
  y: 140,
  width: 640,
  height: 360,
}, "100% 必須完整置入橫向照片");
assert.deepEqual(getItineraryCoverPlacement(900, 1600, { zoom: 1, offsetX: 0, offsetY: 0 }), {
  x: 140,
  y: 0,
  width: 360,
  height: 640,
}, "100% 必須完整置入直向照片");

const userUpload = {
  source: "user-upload",
  storagePath: "s_74726970/s_6974656d/12345678-1234-1234-1234-123456789abc.webp",
  selectedAt: "2026-09-18T00:00:00.000Z",
  modified: true,
  transformation: "blurred-background-resized-and-webp-transcoded",
  width: 640,
  height: 640,
  mime: "image/webp",
  size: 90_000,
};
assert.equal(isItineraryCoverPhoto(userUpload), true);
assert.equal(isItineraryCoverPhoto({ ...userUpload, transformation: "cropped-resized-and-webp-transcoded" }), false);
assert.equal(isItineraryCoverPhoto({ ...userUpload, source: "pixabay" }), false);

const page = read("src/components/ItineraryPage.tsx");
const editor = read("src/components/CoverPhotoCropEditor.tsx");
const renderer = read("src/utils/itineraryCoverRenderer.ts");
const service = read("src/services/itineraryCoverPhotoService.ts");
const tripTypes = read("src/types/trip.ts");

assert.match(page, /Wikimedia Commons/);
assert.match(page, /value="user-upload"/);
assert.match(page, /請勿上傳侵權圖片，亦不得任意下載、複製或重製他人照片。/);
assert.match(page, /capture="environment"/);
assert.match(page, /從裝置或圖庫選擇/);
assert.match(page, /const selectedCoverCropSource = coverPhotoSource === "wikimedia-commons" && selectedCommonsPhoto/);
assert.match(page, /userCoverObjectUrlRef\.current !== objectUrl/);
assert.doesNotMatch(page, /\["Pexels", "Pixabay"\]/);
assert.match(editor, /76×76 卡片預覽/);
assert.match(editor, /100%～250%/);
assert.match(renderer, /context\.filter = `blur/);
assert.match(renderer, /getItineraryCoverPlacement/);
assert.match(service, /uploadUserItineraryCoverPhoto/);
assert.match(service, /upsert: false/);
assert.match(service, /source\.type && !source\.type\.startsWith\("image\/"\)/);
assert.match(tripTypes, /source: "user-upload"/);

console.log("V3.9.4 自行上傳、同圖模糊背景與 100%～250% 縮放契約驗證通過。");
