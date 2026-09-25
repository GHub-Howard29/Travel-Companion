import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildCommonsCategoryMembersParams,
  buildCommonsDepictsParams,
  buildCommonsFileMetadataParams,
  buildCommonsTextSearchParams,
  buildWikidataEntityEvidenceParams,
  buildWikidataEntitySearchParams,
  composeCommonsPrecisionCandidates,
  parseCommonsFileMetadataResponse,
  sanitizeCommonsMetadataText,
} from "../supabase/functions/travel-route/commonsPrecisionPipeline.ts";

const search = buildWikidataEntitySearchParams("  第一航廈  ", "zh-Hant");
assert.equal(search.get("search"), "第一航廈");
assert.equal(search.get("language"), "zh-hant");
assert.equal(search.get("limit"), "10");
assert.equal([...search.keys()].filter((key) => key === "search").length, 1, "不得自動加入替代搜尋詞");

const entity = buildWikidataEntityEvidenceParams(["Q100", "Q100", "Q200", "Q0"], "ja");
assert.equal(entity.get("ids"), "Q100|Q200");
assert.equal(entity.get("languages"), "ja|zh-hant|en");
assert.equal(entity.toString().includes("P279"), false, "不得遞迴查詢 subclass of");

const metadataParams = buildCommonsFileMetadataParams(["File:Terminal One.jpg"]);
assert.equal(metadataParams.get("iiurlwidth"), "640");
assert.match(metadataParams.get("iiprop") ?? "", /extmetadata/);

const categoryParams = buildCommonsCategoryMembersParams("Category:Terminal One", "opaque|next");
assert.equal(categoryParams.get("cmtitle"), "Category:Terminal One");
assert.equal(categoryParams.get("cmtype"), "file");
assert.equal(categoryParams.get("cmnamespace"), "6");
assert.equal(categoryParams.get("cmcontinue"), "opaque|next");

const depictsParams = buildCommonsDepictsParams([10, 10, 11, -1]);
assert.equal(depictsParams.get("ids"), "M10|M11");
assert.equal(depictsParams.get("props"), "claims");

const textParams = buildCommonsTextSearchParams("第一航廈", 6);
assert.equal(textParams.get("gsrsearch"), "第一航廈 filetype:bitmap");
assert.equal(textParams.get("gsrnamespace"), "6");
assert.equal(textParams.get("gsroffset"), "6");
assert.throws(() => buildCommonsTextSearchParams("x"), /2 至 120/);

assert.deepEqual(sanitizeCommonsMetadataText("<b>Alice &amp; Bob</b>\u0000 作品"), {
  value: "Alice & Bob 作品",
  truncated: false,
});
assert.deepEqual(sanitizeCommonsMetadataText("123456", 5), { value: "12345", truncated: true });

const info = ({
  pageid,
  title,
  mime = "image/jpeg",
  mediatype = "BITMAP",
  thumburl = `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/${pageid}.jpg/640px-${pageid}.jpg`,
  descriptionurl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  width = 2400,
  height = 1600,
  artist = "<span>Alice &amp; Bob</span>",
  credit = "Alice &amp; Bob",
  license = "CC BY 4.0",
  licenseUrl = "https://creativecommons.org/licenses/by/4.0/",
  description = "Terminal One exterior",
}) => ({
  pageid,
  ns: 6,
  title,
  imageinfo: [{
    mime,
    mediatype,
    thumburl,
    descriptionurl,
    width,
    height,
    extmetadata: {
      Artist: { value: artist },
      Credit: { value: credit },
      LicenseShortName: { value: license },
      LicenseUrl: { value: licenseUrl },
      ImageDescription: { value: description },
    },
  }],
});

