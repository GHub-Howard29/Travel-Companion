const CASES = [
  { label: "熊本城", queries: ["熊本城", "Kumamoto Castle"] },
  { label: "高千穗峽", queries: ["高千穗峽", "Takachiho Gorge"] },
  { label: "首里城", queries: ["首里城", "Shuri Castle Okinawa"] },
  { label: "沖繩美麗海水族館", queries: ["沖繩美麗海水族館", "Okinawa Churaumi Aquarium"] },
  { label: "萬座毛", queries: ["萬座毛", "Cape Manzamo Okinawa"] },
  { label: "桃園國際機場第二航廈", queries: ["桃園國際機場第二航廈", "Taiwan Taoyuan International Airport Terminal 2"] },
  { label: "那霸日航城市飯店", queries: ["那霸日航城市飯店", "Hotel JAL City Naha"] },
];

const ALLOWED_THUMB_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

const fetchWithRateLimit = async (url) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "Travel-Companion-V3.9-feasibility/1.0 (project evaluation)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429 || attempt === 2) return response;
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfterSeconds) ? Math.min(retryAfterSeconds * 1_000, 10_000) : 2_000 * (attempt + 1));
  }
  throw new Error("unreachable");
};

const searchCommons = async (query) => {
  const url = new URL("https://commons.wikimedia.org/w/rest.php/v1/search/page");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  const startedAt = performance.now();
  const response = await fetchWithRateLimit(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = await response.json();
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const fileCandidates = pages.filter((page) => typeof page.key === "string" && page.key.startsWith("File:"));
  const imageCandidates = fileCandidates.filter((page) => ALLOWED_THUMB_MIME.has(page.thumbnail?.mimetype));
  return {
    query,
    durationMs: Math.round(performance.now() - startedAt),
    returned: pages.length,
    fileCandidates: fileCandidates.length,
    imageCandidates: imageCandidates.length,
    topTitles: imageCandidates.slice(0, 5).map((page) => page.title),
  };
};

const results = [];
for (const testCase of CASES) {
  const queries = [];
  for (const query of testCase.queries) {
    queries.push(await searchCommons(query));
    await wait(500);
  }
  results.push({ label: testCase.label, queries });
}

const allQueries = results.flatMap((item) => item.queries);
const summary = {
  generatedAt: new Date().toISOString(),
  requestCount: allQueries.length,
  queryCountWithImageCandidates: allQueries.filter((item) => item.imageCandidates > 0).length,
  chineseQueriesWithImageCandidates: results.filter((item) => item.queries[0].imageCandidates > 0).length,
  englishQueriesWithImageCandidates: results.filter((item) => item.queries[1].imageCandidates > 0).length,
  durationMs: {
    min: Math.min(...allQueries.map((item) => item.durationMs)),
    max: Math.max(...allQueries.map((item) => item.durationMs)),
    average: Math.round(allQueries.reduce((sum, item) => sum + item.durationMs, 0) / allQueries.length),
  },
};

process.stdout.write(`${JSON.stringify({ summary, results }, null, 2)}\n`);
