import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMONS_API_URL,
  WIKIDATA_API_URL,
  classifyCommonsPrecisionHttpStatus,
  classifyCommonsPrecisionTransportFailure,
  isAllowedCommonsPrecisionApiUrl,
  isRetryableCommonsPrecisionState,
  planCommonsPrecisionRequest,
} from "../supabase/functions/travel-route/commonsPrecisionTransport.ts";
import { COMMONS_PRECISION_REQUEST_TIMEOUT_MS } from "../supabase/functions/travel-route/commonsPrecisionWikimedia.ts";

const resolvePlan = planCommonsPrecisionRequest({ layer: "resolve-entity", query: "第一航廈", language: "zh-Hant" });
assert.equal(resolvePlan.layer, "resolve-entity");
assert.equal(resolvePlan.timeoutMs, COMMONS_PRECISION_REQUEST_TIMEOUT_MS);
assert.equal(resolvePlan.url.startsWith(`${WIKIDATA_API_URL}?`), true);
assert.equal(new URL(resolvePlan.url).searchParams.get("action"), "wbsearchentities");

const evidencePlan = planCommonsPrecisionRequest({ layer: "read-entity-evidence", qids: ["Q100", "Q200"], targetLanguage: "zh-Hant" });
assert.equal(new URL(evidencePlan.url).searchParams.get("ids"), "Q100|Q200");
assert.equal(new URL(evidencePlan.url).searchParams.get("props"), "claims|labels|aliases");

const p18Plan = planCommonsPrecisionRequest({ layer: "read-p18-files", fileTitles: ["File:One.jpg", "File:Two.jpg"] });
assert.equal(p18Plan.url.startsWith(`${COMMONS_API_URL}?`), true);
assert.equal(new URL(p18Plan.url).searchParams.get("iiurlwidth"), "640");

const categoryPlan = planCommonsPrecisionRequest({ layer: "read-category-files", category: "Airport terminals", continuation: "opaque|next" });
assert.equal(new URL(categoryPlan.url).searchParams.get("cmtype"), "file");
const relatedCategoryPlan = planCommonsPrecisionRequest({ layer: "read-related-categories", category: "Taiwan Taoyuan International Airport" });
assert.equal(new URL(relatedCategoryPlan.url).searchParams.get("cmtype"), "subcat");
assert.equal(new URL(relatedCategoryPlan.url).searchParams.get("cmnamespace"), "14");
assert.equal(new URL(categoryPlan.url).searchParams.get("cmnamespace"), "6");
assert.equal(new URL(categoryPlan.url).searchParams.get("cmcontinue"), "opaque|next");

const depictsPlan = planCommonsPrecisionRequest({ layer: "read-structured-data", pageIds: [10, 11] });
assert.equal(new URL(depictsPlan.url).searchParams.get("ids"), "M10|M11");

const textPlan = planCommonsPrecisionRequest({ layer: "search-adopted-text", query: "第一航廈", offset: 6 });
assert.equal(new URL(textPlan.url).searchParams.get("gsroffset"), "6");
assert.equal(new URL(textPlan.url).searchParams.get("gsrnamespace"), "6");
for (const plan of [resolvePlan, evidencePlan, p18Plan, categoryPlan, depictsPlan, textPlan]) {
  assert.equal(isAllowedCommonsPrecisionApiUrl(plan.url), true);
  assert.equal(plan.url.includes("P279"), false);
}

assert.throws(() => planCommonsPrecisionRequest({ layer: "read-entity-evidence", qids: ["Q0"], targetLanguage: "en" }), /QID/);
assert.throws(() => planCommonsPrecisionRequest({ layer: "read-category-files", category: "x", continuation: "" }), /continuation/);
assert.throws(() => planCommonsPrecisionRequest({ layer: "read-structured-data", pageIds: [] }), /page ID/);
assert.equal(isAllowedCommonsPrecisionApiUrl("http://commons.wikimedia.org/w/api.php?x=1"), false);
assert.equal(isAllowedCommonsPrecisionApiUrl("https://example.com/w/api.php"), false);

assert.equal(classifyCommonsPrecisionHttpStatus(200), "ok");
assert.equal(classifyCommonsPrecisionHttpStatus(429), "rate-limited");
assert.equal(classifyCommonsPrecisionHttpStatus(504), "timeout");
assert.equal(classifyCommonsPrecisionHttpStatus(500), "upstream-error");
assert.equal(classifyCommonsPrecisionTransportFailure(new DOMException("aborted", "TimeoutError")), "timeout");
assert.equal(classifyCommonsPrecisionTransportFailure(new Error("network unavailable")), "upstream-error");
assert.equal(isRetryableCommonsPrecisionState("rate-limited"), true);
assert.equal(isRetryableCommonsPrecisionState("ok"), false);

const projectRoot = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(projectRoot, "supabase/functions/travel-route/commonsPrecisionTransport.ts"), "utf8");
assert.doesNotMatch(source, /fetch\(|setTimeout|Retry-After|supabase|localStorage|indexedDB/i);

console.log("V3.9.1 transport-neutral Wikimedia request plan 與錯誤分類驗證通過。");
