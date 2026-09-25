import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const edge = readFileSync(resolve(root, "supabase/functions/travel-route/index.ts"), "utf8");
const client = readFileSync(resolve(root, "src/services/travelRouteService.ts"), "utf8");
const page = readFileSync(resolve(root, "src/components/ItineraryPage.tsx"), "utf8");

for (const action of ["commonsPhotoSearch", "commonsPhotoCategories", "commonsCategoryPhotos"]) {
  assert.match(edge, new RegExp(`body\\.action === "${action}"`));
}
assert.match(edge, /COMMONS_BATCH_SIZE = 24/);
assert.match(edge, /cmtype: "file"/);
assert.match(client, /action: "commonsPhotoSearch"/);
assert.match(client, /action: "commonsPhotoCategories"/);
assert.match(client, /action: "commonsCategoryPhotos"/);
assert.doesNotMatch(client, /commonsPrecisionSearch|commonsSuggestSearchTerms/);
assert.match(page, /載入下一批 24 張/);
assert.match(page, /查看照片類別/);
assert.match(page, /返回類別/);
assert.match(page, /displayedCommonsCandidates/);
assert.match(page, /displayedCategoryCandidates/);
console.log("V3.9.12 三階段 Commons 搜尋、分類與分頁靜態契約驗證通過。");
