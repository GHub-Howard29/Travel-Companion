import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clampItineraryCoverCrop,
  getItineraryCoverCropMaxZoom,
  getItineraryCoverCropRect,
  getWikimediaDerivativeSize,
} from "../src/utils/itineraryCoverCrop.ts";
import { isItineraryCoverPhoto } from "../src/utils/itineraryCoverPhoto.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");

assert.deepEqual(getWikimediaDerivativeSize(2400, 1600), { width: 1280, height: 853 });
assert.equal(getItineraryCoverCropMaxZoom(1280, 960), 1.5);
assert.deepEqual(getItineraryCoverCropRect(1280, 960, { zoom: 1, offsetX: 0, offsetY: 0 }), {
  x: 160,
  y: 0,
  size: 960,
});
assert.deepEqual(getItineraryCoverCropRect(1280, 960, { zoom: 1, offsetX: 1, offsetY: 0 }), {
  x: 320,
  y: 0,
  size: 960,
});
assert.deepEqual(clampItineraryCoverCrop({ zoom: 9, offsetX: -2, offsetY: 2 }, 1.5), {
  zoom: 1.5,
  offsetX: -1,
  offsetY: 1,
});

const oldCoverPhoto = {
  source: "wikimedia-commons",
  storagePath: "s_74726970/s_6974656d/12345678-1234-1234-1234-123456789abc.webp",
  fileTitle: "File:Cape Manzamo.jpg",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Cape_Manzamo.jpg",
  creator: "Photographer",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  selectedAt: "2026-09-12T00:00:00.000Z",
  modified: true,
  width: 640,
  height: 426,
  mime: "image/webp",
  size: 100_000,
};
assert.equal(isItineraryCoverPhoto(oldCoverPhoto), true, "既有封面缺少變更聲明仍須可讀");
assert.equal(isItineraryCoverPhoto({ ...oldCoverPhoto, credit: "Photographer", transformation: "cropped-resized-and-webp-transcoded", width: 640, height: 640 }), true);
assert.equal(isItineraryCoverPhoto({ ...oldCoverPhoto, transformation: "cropped-resized-and-webp-transcoded", width: 640, height: 640 }), false);
assert.equal(isItineraryCoverPhoto({ ...oldCoverPhoto, transformation: "free-text" }), false);

const edge = read("supabase/functions/travel-route/index.ts");
const service = read("src/services/itineraryCoverPhotoService.ts");
const page = read("src/components/ItineraryPage.tsx");
const cropEditor = read("src/components/CoverPhotoCropEditor.tsx");
const viewer = read("src/components/CoverPhotoViewer.tsx");

assert.match(edge, /iiurlwidth: "640"/);
assert.match(edge, /getCommonsDerivativeUrl\(info\.thumburl, 1280\)/);
assert.match(edge, /CC BY \(\?:1\\\.0\|2\\\.0\|2\\\.5\|3\\\.0\|4\\\.0\)/);
assert.doesNotMatch(edge, /CC BY\(\?:-SA\)/);
assert.match(service, /candidate\.cropImageUrl/);
assert.match(service, /responseUrl\.hostname !== "upload\.wikimedia\.org"/);
assert.match(service, /MAX_SOURCE_PHOTO_BYTES/);
assert.match(service, /source\.size < MAX_ITINERARY_COVER_EDGE/);
assert.match(service, /cropped-resized-and-webp-transcoded/);
assert.match(page, /\{source\}目前未啟用，可改用其他來源。/);
assert.match(page, /\["Pexels", "Pixabay"\]/);
assert.match(page, /確認候選照片/);
assert.match(page, /確認裁切並儲存/);
assert.match(page, /role="radiogroup"/);
assert.match(cropEditor, /雙指縮放/);
assert.match(cropEditor, /方向鍵與加減鍵/);
assert.match(viewer, /已裁切、縮放並轉為 WebP/);
assert.match(viewer, /aria-modal="true"/);
assert.match(viewer, /event\.key === "Escape"/);

console.log("V3.9.1 來源選擇、確認裁切、照片放大與相容契約驗證通過。");
