import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMONS_PRECISION_REQUEST_TIMEOUT_MS,
  beginNextCommonsPrecisionRequest,
  completeCommonsPrecisionRequest,
  createCommonsPrecisionOperation,
  failCommonsPrecisionRequest,
  mergeCommonsFileEvidence,
  parseCommonsCategoryMembersResponse,
  parseCommonsDepictsResponse,
  parseWikidataEntityEvidenceResponse,
  parseWikidataSearchResponse,
  resolveUniqueWikidataEntity,
  skipCommonsPrecisionLayer,
} from "../supabase/functions/travel-route/commonsPrecisionWikimedia.ts";

const entityClaim = (id) => ({ mainsnak: { datavalue: { value: { id } } } });
const stringClaim = (value) => ({ mainsnak: { datavalue: { value } } });

const searchPayload = {
  search: [
    { id: "Q100", label: "第一航廈", aliases: ["第一航站"], match: { type: "alias", language: "en", text: "Terminal 1" } },
    { id: "Q200", label: "第一航廈", aliases: ["First Terminal"] },
    { id: "not-a-qid", label: "第一航廈" },
    { id: "Q100", label: "duplicate" },
  ],
};
const searchEntities = parseWikidataSearchResponse(searchPayload);
assert.deepEqual(searchEntities.map(({ qid }) => qid), ["Q100", "Q200"]);
assert.deepEqual(
  resolveUniqueWikidataEntity("第一航站", searchEntities, new Map(), new Set()),
  { state: "resolved", entity: searchEntities[0] },
);
assert.deepEqual(resolveUniqueWikidataEntity("Terminal 1", searchEntities, new Map(), new Set()), { state: "resolved", entity: searchEntities[0] });
assert.deepEqual(
  resolveUniqueWikidataEntity("第一航廈", searchEntities, new Map(), new Set()),
  { state: "entity-ambiguous" },
);
assert.deepEqual(
  resolveUniqueWikidataEntity("第一航廈", searchEntities, new Map([["Q100", ["Q5"]]]), new Set(["Q5"])),
  { state: "resolved", entity: searchEntities[1] },
);
assert.deepEqual(resolveUniqueWikidataEntity("不存在", searchEntities, new Map(), new Set()), { state: "entity-not-found" });

const evidencePayload = {
  entities: {
    Q100: {
      claims: {
        P31: [entityClaim("Q1248784")],
        P18: [stringClaim("Terminal One.jpg"), { ...stringClaim("Deprecated.jpg"), rank: "deprecated" }, stringClaim("File:Terminal Detail.jpg")],
        P373: [stringClaim("Category:Airport terminals in Taiwan")],
      },
      labels: {
        en: { language: "en", value: "Terminal One" },
        "zh-hant": { language: "zh-hant", value: "第一航廈" },
        ja: { language: "ja", value: "第1ターミナル" },
      },
      aliases: {
        en: Array.from({ length: 9 }, (_, index) => ({ language: "en", value: `Terminal alias ${index + 1}` })),
        "zh-hant": [{ language: "zh-hant", value: "第一航站" }],
      },
    },
  },
};
const evidence = parseWikidataEntityEvidenceResponse(evidencePayload, "Q100", "en");
assert.ok(evidence);
assert.deepEqual(evidence.instanceOfQids, ["Q1248784"]);
assert.deepEqual(evidence.p18FileTitles, ["File:Terminal One.jpg", "File:Terminal Detail.jpg"]);
assert.deepEqual(evidence.p373Categories, ["Airport terminals in Taiwan"]);
assert.equal(evidence.names.filter(({ languageTag }) => languageTag === "en").length, 8, "每語言應為一個正式名稱加最多七個別名");
assert.equal(evidence.names.some(({ languageTag }) => languageTag === "ja"), false, "目標語言非日文時不得固定加入日文");
assert.equal(parseWikidataEntityEvidenceResponse(evidencePayload, "Q0", "en"), null);

const category = parseCommonsCategoryMembersResponse({
  query: {
    categorymembers: [
      { pageid: 10, ns: 6, title: "File:Terminal.jpg" },
      { pageid: 10, ns: 6, title: "File:Duplicate.jpg" },
      { pageid: 11, ns: 14, title: "Category:Child" },
      { pageid: 12, ns: 6, title: "Not a file" },
    ],
  },
  continue: { cmcontinue: "file|opaque" },
});
assert.deepEqual(category, {
  files: [{ pageId: 10, fileTitle: "File:Terminal.jpg" }],
  continuation: "file|opaque",
});

const depicts = parseCommonsDepictsResponse({
  entities: {
    M10: { claims: { P180: [entityClaim("Q100"), entityClaim("Q999"), entityClaim("Q100")] } },
    M12: { claims: { P180: [stringClaim("Q100")] } },
  },
}, [10, 12, -1]);
assert.deepEqual(depicts.get(10), ["Q100", "Q999"]);
assert.deepEqual(depicts.get(12), []);

