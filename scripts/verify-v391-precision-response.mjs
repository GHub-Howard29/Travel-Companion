import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  projectCommonsPrecisionCandidate,
  projectCommonsPrecisionResponse,
} from "../supabase/functions/travel-route/commonsPrecision.ts";
import { evaluateCommonsPrecisionCandidate } from "../supabase/functions/travel-route/commonsPrecision.ts";

const internal = {
  fileTitle: "File:Terminal One.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Terminal.jpg/640px-Terminal.jpg",
  cropImageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Terminal.jpg/1280px-Terminal.jpg",
  thumbnailMime: "image/jpeg",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Terminal_One.jpg",
  creator: "Alice",
  credit: "Alice",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  width: 2400,
  height: 1600,
  description: "Terminal One exterior",
  sourceSha1: "a".repeat(40),
  sourceRevisionAt: "2026-09-15T00:00:00Z",
  targetQid: "Q100",
  targetNames: [{ value: "Terminal One", languageTag: "en" }],
  directP18: true,
  exactCategories: ["Terminal One"],
  depictsQids: ["Q100"],
  reliableCapturedAt: "2026-01-01",
  currentAppearanceVerified: true,
  verifiedBroadAssociation: false,
  verifiedInteriorFragment: false,
  verifiedExclusions: [],
};
const evaluation = evaluateCommonsPrecisionCandidate(internal);
assert.equal(evaluation.accepted, true);
if (!evaluation.accepted) throw new Error("fixture should be accepted");

const publicCandidate = projectCommonsPrecisionCandidate(evaluation.candidate);
assert.deepEqual(Object.keys(publicCandidate).sort(), [
  "creator", "credit", "cropImageUrl", "description", "descriptionWasTruncated", "fileTitle",
  "height", "license", "licenseUrl", "matchEvidence", "reviewStatus", "score", "scoreBreakdown",
  "sourcePageUrl", "sourceRevisionAt", "sourceSha1", "thumbnailMime", "thumbnailUrl", "tier", "width",
].sort());
assert.equal("targetQid" in publicCandidate, false);
assert.equal("targetNames" in publicCandidate, false);
assert.equal("directP18" in publicCandidate, false);
assert.equal("exactCategories" in publicCandidate, false);
assert.equal(publicCandidate.reviewStatus, "needs-review");
assert.equal(publicCandidate.tier, "precise");
assert.equal(publicCandidate.matchEvidence.some(({ kind }) => kind === "p18"), true);

const pageCandidates = Array.from({ length: 6 }, (_, index) => ({
  ...evaluation.candidate,
  fileTitle: `File:Terminal One ${index + 1}.jpg`,
}));
const projected = projectCommonsPrecisionResponse({
  state: "results",
  candidates: pageCandidates,
  searchMode: "entity-guided",
  nextPageToken: "cp2.abcdefghijklmnop",
});
assert.equal(projected.contractVersion, "commons-precision-v2");
assert.equal(projected.nextPageToken, "cp2.abcdefghijklmnop");
assert.equal(projected.searchMode, "entity-guided");
assert.equal("resolvedEntity" in projected, false);
assert.equal("entityChoices" in projected, false);
assert.equal("targetQid" in projected.candidates[0], false);
assert.deepEqual(projectCommonsPrecisionResponse({ state: "no-suitable-image", candidates: [], searchMode: "broad" }), {
  contractVersion: "commons-precision-v2",
  state: "no-suitable-image",
  candidates: [],
  searchMode: "broad",
});
assert.throws(() => projectCommonsPrecisionResponse({
  state: "timeout",
  candidates: [evaluation.candidate],
  searchMode: "entity-guided",
  nextPageToken: "cp2.abcdefghijklmnop",
}), /nextPageToken/);
assert.throws(() => projectCommonsPrecisionResponse({
  state: "results",
  candidates: [evaluation.candidate, evaluation.candidate],
  searchMode: "entity-guided",
}), /數量或去重/);
assert.throws(() => projectCommonsPrecisionResponse({
  state: "results",
  candidates: [evaluation.candidate],
  searchMode: "entity-guided",
  nextPageToken: "raw-continuation",
}), /不透明 token/);

const projectRoot = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(projectRoot, "supabase/functions/travel-route/commonsPrecision.ts"), "utf8");
assert.doesNotMatch(source, /fetch\(|supabase|localStorage|indexedDB/i);

console.log("V3.9.1 公開候選回應投影、內部證據遮罩與 nextPageToken 邊界驗證通過。");
