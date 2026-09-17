import assert from "node:assert/strict";
import { runCommonsPrecisionEngine } from "../supabase/functions/travel-route/commonsPrecisionEngine.ts";

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
assert.equal(ambiguous.response.state, "entity-ambiguous");
assert.deepEqual(ambiguous.response.entityChoices, [
  { qid: "Q200", label: "桃園機場", description: "臺灣的國際機場" },
  { qid: "Q201", label: "桃園機場" },
]);
assert.equal(ambiguous.requestCount, 2);
const selected = await runCommonsPrecisionEngine({ query: "桃園機場", language: "zh-Hant", selectedEntityQid: "Q200" }, { request: ambiguousRequest, now: () => 1_000 });
assert.equal(selected.qid, "Q200");
assert.deepEqual(selected.response.resolvedEntity, { qid: "Q200", label: "桃園機場", description: "臺灣的國際機場" });
console.log("V3.9.1 Commons 精準搜尋整體協調引擎契約驗證通過。");
