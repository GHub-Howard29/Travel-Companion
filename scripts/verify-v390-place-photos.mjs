import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createItineraryCopy } from "../src/utils/itineraryOrder.ts";
import {
  getUnusedItineraryCoverPaths,
  isItineraryCoverPhoto,
  sanitizeItineraryCoverPhotos,
} from "../src/utils/itineraryCoverPhoto.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");

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

assert.equal(isItineraryCoverPhoto(coverPhoto), true);
assert.equal(isItineraryCoverPhoto({ ...coverPhoto, size: 122_881 }), false);
assert.equal(isItineraryCoverPhoto({ ...coverPhoto, sourcePageUrl: "javascript:alert(1)" }), false);

const item = {
  id: "source",
  time: "10:00",
  departureTime: "11:00",
  title: "萬座毛",
  type: "景點",
  typeColor: "",
  desc: "",
  location: "萬座毛",
  coverPhoto,
};
const copied = createItineraryCopy(item, "13:00", "14:00", () => "copy");
assert.equal(copied.coverPhoto, coverPhoto, "跨日副本應沿用同一照片引用");

const baseTrip = {
  id: "trip",
  title: "Trip",
  departureDate: "2026-09-12",
  isPublic: true,
  sidebarConfig: [],
  content: { days: [1, 2], custom_tab_1: { subtitle: "", mainText: "" }, checklistData: [], daysData: { "1": [item], "2": [copied] } },
};
const oneReferenceLeft = { ...baseTrip, content: { ...baseTrip.content, daysData: { "1": [], "2": [copied] } } };
const noReferencesLeft = { ...baseTrip, content: { ...baseTrip.content, daysData: { "1": [], "2": [] } } };
assert.deepEqual(getUnusedItineraryCoverPaths(baseTrip, oneReferenceLeft), []);
assert.deepEqual(getUnusedItineraryCoverPaths(baseTrip, noReferencesLeft), [coverPhoto.storagePath]);

const invalidContent = { ...baseTrip.content, daysData: { "1": [{ ...item, coverPhoto: { ...coverPhoto, mime: "image/jpeg" } }], "2": [] } };
assert.equal(sanitizeItineraryCoverPhotos(invalidContent).daysData["1"][0].coverPhoto, undefined);

const edge = read("supabase/functions/travel-route/index.ts");
const client = read("src/services/travelRouteService.ts");
const page = read("src/components/ItineraryPage.tsx");
const migration = read("supabase/migrations/20260912093527_v390_itinerary_cover_storage.sql");
const viteConfig = read("vite.config.ts");
const sqlValidation = read("docs/sql/030_v390_itinerary_cover_storage_validation.sql");
const workflow = read(".github/workflows/v390-supabase-validation.yml");

assert.match(edge, /body\.action === "placePhotos"/);
assert.match(edge, /MAX_PLACE_PHOTO_CANDIDATES = 5/);
assert.match(edge, /skipHttpRedirect/);
assert.match(edge, /body\.action === "commonsPhotoSearch"/);
assert.match(edge, /isAllowedCommonsLicense/);
assert.match(edge, /normalizeCommonsThumbnailUrl/);
assert.match(edge, /thumb\.wikimedia\.org/);
assert.match(edge, /upload\.wikimedia\.org/);
assert.match(client, /getPlaceCandidatePhotos/);
assert.match(client, /searchCommonsPhotoCandidates/);
assert.match(page, /在 Google Maps 查看照片/);
assert.match(page, /照片來源 ↗/);
assert.match(page, /float-left mb-2 mr-3 w-\[76px\]/);
assert.doesNotMatch(page, /grid-cols-\[76px_minmax\(0,1fr\)\]/);
assert.match(page, /flex items-start justify-between gap-3 border-t border-slate-100 pt-2/);
assert.doesNotMatch(page, /mt-2 text-\[11px\] leading-relaxed text-slate-500/);
assert.match(migration, /public\.tc_can_write_shared_trip/);
assert.match(migration, /revoke all on table public\.place_photo_monthly_usage from public, anon, authenticated/);
assert.match(viteConfig, /https:\/\/\*\.googleusercontent\.com/);
assert.match(viteConfig, /getSupabaseHttpSource\(supabaseUrl\)/);
assert.match(sqlValidation, /Storage RLS did not enforce Trip writer boundary/);
assert.match(workflow, /supabase db advisors --local/);
assert.doesNotMatch(read("src/types/trip.ts"), /interface ConfirmedPlace[\s\S]{0,200}photoUri/);

console.log("V3.9.0 地點照片雙軌、引用清理與安全邊界驗證通過。");
