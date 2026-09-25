import { runCommonsPrecisionEngine } from "../../supabase/functions/travel-route/commonsPrecisionEngine.ts";
import { executeCommonsPrecisionRequest } from "../../supabase/functions/travel-route/commonsPrecisionFetch.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CONTACT_URL = "https://github.com/GHub-Howard29/Travel-Companion/issues";
const MAX_TOTAL_REQUESTS = 60;
const OUTPUT_PATH = process.env.V3911_SPIKE_OUTPUT_PATH ?? "supabase/.temp/v3911-commons-precision-spike.json";
const CASES = [
  { category: "transport", label: "桃園國際機場", query: "桃園國際機場", language: "zh-Hant", expectedCandidates: true },
  { category: "landmark", label: "熊本城", query: "熊本城", language: "ja", expectedCandidates: true },
  { category: "landmark", label: "櫻之馬場‧城彩苑", query: "櫻之馬場 城彩苑", language: "zh-Hant", expectedCandidates: true },
  { category: "transport", label: "熊本熊電鐵", query: "熊本熊電鐵", language: "zh-Hant", expectedCandidates: true },
  { category: "landmark", label: "熊本上、下通商店街", query: "熊本 上通 下通 商店街", language: "zh-Hant", expectedCandidates: true },
];

const countArray = (value) => Array.isArray(value) ? value.length : 0;
const countResponseItems = (layer, payload) => {
  if (!payload || typeof payload !== "object") return 0;
  if (layer === "resolve-entity") return countArray(payload.search);
  if (layer === "read-entity-evidence") return Object.keys(payload.entities ?? {}).length;
  if (layer === "read-category-files") return countArray(payload.query?.categorymembers);
  return countArray(payload.query?.pages);
};

let totalRequestCount = 0;
const results = [];

const createReport = (completed) => {
  const durations = results.map((item) => item.durationMs);
  return {
    generatedAt: new Date().toISOString(),
    completed,
    contactUrl: CONTACT_URL,
    constraints: {
      sequential: true,
      retry: false,
      maximumTotalRequests: MAX_TOTAL_REQUESTS,
      supabaseWrites: 0,
      cacheWrites: 0,
      storageWrites: 0,
    },
    summary: {
      caseCount: results.length,
      requestCount: totalRequestCount,
      resultCases: results.filter((item) => item.finalCount > 0).length,
      regressionCases: results.filter((item) => item.regression).map((item) => item.label),
      durationMs: durations.length === 0 ? null : {
        minimum: Math.min(...durations),
        maximum: Math.max(...durations),
        average: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
      },
    },
    results,
  };
};

const saveCheckpoint = async (completed) => {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(createReport(completed), null, 2)}\n`, "utf8");
};

for (const [caseIndex, testCase] of CASES.entries()) {
  const layerCounts = {};
  let entitySearchCandidates = [];
  const startedAt = performance.now();
  const result = await runCommonsPrecisionEngine(
    { query: testCase.query, language: testCase.language },
    {
      request: async (plan) => {
        totalRequestCount += 1;
        if (totalRequestCount > MAX_TOTAL_REQUESTS) throw new Error("spike exceeded the approved 60-request ceiling");
        const response = await executeCommonsPrecisionRequest(plan, CONTACT_URL);
        layerCounts[plan.layer] = (layerCounts[plan.layer] ?? 0) + countResponseItems(plan.layer, response.payload);
        if (plan.layer === "resolve-entity" && Array.isArray(response.payload?.search)) {
          entitySearchCandidates = response.payload.search.slice(0, 10).flatMap((entity) => {
            if (!entity || typeof entity !== "object" || typeof entity.id !== "string" || typeof entity.label !== "string") return [];
            return [{
              qid: entity.id,
              label: entity.label,
              matchedText: typeof entity.match?.text === "string" ? entity.match.text : null,
            }];
          });
        }
        return response;
      },
    },
  );
  const finalCount = result.response.candidates.length;
  results.push({
    ...testCase,
    qid: result.qid ?? null,
    entitySearchCandidates,
    layerCounts,
    inspectedCount: result.inspectedCount,
    hardFilteredCount: Math.max(0, result.inspectedCount - finalCount),
    rejectedByReason: result.rejectedByReason,
    finalCount,
    state: result.response.state,
    requestCount: result.requestCount,
    durationMs: Math.round(performance.now() - startedAt),
    regression: testCase.expectedCandidates && finalCount === 0,
    candidates: result.response.candidates.map((candidate) => ({
      fileTitle: candidate.fileTitle,
      tier: candidate.tier,
      score: candidate.score,
      matchEvidence: candidate.matchEvidence,
      sourcePageUrl: candidate.sourcePageUrl,
    })),
  });
  await saveCheckpoint(false);
  process.stderr.write(`[${caseIndex + 1}/${CASES.length}] ${testCase.label}: ${result.response.state}, ${finalCount} candidates, ${result.requestCount} requests\n`);
}

await saveCheckpoint(true);
const report = createReport(true);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