assert.deepEqual(mergeCommonsFileEvidence([
  { pageId: 10, fileTitle: "File:Terminal.jpg", kind: "p18" },
  { pageId: 10, fileTitle: "File:Terminal duplicate title.jpg", kind: "exact-category", category: "Terminal One" },
  { pageId: 10, fileTitle: "File:Terminal.jpg", kind: "adopted-text" },
  { pageId: 11, fileTitle: "File:Other.jpg", kind: "exact-category", category: "Terminal One" },
]), [
  {
    pageId: 10,
    fileTitle: "File:Terminal.jpg",
    directP18: true,
    exactCategories: ["Terminal One"],
    fromAdoptedTextSearch: true,
  },
  {
    pageId: 11,
    fileTitle: "File:Other.jpg",
    directP18: false,
    exactCategories: ["Terminal One"],
    fromAdoptedTextSearch: false,
  },
], "同一 page ID 必須保留所有取得途徑且只顯示一次");

let operation = createCommonsPrecisionOperation(1_000);
const first = beginNextCommonsPrecisionRequest(operation, 1_000);
assert.equal(first.status, "started");
if (first.status !== "started") throw new Error("第一個步驟應啟動");
assert.equal(first.layer, "resolve-entity");
operation = first.state;
assert.equal(beginNextCommonsPrecisionRequest(operation, 1_001).status, "in-progress", "不得平行啟動第二個請求");
operation = completeCommonsPrecisionRequest(operation, 1_100, {});
const second = beginNextCommonsPrecisionRequest(operation, 1_101);
assert.equal(second.status, "started");
if (second.status !== "started") throw new Error("第二個步驟應啟動");
assert.equal(second.layer, "read-entity-evidence");

const noEntityContinuation = completeCommonsPrecisionRequest(first.state, 1_100, { continuation: "must-not-repeat" });
assert.equal(noEntityContinuation.layerIndex, 1);
assert.equal(noEntityContinuation.continuation, undefined, "QID 解析不得透過 continuation 重跑");

let categoryOperation = { ...createCommonsPrecisionOperation(0), layerIndex: 3 };
const categoryFirst = beginNextCommonsPrecisionRequest(categoryOperation, 1);
assert.equal(categoryFirst.status, "started");
if (categoryFirst.status !== "started") throw new Error("Category 步驟應啟動");
categoryOperation = completeCommonsPrecisionRequest(categoryFirst.state, 100, { inspectedCount: 6, continuation: "opaque-internal" });
const categoryNext = beginNextCommonsPrecisionRequest(categoryOperation, 101);
assert.equal(categoryNext.status, "started");
if (categoryNext.status !== "started") throw new Error("Category continuation 應啟動");
assert.equal(categoryNext.layer, "read-category-files", "同層 continuation 必須優先於下一證據層");
assert.equal(categoryNext.continuation, "opaque-internal");

const timed = beginNextCommonsPrecisionRequest(createCommonsPrecisionOperation(0), 0);
if (timed.status !== "started") throw new Error("逾時 fixture 應先啟動");
assert.equal(
  completeCommonsPrecisionRequest(timed.state, COMMONS_PRECISION_REQUEST_TIMEOUT_MS, {}).terminalState,
  "timeout",
);
assert.equal(beginNextCommonsPrecisionRequest({ ...createCommonsPrecisionOperation(0), requestCount: 9 }, 1).state.terminalState, "inspection-limit-reached");
assert.equal(beginNextCommonsPrecisionRequest(createCommonsPrecisionOperation(0), 20_000).state.terminalState, "inspection-limit-reached");
assert.equal(skipCommonsPrecisionLayer(createCommonsPrecisionOperation(0)).layerIndex, 0, "不得跳過唯一 QID 解析");

const failing = beginNextCommonsPrecisionRequest(createCommonsPrecisionOperation(0), 0);
if (failing.status !== "started") throw new Error("錯誤 fixture 應先啟動");
const failed = failCommonsPrecisionRequest(failing.state, "rate-limited");
assert.equal(failed.terminalState, "rate-limited");
assert.equal(beginNextCommonsPrecisionRequest(failed, 1).status, "stopped", "錯誤後不得自動重試");

const projectRoot = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(projectRoot, "supabase/functions/travel-route/commonsPrecisionWikimedia.ts"), "utf8");
assert.doesNotMatch(source, /fetch\(|supabase|setTimeout|Retry-After/i);
assert.doesNotMatch(source, /P279/);

console.log("V3.9.1 Wikidata／Commons 離線解析與順序作業預算驗證通過。");
