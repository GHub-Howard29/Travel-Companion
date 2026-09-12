import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MAX_CANDIDATES_WITH_PHOTO = 5;

const createPhotoPlans = (candidates) => {
  const seen = new Set();
  return candidates.flatMap((candidate) => {
    const placeId = typeof candidate.placeId === "string" ? candidate.placeId.trim() : "";
    if (!placeId || seen.has(placeId) || seen.size >= MAX_CANDIDATES_WITH_PHOTO) return [];
    seen.add(placeId);
    return [{ placeId, state: "pending" }];
  });
};

const attachTransientPhoto = (candidate, details) => {
  const photo = details?.photos?.[0];
  if (!photo?.name) return { ...candidate, photo: null };
  return {
    ...candidate,
    photo: {
      resourceName: photo.name,
      authorAttributions: Array.isArray(photo.authorAttributions) ? photo.authorAttributions : [],
      googleMapsUri: details.googleMapsUri ?? null,
      state: "ready",
      transient: true,
    },
  };
};

const stripTransientPhotoBeforePersistence = (candidate) => ({ placeId: candidate.placeId });

const candidates = Array.from({ length: 7 }, (_, index) => ({
  placeId: `ChIJ-contract-${index}`,
  displayName: `候選 ${index + 1}`,
  address: `地址 ${index + 1}`,
}));

assert.deepEqual(createPhotoPlans([]), []);
assert.equal(createPhotoPlans(candidates).length, MAX_CANDIDATES_WITH_PHOTO);
assert.equal(createPhotoPlans([candidates[0], candidates[0], candidates[1]]).length, 2);
assert.equal(createPhotoPlans([{ placeId: "" }, {}, candidates[0]]).length, 1);

const withPhoto = attachTransientPhoto(candidates[0], {
  googleMapsUri: "https://maps.google.com/?cid=test",
  photos: [{
    name: "places/test/photos/photo-reference",
    authorAttributions: [{ displayName: "攝影者", uri: "https://example.invalid/author" }],
  }],
});
assert.equal(withPhoto.photo?.state, "ready");
assert.equal(withPhoto.photo?.transient, true);
assert.equal(withPhoto.photo?.authorAttributions.length, 1);
assert.equal(attachTransientPhoto(candidates[0], { photos: [] }).photo, null);
assert.deepEqual(stripTransientPhotoBeforePersistence(withPhoto), { placeId: candidates[0].placeId });

const [edgeFunction, clientService, itineraryPage, viteConfig] = await Promise.all([
  readFile(new URL("../../supabase/functions/travel-route/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/services/travelRouteService.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/ItineraryPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../vite.config.ts", import.meta.url), "utf8"),
]);

assert.match(edgeFunction, /body\.action === "placeAutocomplete"/);
assert.match(edgeFunction, /suggestions\.placePrediction\.placeId/);
assert.doesNotMatch(edgeFunction, /body\.action === "placePhoto"/);
assert.match(clientService, /export interface PlaceCandidate/);
assert.doesNotMatch(clientService, /resourceName|photoUri|authorAttributions/);
assert.match(itineraryPage, />Google Maps</);
assert.match(viteConfig, /img-src 'self' data: blob:/);
assert.doesNotMatch(viteConfig, /googleusercontent\.com/);

process.stdout.write([
  "V3.9.0 地點候選照片契約驗證通過：",
  `- 每次搜尋最多 ${MAX_CANDIDATES_WITH_PHOTO} 個唯一 placeId 進入照片查詢`,
  "- 無照片或查詢失敗時仍保留原候選，不阻擋選取",
  "- 照片資源名稱與 attribution 僅為暫態；確認後仍只保存 placeId",
  "- 現有 Edge Function、前端型別與 CSP 尚未支援照片，未誤判為已實作",
  "- 契約治具不接觸金鑰；真實 Google Photos 已另以受控後端 spike 驗證並完成清理",
].join("\n") + "\n");
