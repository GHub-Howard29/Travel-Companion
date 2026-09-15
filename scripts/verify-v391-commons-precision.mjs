import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMONS_PRECISION_CONTRACT_VERSION,
  COMMONS_PRECISION_MAX_DURATION_MS,
  COMMONS_PRECISION_MAX_INSPECTED,
  COMMONS_PRECISION_MAX_REQUESTS,
  evaluateCommonsPrecisionCandidate,
  hasReachedCommonsInspectionLimit,
  isAllowedCommonsPrecisionLicense,
  rankCommonsPrecisionCandidates,
  validateCommonsPrecisionResponse,
} from "../supabase/functions/travel-route/commonsPrecision.ts";

const response = (value) => ({ contractVersion: COMMONS_PRECISION_CONTRACT_VERSION, ...value });

const baseCandidate = {
  fileTitle: "File:Target landmark.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Target.jpg/640px-Target.jpg",
  cropImageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Target.jpg/1280px-Target.jpg",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Target_landmark.jpg",
  creator: "Photographer",
  credit: "Photographer",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  width: 2400,
  height: 1600,
  targetQid: "Q123",
  targetNames: [{ value: "Target landmark", languageTag: "en" }],
};

for (const license of ["CC0", "CC0 1.0", "Public domain", "CC BY 1.0", "CC BY 2.0", "CC BY 2.5", "CC BY 3.0", "CC BY 4.0"]) {
  assert.equal(isAllowedCommonsPrecisionLicense(license), true, `${license} 應在白名單`);
}
for (const license of ["CC BY-SA 4.0", "CC BY-NC 4.0", "GFDL", "CC BY", "Custom license"]) {
  assert.equal(isAllowedCommonsPrecisionLicense(license), false, `${license} 應被拒絕`);
}

const p18 = evaluateCommonsPrecisionCandidate({ ...baseCandidate, directP18: true });
assert.equal(p18.accepted, true);
if (!p18.accepted) throw new Error("P18 fixture 應通過");
assert.equal(p18.candidate.reviewStatus, "needs-review");
assert.equal(p18.candidate.score, 70, "P18、檔名與 1600px 短邊應合計 70 分");
assert.deepEqual(p18.candidate.matchEvidence.map(({ kind }) => kind), ["p18", "filename"]);

const description = evaluateCommonsPrecisionCandidate({
  ...baseCandidate,
  fileTitle: "File:Unrelated.jpg",
  width: 1500,
  height: 1200,
  description: "A clear view of Target landmark at sunset.",
});
assert.equal(description.accepted, true);
if (!description.accepted) throw new Error("精確描述 fixture 應通過");
assert.equal(description.candidate.score, 25);
assert.equal(description.candidate.matchEvidence[0].kind, "description");

assert.deepEqual(
  evaluateCommonsPrecisionCandidate({ ...baseCandidate, directP18: undefined, description: "Target landmark", descriptionWasTruncated: true }),
  { accepted: false, reason: "no-strong-evidence" },
  "截斷描述不得用於精確命中",
);
assert.deepEqual(
  evaluateCommonsPrecisionCandidate({ ...baseCandidate, directP18: undefined }),
  { accepted: false, reason: "no-strong-evidence" },
  "檔名命中不得單獨通過強證據門檻",
);
assert.equal(evaluateCommonsPrecisionCandidate({ ...baseCandidate, credit: undefined, directP18: true }).accepted, true);
assert.equal(evaluateCommonsPrecisionCandidate({ ...baseCandidate, credit: "x".repeat(501), directP18: true }).accepted, false);
assert.equal(evaluateCommonsPrecisionCandidate({ ...baseCandidate, creator: "x".repeat(501), directP18: true }).accepted, false);
assert.equal(evaluateCommonsPrecisionCandidate({ ...baseCandidate, license: "CC BY-SA 4.0", directP18: true }).accepted, false);
assert.equal(evaluateCommonsPrecisionCandidate({ ...baseCandidate, height: 1199, directP18: true }).accepted, false);
assert.deepEqual(
  evaluateCommonsPrecisionCandidate({ ...baseCandidate, directP18: true, verifiedExclusions: ["wrong-entity"] }),
  { accepted: false, reason: "wrong-entity" },
);

