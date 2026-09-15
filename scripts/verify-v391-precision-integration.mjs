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
assert.doesNotMatch(client, /action: "commonsPhotoSearch"/);
assert.match(ui, /commonsNextPageToken/);
assert.match(ui, /符合依據/);
assert.match(ui, /entity-ambiguous/);
assert.match(ui, /project-quota-reached/);
assert.doesNotMatch(client + ui, /COMMONS_PRECISION_TOKEN_SECRET|WIKIMEDIA_CONTACT_URL/);
console.log("V3.9.1 Commons Edge、用量／快取、加密分頁與前端精準搜尋接線驗證通過。");
