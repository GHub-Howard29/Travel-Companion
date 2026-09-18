import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const API_URL = "https://api.pexels.com/v1/search";
const OUTPUT_PATH = process.env.V394_PEXELS_OUTPUT_PATH ?? "supabase/.temp/v394-pexels-isolated-matrix.json";
const EXECUTION_ACK = "PEXELS-V394-EXTERNAL-APPROVED";
const PER_PAGE = 6;
const REQUEST_TIMEOUT_MS = 10_000;

const CASES = [
  {
    category: "transport",
    label: "桃園國際機場",
    queries: [
      { query: "桃園國際機場", locale: "zh-TW", language: "zh-Hant" },
      { query: "Taiwan Taoyuan International Airport", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "landmark",
    label: "熊本城",
    queries: [
      { query: "熊本城", locale: "ja-JP", language: "ja" },
      { query: "Kumamoto Castle", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "landmark",
    label: "高千穗峽",
    queries: [
      { query: "高千穂峡", locale: "ja-JP", language: "ja" },
      { query: "Takachiho Gorge", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "landmark",
    label: "首里城",
    queries: [
      { query: "首里城", locale: "ja-JP", language: "ja" },
      { query: "Shuri Castle Okinawa", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "landmark",
    label: "沖繩美麗海水族館",
    queries: [
      { query: "沖縄美ら海水族館", locale: "ja-JP", language: "ja" },
      { query: "Okinawa Churaumi Aquarium", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "landmark",
    label: "萬座毛",
    queries: [
      { query: "万座毛", locale: "ja-JP", language: "ja" },
      { query: "Cape Manzamo Okinawa", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "transport",
    label: "OTS 臨空豐崎營業所",
    queries: [
      { query: "OTSレンタカー 臨空豊崎営業所", locale: "ja-JP", language: "ja" },
      { query: "OTS Rent a Car Toyosaki Okinawa", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "hotel",
    label: "那霸日航城市飯店",
    queries: [
      { query: "ホテルJALシティ那覇", locale: "ja-JP", language: "ja" },
      { query: "Hotel JAL City Naha", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "restaurant",
    label: "福助玉子燒飯糰",
    queries: [
      { query: "福助の玉子焼き ポークたまごおにぎり", locale: "ja-JP", language: "ja" },
      { query: "Fukusuke Tamago Onigiri Okinawa", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "restaurant",
    label: "琉球新麵 通堂 小祿本店",
    queries: [
      { query: "琉球新麺 通堂 小禄本店", locale: "ja-JP", language: "ja" },
      { query: "Ryukyu Shinmen Tondou Oroku Okinawa", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "restaurant",
    label: "肉餐廳 肉久 名護店",
    queries: [
      { query: "肉や食堂inへんざ 名護店", locale: "ja-JP", language: "ja" },
      { query: "Nikukyuu Nago Okinawa restaurant", locale: "en-US", language: "en" },
    ],
  },
  {
    category: "restaurant",
    label: "BANTA CAFE",
    queries: [
      { query: "バンタカフェ 沖縄", locale: "ja-JP", language: "ja" },
      { query: "Banta Cafe Okinawa", locale: "en-US", language: "en" },
    ],
  },
];

const plan = CASES.flatMap((testCase) => testCase.queries.map((query) => ({
  category: testCase.category,
  label: testCase.label,
  ...query,
})));

const constraints = {
  source: "Pexels",
  endpoint: API_URL,
  sequential: true,
  retry: false,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  maximumTotalRequests: plan.length,
  candidatesPerRequest: PER_PAGE,
  imageDownloads: 0,
  supabaseWrites: 0,
  productionWrites: 0,
  cacheWrites: 0,
  storageWrites: 0,
};

if (!process.argv.includes("--execute")) {
  process.stdout.write(`${JSON.stringify({ mode: "plan-only", constraints, cases: plan }, null, 2)}\n`);
  process.exit(0);
}

const apiKey = process.env.PEXELS_API_KEY?.trim();
if (!apiKey) throw new Error("缺少 server-side PEXELS_API_KEY；未發出任何外部請求。");
if (process.env.V394_PEXELS_EXTERNAL_ACK !== EXECUTION_ACK) {
  throw new Error(`缺少單次外部測試確認 V394_PEXELS_EXTERNAL_ACK=${EXECUTION_ACK}；未發出任何外部請求。`);
}

const isAllowedUrl = (value, host) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host;
  } catch {
    return false;
  }
};

const sanitizePhoto = (photo) => {
  if (!photo || typeof photo !== "object" || !Number.isSafeInteger(photo.id) ||
    !isAllowedUrl(photo.url, "www.pexels.com") || !isAllowedUrl(photo.photographer_url, "www.pexels.com") ||
    !isAllowedUrl(photo.src?.medium, "images.pexels.com")) return null;
  return {
    photoId: String(photo.id),
    width: Number(photo.width) || null,
    height: Number(photo.height) || null,
    alt: typeof photo.alt === "string" ? photo.alt.slice(0, 300) : "",
    photographer: typeof photo.photographer === "string" ? photo.photographer.slice(0, 200) : "",
    photographerUrl: photo.photographer_url,
    sourcePageUrl: photo.url,
    previewUrl: photo.src.medium,
  };
};

const results = [];
for (const [index, testCase] of plan.entries()) {
  const params = new URLSearchParams({
    query: testCase.query,
    locale: testCase.locale,
    page: "1",
    per_page: String(PER_PAGE),
  });
  const startedAt = performance.now();
  const response = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: apiKey },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const rateLimit = {
    limit: response.headers.get("x-ratelimit-limit"),
    remaining: response.headers.get("x-ratelimit-remaining"),
    reset: response.headers.get("x-ratelimit-reset"),
  };
  if (!response.ok) throw new Error(`Pexels request ${index + 1}/${plan.length} failed: HTTP ${response.status}`);
  const payload = await response.json();
  const candidates = Array.isArray(payload.photos)
    ? payload.photos.map(sanitizePhoto).filter(Boolean).slice(0, PER_PAGE)
    : [];
  results.push({
    ...testCase,
    durationMs: Math.round(performance.now() - startedAt),
    returnedCount: candidates.length,
    totalResults: Number.isSafeInteger(payload.total_results) ? payload.total_results : null,
    rateLimit,
    manualReview: {
      status: "pending",
      hitAt3: null,
      usableInFirst6: null,
      mismatchNotes: "",
    },
    candidates,
  });
  process.stderr.write(`[${index + 1}/${plan.length}] ${testCase.label} (${testCase.language}): ${candidates.length} candidates\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  completed: true,
  constraints,
  summary: {
    caseCount: results.length,
    requestCount: results.length,
    manualReviewPending: results.length,
  },
  results,
};
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath: OUTPUT_PATH, ...report.summary }, null, 2)}\n`);
