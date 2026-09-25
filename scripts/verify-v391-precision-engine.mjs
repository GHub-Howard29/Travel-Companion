import assert from "node:assert/strict";
import { runCommonsPrecisionContinuationEngine, runCommonsPrecisionEngine } from "../supabase/functions/travel-route/commonsPrecisionEngine.ts";

const filePage = {
  pageid: 10, ns: 6, title: "File:Terminal One.jpg",
  imageinfo: [{
    mime: "image/jpeg", mediatype: "BITMAP",
    thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Terminal.jpg/640px-Terminal.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Terminal_One.jpg",
    width: 2400, height: 1600,
    extmetadata: {
      Artist: { value: "Alice" }, Credit: { value: "Alice" }, LicenseShortName: { value: "CC BY 4.0" },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" }, ImageDescription: { value: "第一航廈" },
    },
  }],
};

const requests = [];
const request = async (plan) => {
  requests.push(plan);
  const url = new URL(plan.url);
  const action = url.searchParams.get("action");
  if (action === "wbsearchentities") return { state: "ok", payload: { search: [{ id: "Q100", label: "第一航廈", aliases: [] }] } };
  if (url.hostname === "www.wikidata.org" && action === "wbgetentities") return {
    state: "ok",
    payload: { entities: { Q100: { labels: { "zh-hant": { value: "第一航廈" } }, aliases: {}, claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: "Q1248784" } } } }],
      P18: [{ mainsnak: { datavalue: { value: "Terminal One.jpg" } } }],
    } } } },
  };
  if (url.searchParams.has("titles")) return { state: "ok", payload: { query: { pages: [filePage] } } };
  if (url.searchParams.get("generator") === "search") return { state: "ok", payload: { query: { pages: [] } } };
  if (url.hostname === "commons.wikimedia.org" && action === "wbgetentities") return { state: "ok", payload: { entities: { M10: { claims: {} } } } };
  throw new Error(`未預期的 request plan: ${plan.url}`);
};

const result = await runCommonsPrecisionEngine({ query: "第一航廈", language: "zh-Hant" }, { request, now: () => 1_000 });
assert.equal(result.response.state, "results");
assert.equal(result.qid, "Q100");
assert.equal(result.response.candidates[0].fileTitle, "File:Terminal One.jpg");
assert.equal(result.response.candidates[0].reviewStatus, "needs-review");
assert.equal(result.requestCount, 5);
assert.equal(requests.every((plan) => plan.timeoutMs === 3_000), true);
assert.equal(requests.every((plan) => ["www.wikidata.org", "commons.wikimedia.org"].includes(new URL(plan.url).hostname)), true);

const limited = await runCommonsPrecisionEngine({ query: "第一航廈", language: "zh-Hant" }, {
  request: async () => ({ state: "rate-limited", status: 429 }), now: () => 1_000,
});
assert.equal(limited.response.state, "rate-limited");
assert.equal(limited.upstreamStatus, 429);
assert.equal(limited.requestCount, 1);

const ambiguousRequest = async (plan) => {
  const url = new URL(plan.url);
  if (url.searchParams.get("action") === "wbsearchentities") return {
    state: "ok",
    payload: { search: [
      { id: "Q200", label: "桃園機場", description: "臺灣的國際機場", aliases: [] },
      { id: "Q201", label: "桃園機場", aliases: [] },
    ] },
  };
  if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "wbgetentities") return {
    state: "ok",
    payload: { entities: {
      Q200: { labels: { "zh-hant": { value: "桃園機場" } }, aliases: {}, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q1248784" } } } }] } },
      Q201: { labels: { "zh-hant": { value: "桃園機場" } }, aliases: {}, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q1248784" } } } }] } },
    } },
  };
  if (url.searchParams.get("generator") === "search") return { state: "ok", payload: { query: { pages: [] } } };
  throw new Error(`未預期的歧義 request plan: ${plan.url}`);
};
const ambiguous = await runCommonsPrecisionEngine({ query: "桃園機場", language: "zh-Hant" }, { request: ambiguousRequest, now: () => 1_000 });
assert.equal(ambiguous.response.state, "no-suitable-image");
assert.equal(ambiguous.response.searchMode, "broad");
assert.equal("entityChoices" in ambiguous.response, false);
assert.equal(ambiguous.requestCount, 3);

const taoyuanRelatedFile = {
  ...filePage,
  pageid: 20,
  title: "File:Taiwan Taoyuan International Airport terminal hall.jpg",
  imageinfo: [{
    ...filePage.imageinfo[0],
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Taiwan_Taoyuan_International_Airport_terminal_hall.jpg",
    extmetadata: {
      ...filePage.imageinfo[0].extmetadata,
      ImageDescription: { value: "Taiwan Taoyuan International Airport terminal hall" },
    },
  }],
};
const extensionRequests = [];
const extension = await runCommonsPrecisionContinuationEngine({
  query: "桃園國際機場",
  tier: "manual-review",
  entityEvidence: {
    qid: "Q11515",
    instanceOfQids: ["Q1248784"],
    p18FileTitles: [],
    p373Categories: ["Taiwan Taoyuan International Airport"],
    names: [
      { value: "桃園國際機場", languageTag: "zh-hant" },
      { value: "Taiwan Taoyuan International Airport", languageTag: "en" },
    ],
  },
  layer: "read-related-category-files",
  continuation: JSON.stringify({ parentCategory: "Taiwan Taoyuan International Airport" }),
  seenPageIds: [],
}, {
  now: () => 1_000,
  request: async (plan) => {
    extensionRequests.push(plan);
    if (plan.layer === "read-related-categories") return {
      state: "ok",
      payload: { query: { categorymembers: [{ pageid: 100, ns: 14, title: "Category:Interior of Taiwan Taoyuan International Airport" }] } },
    };
    if (plan.layer === "read-category-files") return {
      state: "ok",
      payload: { query: { categorymembers: [{ pageid: 20, ns: 6, title: taoyuanRelatedFile.title }] } },
    };
    if (plan.layer === "read-p18-files") return { state: "ok", payload: { query: { pages: [taoyuanRelatedFile] } } };
    if (plan.layer === "read-structured-data") return { state: "ok", payload: { entities: { M20: { claims: {} } } } };
    throw new Error(`未預期的桃園機場延伸候選 request plan: ${plan.url}`);
  },
});
assert.equal(extension.response.state, "results");
assert.equal(extension.response.candidates.length, 1);
assert.equal(extension.response.candidates[0].tier, "manual-review");
assert.equal(extension.response.candidates[0].matchEvidence.some(({ kind }) => kind === "related-category"), true);
assert.deepEqual(extensionRequests.map(({ layer }) => layer), [
  "read-related-categories",
  "read-category-files",
  "read-p18-files",
]);
const exhaustedSession = await runCommonsPrecisionContinuationEngine({
  query: "桃園國際機場",
  tier: "manual-review",
  entityEvidence: extension.entityEvidence,
  layer: "read-related-category-files",
  continuation: JSON.stringify({ parentCategory: "Taiwan Taoyuan International Airport" }),
  seenPageIds: [],
  initialRequestCount: 12,
  initialDurationMs: 10_000,
}, {
  now: () => 1_000,
  request: async () => { throw new Error("session 預算耗盡後不得再發出請求"); },
});
assert.equal(exhaustedSession.response.state, "inspection-limit-reached");
assert.equal(exhaustedSession.requestCount, 0);
console.log("V3.9.1 Commons 精準搜尋整體協調引擎契約驗證通過。");
