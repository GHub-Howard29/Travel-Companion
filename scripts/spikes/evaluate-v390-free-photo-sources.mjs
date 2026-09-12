const CASES = [
  { category: "landmark", label: "熊本城", query: "Kumamoto Castle" },
  { category: "landmark", label: "高千穗峽", query: "Takachiho Gorge" },
  { category: "landmark", label: "首里城", query: "Shuri Castle Okinawa" },
  { category: "landmark", label: "沖繩美麗海水族館", query: "Okinawa Churaumi Aquarium" },
  { category: "landmark", label: "萬座毛", query: "Cape Manzamo Okinawa" },
  { category: "transport", label: "桃園國際機場第二航廈", query: "Taiwan Taoyuan International Airport Terminal 2" },
  { category: "transport", label: "OTS 臨空豐崎營業所", query: "OTS Rent a Car Toyosaki Okinawa" },
  { category: "hotel", label: "那霸日航城市飯店", query: "Hotel JAL City Naha" },
  { category: "restaurant", label: "福助玉子燒飯糰", query: "Fukusuke Tamago Onigiri Okinawa" },
  { category: "restaurant", label: "琉球新麵 通堂 小祿本店", query: "Ryukyu Shinmen Tondou Oroku Okinawa" },
  { category: "restaurant", label: "肉餐廳 肉久 名護店", query: "Nikukyuu Nago Okinawa restaurant" },
  { category: "restaurant", label: "BANTA CAFE", query: "Banta Cafe Okinawa" },
];

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { "User-Agent": "Travel-Companion-V3.9-feasibility/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

const normalizeText = (value) =>
  typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : null;

const queryCommons = async (query) => {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "3",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "320",
    format: "json",
    origin: "*",
  });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(data.query?.pages ?? {}).map((page) => {
    const info = page.imageinfo?.[0] ?? {};
    const meta = info.extmetadata ?? {};
    return {
      title: page.title,
      description: normalizeText(meta.ImageDescription?.value),
      creator: normalizeText(meta.Artist?.value),
      license: meta.LicenseShortName?.value ?? null,
      sourceUrl: info.descriptionurl ?? null,
      thumbnailHost: info.thumburl ? new URL(info.thumburl).host : null,
    };
  });
};

const queryOpenverse = async (query) => {
  const params = new URLSearchParams({ q: query, page_size: "3", mature: "false" });
  const data = await fetchJson(`https://api.openverse.org/v1/images/?${params}`);
  return (data.results ?? []).map((item) => ({
    title: item.title ?? null,
    creator: item.creator ?? null,
    license: [item.license, item.license_version].filter(Boolean).join(" ") || null,
    provider: item.provider ?? null,
    source: item.source ?? null,
    sourceUrl: item.foreign_landing_url ?? null,
    thumbnailHost: item.thumbnail ? new URL(item.thumbnail).host : null,
    attributionComplete: Boolean(item.creator && item.license && item.license_url && item.foreign_landing_url),
  }));
};

const results = [];
for (const testCase of CASES) {
  const row = { ...testCase };
  for (const [source, query] of [["commons", queryCommons], ["openverse", queryOpenverse]]) {
    try {
      row[source] = { ok: true, results: await query(testCase.query) };
    } catch (error) {
      row[source] = { ok: false, error: error instanceof Error ? error.message : String(error), results: [] };
    }
  }
  results.push(row);
}

process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), requestCount: CASES.length * 2, results }, null, 2)}\n`);
