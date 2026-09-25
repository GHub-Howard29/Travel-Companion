import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { projectCommonsPrecisionResponse } from "../supabase/functions/travel-route/commonsPrecision.ts";
import { runCommonsPrecisionEngine } from "../supabase/functions/travel-route/commonsPrecisionEngine.ts";

const commonsFile = {
  pageid: 301,
  ns: 6,
  title: "File:Ambiguous station view.jpg",
  imageinfo: [{
    mime: "image/jpeg",
    mediatype: "BITMAP",
    thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Ambiguous.jpg/640px-Ambiguous.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Ambiguous_station_view.jpg",
    width: 2400,
    height: 1600,
    extmetadata: {
      Artist: { value: "Commons contributor" },
      Credit: { value: "Commons contributor" },
      LicenseShortName: { value: "CC BY 4.0" },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
      ImageDescription: { value: "同名車站的外觀" },
    },
  }],
};

const ambiguous = await runCommonsPrecisionEngine({ query: "中山站", language: "zh-Hant" }, {
  now: () => 1_000,
  request: async (plan) => {
    const url = new URL(plan.url);
    if (url.searchParams.get("action") === "wbsearchentities") return {
      state: "ok",
      payload: { search: [
        { id: "Q9001", label: "中山站", aliases: [] },
        { id: "Q9002", label: "中山站", aliases: [] },
      ] },
    };
    if (url.hostname === "www.wikidata.org") return {
      state: "ok",
      payload: { entities: {
        Q9001: { labels: { "zh-hant": { value: "中山站" } }, aliases: {}, claims: {} },
        Q9002: { labels: { "zh-hant": { value: "中山站" } }, aliases: {}, claims: {} },
      } },
    };
    if (url.searchParams.get("generator") === "search") return {
      state: "ok",
      payload: { query: { pages: [commonsFile] }, continue: { gsroffset: 6 } },
    };
    throw new Error(`未預期的請求：${plan.url}`);
  },
});

assert.equal(ambiguous.response.state, "results");
assert.equal(ambiguous.response.searchMode, "broad");
assert.equal(ambiguous.response.candidates.length, 1);
assert.equal(ambiguous.response.candidates[0].tier, "manual-review");
assert.equal(ambiguous.qid, undefined);
assert.equal(ambiguous.continuation?.tier, "manual-review");

assert.throws(() => projectCommonsPrecisionResponse({
  state: "results",
  candidates: ambiguous.response.candidates,
  searchMode: "broad",
  nextPageToken: "cp2.abcdefghijklmnop",
}), /nextPageToken/);

const root = resolve(import.meta.dirname, "..");
const ui = readFileSync(resolve(root, "src/components/ItineraryPage.tsx"), "utf8");
assert.match(ui, /image\.onload = null;\s*image\.onerror = null;/);
assert.match(ui, /讀取照片中…/);
assert.match(ui, /無法讀取這張照片，請返回來源並重新選擇/);
assert.doesNotMatch(ui, /請選擇要搜尋的地點範圍/);
assert.doesNotMatch(ui, /<span className="mt-1 block text-\[11px\] font-semibold text-slate-500">自行上傳<\/span>/);

console.log("V3.9.11 候選分層、歧義名稱模糊搜尋、換批門檻與上傳載入生命週期驗證通過。");
