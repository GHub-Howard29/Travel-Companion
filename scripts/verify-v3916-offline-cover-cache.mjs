import assert from "node:assert/strict";
import fs from "node:fs";

const cacheService = fs.readFileSync("src/services/itineraryCoverOfflineCache.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const workspace = fs.readFileSync("src/hooks/useTripWorkspace.ts", "utf8");
const sharedCleanup = fs.readFileSync("src/storage/sharedTripDataStorage.ts", "utf8");
const vite = fs.readFileSync("vite.config.ts", "utf8");

assert.match(cacheService, /getItineraryCoverPaths\(trip\)/);
assert.match(cacheService, /getItineraryCoverPublicUrl\(supabaseUrl, path\)/);
assert.match(cacheService, /await cache\.match\(url\)/);
assert.match(cacheService, /fetch\(url, \{/);
assert.match(cacheService, /cache: "no-store"/);
assert.match(cacheService, /contentType !== "image\/webp"/);
assert.match(cacheService, /MAX_ITINERARY_COVER_BYTES/);
assert.match(cacheService, /previousUrls[\s\S]*!desiredSet\.has\(url\)[\s\S]*cache\.delete\(url\)/);
assert.match(cacheService, /MAX_ITINERARY_COVER_CACHE_ENTRIES = 250/);
assert.match(cacheService, /clearItineraryCoverOfflineCache/);

assert.match(app, /syncItineraryCoverOfflineCache\(currentTrip, supabaseUrl\)/);
assert.match(app, /if \(!currentTrip \|\| !isOnline/);

assert.match(workspace, /clearItineraryCoverOfflineCache\(tripId\)/);
assert.match(sharedCleanup, /clearItineraryCoverOfflineCache\(tripId\)/);

assert.match(vite, /storage\/v1\/object\/public\/itinerary-covers/);
assert.match(vite, /handler: 'CacheFirst'/);
assert.match(vite, /cacheName: 'travel-companion-itinerary-covers-v1'/);
assert.match(vite, /maxEntries: 250/);

assert.doesNotMatch(cacheService, /commonsCategory|commonsSearch|cropImageUrl/);

console.log("V3.9.16 BUG032 行程卡片照片背景預載、CacheFirst 離線讀取與清理契約驗證通過。");
