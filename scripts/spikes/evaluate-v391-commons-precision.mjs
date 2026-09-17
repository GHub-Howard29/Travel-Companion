import { runCommonsPrecisionEngine } from "../../supabase/functions/travel-route/commonsPrecisionEngine.ts";
import { executeCommonsPrecisionRequest } from "../../supabase/functions/travel-route/commonsPrecisionFetch.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CONTACT_URL = "https://github.com/GHub-Howard29/Travel-Companion/issues";
const MAX_TOTAL_REQUESTS = 135;
const OUTPUT_PATH = process.env.V391_SPIKE_OUTPUT_PATH ?? "supabase/.temp/v391-commons-precision-spike.json";
const CASES = [
  { category: "landmark", label: "熊本城", query: "熊本城", language: "ja", expectedCandidates: true },
  { category: "landmark", label: "高千穗峽", query: "高千穂峡", language: "ja", expectedCandidates: true },
  { category: "landmark", label: "首里城", query: "首里城", language: "ja", expectedCandidates: true },
  { category: "landmark", label: "沖繩美麗海水族館", query: "沖縄美ら海水族館", language: "ja", expectedCandidates: true },
  { category: "landmark", label: "萬座毛", query: "万座毛", language: "ja", expectedCandidates: true },
  { category: "transport", label: "桃園國際機場第二航廈", query: "Taiwan Taoyuan International Airport Terminal 2", language: "en", expectedCandidates: true },
  { category: "transport", label: "OTS 臨空豐崎營業所", query: "OTS Rent a Car Toyosaki Okinawa", language: "en", expectedCandidates: false },
  { category: "hotel", label: "那霸日航城市飯店", query: "Hotel JAL City Naha", language: "en", expectedCandidates: true },
  { category: "restaurant", label: "福助玉子燒飯糰", query: "Fukusuke Tamago Onigiri Okinawa", language: "en", expectedCandidates: false },
  { category: "restaurant", label: "琉球新麵 通堂 小祿本店", query: "Ryukyu Shinmen Tondou Oroku Okinawa", language: "en", expectedCandidates: false },
  { category: "restaurant", label: "肉餐廳 肉久 名護店", query: "Nikukyuu Nago Okinawa restaurant", language: "en", expectedCandidates: false },
  { category: "restaurant", label: "BANTA CAFE", query: "Banta Cafe Okinawa", language: "en", expectedCandidates: false },
  { category: "adversarial-exact", label: "桃園國際機場第一航廈", query: "Terminal 1, Taiwan Taoyuan International Airport", language: "en", expectedCandidates: true },
  { category: "adversarial-ambiguous", label: "第一航廈", query: "第一航廈", language: "zh-Hant", expectedCandidates: false },
  { category: "adversarial-broad", label: "桃園國際機場", query: "桃園國際機場", language: "zh-Hant", expectedCandidates: false },
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
        if (totalRequestCount > MAX_TOTAL_REQUESTS) throw new Error("spike exceeded the approved 135-request ceiling");
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
      pageId: candidate.pageId,
      fileTitle: candidate.fileTitle,
      score: candidate.score,
      evidence: candidate.evidence,
      review: candidate.review,
      sourcePageUrl: candidate.sourcePageUrl,
    })),
  });
  await saveCheckpoint(false);
  process.stderr.write(`[${caseIndex + 1}/${CASES.length}] ${testCase.label}: ${result.response.state}, ${finalCount} candidates, ${result.requestCount} requests\n`);
}

await saveCheckpoint(true);
const report = createReport(true);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
