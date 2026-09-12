import assert from "node:assert/strict";

const FILE_TITLES = [
  "File:Kumamoto Castle.JPG",
  "File:Takachiho-gorge.jpg",
  "File:Naha Okinawa Japan Shuri-Castle-02.jpg",
  "File:Okinawa Aquarium.jpg",
  "File:Onna Okinawa Japan Cape-Manzamo-01.jpg",
  "File:Taoyuan International Airport Terminal 2 Departure Area 20200816.jpg",
  "File:Hotel JAL City Naha 20250304 134902.jpg",
];
const ALLOWED_LICENSES = /^(?:CC0|Public domain|CC BY(?:-SA)?(?: |$))/i;
const ALLOWED_THUMB_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const METADATA_FILTER = [
  "ImageDescription",
  "ObjectName",
  "Artist",
  "Credit",
  "LicenseShortName",
  "LicenseUrl",
  "UsageTerms",
  "AttributionRequired",
  "Restrictions",
].join("|");

const params = new URLSearchParams({
  action: "query",
  titles: FILE_TITLES.join("|"),
  prop: "imageinfo",
  iiprop: "url|mime|thumbmime|mediatype|size|extmetadata",
  iiurlwidth: "640",
  iiextmetadatalanguage: "en",
  iiextmetadatafilter: METADATA_FILTER,
  format: "json",
  origin: "*",
});
const startedAt = performance.now();
const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
  headers: { "User-Agent": "Travel-Companion-V3.9-feasibility/1.0 (project evaluation)" },
  signal: AbortSignal.timeout(15_000),
});
assert.equal(response.status, 200, `Commons imageinfo failed: ${response.status}`);
const payload = await response.json();
const pages = Object.values(payload.query?.pages ?? {});
assert.equal(pages.length, FILE_TITLES.length);

const results = await Promise.all(pages.map(async (page) => {
  const info = page.imageinfo?.[0] ?? {};
  const metadata = info.extmetadata ?? {};
  const valueOf = (key) => typeof metadata[key]?.value === "string" ? metadata[key].value.trim() : null;
  const license = valueOf("LicenseShortName") ?? valueOf("UsageTerms");
  const creatorPresent = Boolean(valueOf("Artist"));
  const licenseUrlPresent = Boolean(valueOf("LicenseUrl"));
  const sourceUrlPresent = Boolean(info.descriptionurl);
  const thumbnailPresent = Boolean(info.thumburl && ALLOWED_THUMB_MIME.has(info.thumbmime));
  const eligible = Boolean(
    info.mediatype === "BITMAP" && creatorPresent && license && ALLOWED_LICENSES.test(license) &&
    sourceUrlPresent && thumbnailPresent && (license.toLowerCase() === "public domain" || licenseUrlPresent),
  );
  const thumbnailResponse = await fetch(info.thumburl, { signal: AbortSignal.timeout(15_000) });
  const thumbnailBytes = thumbnailResponse.ok ? (await thumbnailResponse.arrayBuffer()).byteLength : 0;
  return {
    title: page.title,
    license,
    creatorPresent,
    licenseUrlPresent,
    sourceUrlPresent,
    attributionRequired: valueOf("AttributionRequired"),
    creditPresent: Boolean(valueOf("Credit")),
    restrictions: valueOf("Restrictions"),
    mediaType: info.mediatype ?? null,
    originalMime: info.mime ?? null,
    thumbnailMime: info.thumbmime ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
    thumbnailStatus: thumbnailResponse.status,
    thumbnailContentType: thumbnailResponse.headers.get("content-type"),
    thumbnailBytes,
    within120KiB: thumbnailBytes > 0 && thumbnailBytes <= 120 * 1024,
    eligible,
  };
}));

assert.equal(results.filter((item) => item.eligible).length, FILE_TITLES.length);
process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  requestCount: 1,
  durationMs: Math.round(performance.now() - startedAt),
  eligible: results.length,
  results,
}, null, 2)}\n`);
