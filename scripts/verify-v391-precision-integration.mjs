import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const edge = read("supabase/functions/travel-route/index.ts");
const client = read("src/services/travelRouteService.ts");
const ui = read("src/components/ItineraryPage.tsx");
for (const expected of [
  'body.action === "commonsPrecisionSearch"', "runCommonsPrecisionEngine", "runCommonsPrecisionContinuationEngine",
  "claimCommonsPrecisionUpstreamSlot", "acquireCommonsPrecisionUpstreamLock", "acquireCommonsPrecisionOperationLock",
  'requiredEnv("WIKIMEDIA_CONTACT_URL")', 'requiredEnv("COMMONS_PRECISION_TOKEN_SECRET")',
  "recordCommonsPrecisionUsage", "sealCommonsPrecisionNextPageToken", "openCommonsPrecisionNextPageToken",
]) assert.match(edge, new RegExp(expected.replace(/[()]/g, "\\$&")));
assert.match(client, /action: "commonsPrecisionSearch"/);
assert.match(client, /nextPageToken/);
assert.match(client, /commons-precision-v2/);
assert.match(client, /tier: "precise" \| "manual-review"/);
assert.match(client, /searchMode: "entity-guided" \| "broad"/);
assert.doesNotMatch(client, /selectedEntityQid/);
assert.doesNotMatch(client, /action: "commonsPhotoSearch"/);
assert.match(ui, /commonsNextPageToken/);
assert.doesNotMatch(ui, /commonsExtensionPageToken/);
assert.match(ui, /精準候選/);
assert.match(ui, /需人工確認/);
assert.match(ui, /已列出目前可用的/);
assert.match(ui, /符合依據/);
assert.match(ui, /改用原搜尋詞提供廣泛候選/);
assert.doesNotMatch(ui, /請選擇要搜尋的地點範圍/);
assert.doesNotMatch(ui, /選擇地點範圍：/);
assert.match(ui, /project-quota-reached/);
assert.doesNotMatch(client + ui, /COMMONS_PRECISION_TOKEN_SECRET|WIKIMEDIA_CONTACT_URL/);
console.log("V3.9.1 Commons Edge、用量／快取、加密分頁與前端精準搜尋接線驗證通過。");