const broadButPassing = evaluateCommonsPrecisionCandidate({
  ...baseCandidate,
  fileTitle: "File:Wide context.jpg",
  directP18: true,
  verifiedBroadAssociation: true,
});
assert.equal(broadButPassing.accepted, true);
if (!broadButPassing.accepted) throw new Error("25 分邊界 fixture 應通過");
assert.equal(broadButPassing.candidate.score, 25);

const ranked = rankCommonsPrecisionCandidates([
  { ...baseCandidate, fileTitle: "File:Z.jpg", directP18: true, targetNames: [] },
  { ...baseCandidate, fileTitle: "File:B.jpg", exactCategories: ["Target landmark"], targetNames: [] },
  { ...baseCandidate, fileTitle: "File:A.jpg", depictsQids: ["Q123"], targetNames: [] },
  { ...baseCandidate, fileTitle: "File:C.jpg", description: "Target landmark", targetNames: [{ value: "Target landmark", languageTag: "en" }] },
]);
assert.deepEqual(ranked.candidates.map(({ fileTitle }) => fileTitle), ["File:Z.jpg", "File:B.jpg", "File:A.jpg", "File:C.jpg"]);
assert.equal(ranked.rejected.length, 0);

const dateTie = rankCommonsPrecisionCandidates([
  { ...baseCandidate, fileTitle: "File:Older.jpg", directP18: true, targetNames: [], reliableCapturedAt: "2020-01-01", currentAppearanceVerified: true },
  { ...baseCandidate, fileTitle: "File:Newer-unverified.jpg", directP18: true, targetNames: [], reliableCapturedAt: "2026-01-01", currentAppearanceVerified: false },
]);
assert.deepEqual(dateTie.candidates.map(({ fileTitle }) => fileTitle), ["File:Older.jpg", "File:Newer-unverified.jpg"]);

assert.equal(validateCommonsPrecisionResponse(response({ state: "results", candidates: [p18.candidate], nextPageToken: "opaque" })), true);
assert.equal(validateCommonsPrecisionResponse(response({ state: "results", candidates: [] })), false);
assert.equal(validateCommonsPrecisionResponse(response({ state: "no-suitable-image", candidates: [] })), true);
assert.equal(validateCommonsPrecisionResponse(response({ state: "no-suitable-image", candidates: [p18.candidate] })), false);
assert.equal(validateCommonsPrecisionResponse(response({ state: "results", candidates: [p18.candidate, p18.candidate] })), false);
assert.equal(validateCommonsPrecisionResponse(response({ state: "timeout", candidates: [p18.candidate] })), true);
assert.equal(validateCommonsPrecisionResponse(response({ state: "timeout", candidates: [], nextPageToken: "forbidden" })), false);
assert.equal(validateCommonsPrecisionResponse({ state: "no-suitable-image", candidates: [] }), false, "缺少 contractVersion 必須拒絕");

assert.equal(hasReachedCommonsInspectionLimit({ requestCount: COMMONS_PRECISION_MAX_REQUESTS, elapsedMs: 1, inspectedCount: 1 }), true);
assert.equal(hasReachedCommonsInspectionLimit({ requestCount: 1, elapsedMs: COMMONS_PRECISION_MAX_DURATION_MS, inspectedCount: 1 }), true);
assert.equal(hasReachedCommonsInspectionLimit({ requestCount: 1, elapsedMs: 1, inspectedCount: COMMONS_PRECISION_MAX_INSPECTED }), true);
assert.equal(hasReachedCommonsInspectionLimit({ requestCount: 8, elapsedMs: 19_999, inspectedCount: 29 }), false);

const projectRoot = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(projectRoot, "supabase/functions/travel-route/commonsPrecision.ts"), "utf8");
assert.doesNotMatch(source, /negativeFeedback|notSuitable|不適合照片/);
assert.doesNotMatch(source, /fetch\(|supabase|localStorage|indexedDB/i);

console.log("V3.9.1 Commons 精準候選硬篩、評分、排序與終態契約驗證通過。");