const payload = {
  query: {
    pages: [
      info({ pageid: 10, title: "File:Terminal One.jpg" }),
      info({ pageid: 11, title: "File:Category view.jpg", description: "<p>第一航廈正面</p>" }),
      info({ pageid: 12, title: "File:Text only.jpg", description: "unrelated" }),
      info({ pageid: 13, title: "File:Share alike.jpg", license: "CC BY-SA 4.0" }),
      info({ pageid: 14, title: "File:Missing creator.jpg", artist: "" }),
      info({ pageid: 15, title: "File:Wrong host.jpg", thumburl: "https://example.com/640.jpg" }),
      info({ pageid: 19, title: "File:Legacy CDN.jpg", thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/19.jpg/640px-19.jpg" }),
      info({ pageid: 16, title: "File:Too small.jpg", width: 1100, height: 900 }),
      info({ pageid: 17, title: "File:Truncated description.jpg", description: `第一航廈${"x".repeat(600)}` }),
      info({ pageid: 18, title: "File:Vector.svg", mime: "image/svg+xml", mediatype: "DRAWING" }),
    ],
  },
};

const parsed = parseCommonsFileMetadataResponse(payload);
assert.deepEqual(parsed.files.map(({ pageId }) => pageId), [10, 11, 12, 13, 19, 16, 17]);
assert.equal(parsed.files[0].creator, "Alice & Bob");
assert.equal(parsed.files[0].cropImageUrl.includes("/1280px-10.jpg"), true);
assert.equal(parsed.files.find(({ pageId }) => pageId === 17)?.descriptionWasTruncated, true);
assert.equal(parsed.files.find(({ pageId }) => pageId === 19)?.thumbnailUrl.startsWith("https://upload.wikimedia.org/"), true);
assert.deepEqual(parsed.rejected.map(({ pageId, reason }) => [pageId, reason]), [
  [14, "missing-attribution"],
  [15, "invalid-thumbnail-url"],
  [18, "unsupported-media"],
]);

const composed = composeCommonsPrecisionCandidates({
  metadataPayload: payload,
  seeds: [
    { pageId: 10, fileTitle: "File:Terminal One.jpg", directP18: true, exactCategories: [], fromAdoptedTextSearch: false },
    { pageId: 11, fileTitle: "File:Category view.jpg", directP18: false, exactCategories: ["Terminal One", "Airport terminals"], fromAdoptedTextSearch: false },
    { pageId: 12, fileTitle: "File:Text only.jpg", directP18: false, exactCategories: [], fromAdoptedTextSearch: true },
    { pageId: 13, fileTitle: "File:Share alike.jpg", directP18: true, exactCategories: [], fromAdoptedTextSearch: false },
    { pageId: 16, fileTitle: "File:Too small.jpg", directP18: true, exactCategories: [], fromAdoptedTextSearch: false },
    { pageId: 17, fileTitle: "File:Truncated description.jpg", directP18: false, exactCategories: [], fromAdoptedTextSearch: true },
  ],
  depictsByPageId: new Map([[11, ["Q100"]]]),
  entityEvidence: {
    qid: "Q100",
    names: [
      { value: "第一航廈", languageTag: "zh-hant" },
      { value: "Terminal One", languageTag: "en" },
    ],
  },
});
assert.deepEqual(composed.candidates.map(({ fileTitle }) => fileTitle), [
  "File:Terminal One.jpg",
  "File:Category view.jpg",
]);
const categoryCandidate = composed.candidates[1];
assert.deepEqual(
  categoryCandidate.matchEvidence.filter(({ kind }) => kind === "exact-category").map(({ category }) => category),
  ["Terminal One", "Airport terminals"],
  "多個直接 P373 Category 證據必須保留，但評分只加一次",
);
assert.equal(categoryCandidate.scoreBreakdown.filter(({ rule }) => rule === "exact-category").length, 1);
assert.equal(composed.rejected.some(({ fileTitle, reason }) => fileTitle === "File:Text only.jpg" && reason === "no-strong-evidence"), true);
assert.equal(composed.rejected.some(({ fileTitle, reason }) => fileTitle === "File:Share alike.jpg" && reason === "license-not-allowed"), true);
assert.equal(composed.rejected.some(({ fileTitle, reason }) => fileTitle === "File:Too small.jpg" && reason === "image-too-small"), true);
assert.equal(composed.rejected.some(({ fileTitle, reason }) => fileTitle === "File:Truncated description.jpg" && reason === "no-strong-evidence"), true);

const duplicateMetadataCandidates = composeCommonsPrecisionCandidates({
  metadataPayload: { query: { pages: [info({ pageid: 20, title: "File:Same.jpg" }), info({ pageid: 20, title: "File:Same.jpg" })] } },
  seeds: [{ pageId: 20, fileTitle: "File:Same.jpg", directP18: true, exactCategories: ["Terminal One"], fromAdoptedTextSearch: false }],
  depictsByPageId: new Map(),
  entityEvidence: { qid: "Q100", names: [{ value: "Terminal One", languageTag: "en" }] },
});
assert.equal(duplicateMetadataCandidates.candidates.length, 1, "同一 Commons page ID 不得因多個證據層重複顯示");

const projectRoot = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(projectRoot, "supabase/functions/travel-route/commonsPrecisionPipeline.ts"), "utf8");
assert.doesNotMatch(source, /fetch\(|createClient|localStorage|indexedDB/i);
assert.doesNotMatch(source, /P279/);

console.log("V3.9.1 Wikimedia 請求參數、Commons 中介資料清理與候選組裝驗證通過。");
