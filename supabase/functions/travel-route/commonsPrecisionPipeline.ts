import { isRecord } from "./validation.ts";
import {
  rankCommonsPrecisionCandidates,
  type CommonsPrecisionName,
  type CommonsPrecisionRawCandidate,
  type CommonsPrecisionRejectReason,
} from "./commonsPrecision.ts";
import type {
  CommonsFileEvidenceSeed,
  WikidataEntityEvidence,
} from "./commonsPrecisionWikimedia.ts";

const QID = /^Q[1-9][0-9]*$/;
const FILE_TITLE = /^File:.+/;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const COMMONS_THUMB_WIDTH = 640;
const COMMONS_CROP_WIDTH = 1280;
const MAX_QUERY_LENGTH = 120;
const MAX_TITLES_PER_REQUEST = 50;
const MAX_PAGE_IDS_PER_REQUEST = 50;

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const requireQuery = (query: string): string => {
  const value = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (value.length < 2 || value.length > MAX_QUERY_LENGTH) {
    throw new RangeError(`搜尋詞須為 2 至 ${MAX_QUERY_LENGTH} 個字元`);
  }
  return value;
};

const requireLanguage = (language: string): string => {
  const value = language.trim();
  if (!LANGUAGE_TAG.test(value)) throw new RangeError("語言標籤格式不正確");
  return value.toLowerCase();
};

const requireFileTitles = (titles: readonly string[]): string[] => {
  const values = unique(titles.map((title) => title.normalize("NFKC").trim()).filter((title) => FILE_TITLE.test(title)));
  if (values.length === 0 || values.length > MAX_TITLES_PER_REQUEST) {
    throw new RangeError(`檔案標題須為 1 至 ${MAX_TITLES_PER_REQUEST} 筆有效 File: 標題`);
  }
  return values;
};

const baseParams = (): URLSearchParams => new URLSearchParams({
  action: "query",
  format: "json",
  formatversion: "2",
  origin: "*",
});

export const buildWikidataEntitySearchParams = (query: string, language: string): URLSearchParams => {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: requireQuery(query),
    language: requireLanguage(language),
    uselang: requireLanguage(language),
    type: "item",
    limit: "10",
    format: "json",
    origin: "*",
  });
  return params;
};

export const buildWikidataEntityEvidenceParams = (
  qids: readonly string[],
  targetLanguage: string,
): URLSearchParams => {
  const ids = unique(qids.filter((qid) => QID.test(qid))).slice(0, 10);
  if (ids.length === 0) throw new RangeError("至少需要一筆有效 QID");
  const language = requireLanguage(targetLanguage);
  const languages = unique([language, "zh-hant", "en", ...(language === "ja" ? ["ja"] : [])]);
  return new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "claims|labels|aliases",
    languages: languages.join("|"),
    languagefallback: "0",
    format: "json",
    origin: "*",
  });
};

export const buildCommonsFileMetadataParams = (titles: readonly string[]): URLSearchParams => {
  const params = baseParams();
  params.set("titles", requireFileTitles(titles).join("|"));
  params.set("prop", "imageinfo");
  params.set("iiprop", "url|mime|mediatype|size|sha1|timestamp|extmetadata");
  params.set("iiurlwidth", String(COMMONS_THUMB_WIDTH));
  params.set("iiextmetadatafilter", [
    "Artist",
    "Credit",
    "LicenseShortName",
    "LicenseUrl",
    "UsageTerms",
    "AttributionRequired",
    "Restrictions",
    "ImageDescription",
  ].join("|"));
  return params;
};

export const buildCommonsCategoryMembersParams = (
  rawCategory: string,
  continuation?: string,
): URLSearchParams => {
  const category = rawCategory.normalize("NFKC").replace(/^Category:/i, "").replace(/\s+/g, " ").trim();
  if (!category || category.length > 200) throw new RangeError("Commons 分類名稱須為 1 至 200 個字元");
  if (continuation !== undefined && (!continuation || continuation.length > 1_000)) {
    throw new RangeError("Commons continuation 格式不正確");
  }
  const params = baseParams();
  params.set("list", "categorymembers");
  params.set("cmtitle", `Category:${category}`);
  params.set("cmtype", "file");
  params.set("cmnamespace", "6");
  params.set("cmlimit", "6");
  if (continuation) params.set("cmcontinue", continuation);
  return params;
};

export const buildCommonsDepictsParams = (pageIds: readonly number[]): URLSearchParams => {
  const ids = unique(pageIds.filter((pageId) => Number.isSafeInteger(pageId) && pageId > 0)).slice(0, MAX_PAGE_IDS_PER_REQUEST);
  if (ids.length === 0) throw new RangeError("至少需要一筆有效 Commons page ID");
  return new URLSearchParams({
    action: "wbgetentities",
    ids: ids.map((pageId) => `M${pageId}`).join("|"),
    props: "claims",
    format: "json",
    origin: "*",
  });
};

export const buildCommonsTextSearchParams = (query: string, offset?: number): URLSearchParams => {
  if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) {
    throw new RangeError("Commons 搜尋 offset 必須為非負整數");
  }
  const params = baseParams();
  params.set("generator", "search");
  params.set("gsrsearch", requireQuery(query));
  params.set("gsrnamespace", "6");
  params.set("gsrlimit", "6");
  params.set("prop", "imageinfo");
  params.set("iiprop", "url|mime|mediatype|size|sha1|timestamp|extmetadata");
  params.set("iiurlwidth", String(COMMONS_THUMB_WIDTH));
  if (offset !== undefined) params.set("gsroffset", String(offset));
  return params;
};

const decodeEntity = (entity: string): string => {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  const key = entity.toLowerCase();
  if (named[key] !== undefined) return named[key];
  const codePoint = key.startsWith("#x")
    ? Number.parseInt(key.slice(2), 16)
    : key.startsWith("#") ? Number.parseInt(key.slice(1), 10) : Number.NaN;
  return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : " ";
};

export const sanitizeCommonsMetadataText = (
  input: unknown,
  maxLength = 500,
): { value?: string; truncated: boolean } => {
  if (typeof input !== "string" || !Number.isSafeInteger(maxLength) || maxLength < 1) {
    return { truncated: false };
  }
  const value = input
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/gi, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([#A-Za-z0-9]+);/g, (_match, entity: string) => decodeEntity(entity))
    .split("")
    .map((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
    })
    .join("")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return { truncated: false };
  if (value.length <= maxLength) return { value, truncated: false };
  return { value: value.slice(0, maxLength).trimEnd(), truncated: true };
};

const isHttpsHost = (value: unknown, hostname: string): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname;
  } catch {
    return false;
  }
};

// Commons may return its legacy thumbnail CDN host in imageinfo.  Preserve the
// approved upload.wikimedia.org boundary in every public candidate by mapping
// only that documented alias before validating it.
const normalizeCommonsThumbnailUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (url.hostname === "thumb.wikimedia.org") url.hostname = "upload.wikimedia.org";
    return url.hostname === "upload.wikimedia.org" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const getMetadataValue = (metadata: unknown, field: string): unknown => {
  if (!isRecord(metadata) || !isRecord(metadata[field])) return undefined;
  return metadata[field].value;
};

const getCropImageUrl = (thumbnailUrl: string): string => {
  const url = new URL(thumbnailUrl);
  url.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/, `/${COMMONS_CROP_WIDTH}px-$1`);
  return url.toString();
};

export interface CommonsFileMetadata {
  pageId: number;
  fileTitle: string;
  thumbnailUrl: string;
  cropImageUrl: string;
  thumbnailMime: "image/jpeg" | "image/png" | "image/webp";
  sourcePageUrl: string;
  creator: string;
  credit?: string;
  license: string;
  licenseUrl?: string;
  width: number;
  height: number;
  description?: string;
  descriptionWasTruncated: boolean;
  sourceSha1?: string;
  sourceRevisionAt?: string;
}

export type CommonsMetadataRejectReason =
  | "invalid-page"
  | "unsupported-media"
  | "invalid-thumbnail-url"
  | "invalid-source-page-url"
  | "missing-attribution";

export const parseCommonsFileMetadataResponse = (payload: unknown): {
  files: CommonsFileMetadata[];
  rejected: Array<{ pageId?: number; fileTitle?: string; reason: CommonsMetadataRejectReason }>;
} => {
  const pages = isRecord(payload) && isRecord(payload.query) && Array.isArray(payload.query.pages)
    ? payload.query.pages
    : [];
  const files: CommonsFileMetadata[] = [];
  const rejected: Array<{ pageId?: number; fileTitle?: string; reason: CommonsMetadataRejectReason }> = [];
  for (const page of pages) {
    const pageId = isRecord(page) && Number.isSafeInteger(page.pageid) && Number(page.pageid) > 0 ? Number(page.pageid) : undefined;
    const fileTitle = isRecord(page) && typeof page.title === "string" ? page.title : undefined;
    const reject = (reason: CommonsMetadataRejectReason): void => {
      rejected.push({ pageId, fileTitle, reason });
    };
    if (!isRecord(page) || pageId === undefined || !fileTitle || !FILE_TITLE.test(fileTitle) || !Array.isArray(page.imageinfo) || !isRecord(page.imageinfo[0])) {
      reject("invalid-page");
      continue;
    }
    const info = page.imageinfo[0];
    const mediaType = typeof info.mediatype === "string" ? info.mediatype.toUpperCase() : "";
    const mime = typeof info.mime === "string" ? info.mime.toLowerCase() : "";
    if (mediaType !== "BITMAP" || !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      reject("unsupported-media");
      continue;
    }
    const thumbnailUrl = normalizeCommonsThumbnailUrl(info.thumburl);
    if (!thumbnailUrl) {
      reject("invalid-thumbnail-url");
      continue;
    }
    if (!isHttpsHost(info.descriptionurl, "commons.wikimedia.org")) {
      reject("invalid-source-page-url");
      continue;
    }
    const metadata = info.extmetadata;
    const creator = sanitizeCommonsMetadataText(getMetadataValue(metadata, "Artist"));
    const credit = sanitizeCommonsMetadataText(getMetadataValue(metadata, "Credit"));
    const license = sanitizeCommonsMetadataText(
      getMetadataValue(metadata, "LicenseShortName") ?? getMetadataValue(metadata, "UsageTerms"),
      100,
    );
    const licenseUrl = getMetadataValue(metadata, "LicenseUrl");
    const description = sanitizeCommonsMetadataText(getMetadataValue(metadata, "ImageDescription"));
    if (!creator.value || !license.value ||
      (licenseUrl !== undefined && !isHttpsUrl(licenseUrl))) {
      reject("missing-attribution");
      continue;
    }
    const width = Number(info.width);
    const height = Number(info.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      reject("invalid-page");
      continue;
    }
    files.push({
      pageId,
      fileTitle,
      thumbnailUrl,
      cropImageUrl: getCropImageUrl(thumbnailUrl),
      thumbnailMime: mime as CommonsFileMetadata["thumbnailMime"],
      sourcePageUrl: info.descriptionurl,
      creator: creator.value,
      credit: credit.value,
      license: license.value,
      licenseUrl: typeof licenseUrl === "string" ? licenseUrl : undefined,
      width,
      height,
      description: description.value,
      descriptionWasTruncated: description.truncated,
      sourceSha1: typeof info.sha1 === "string" ? info.sha1 : undefined,
      sourceRevisionAt: typeof info.timestamp === "string" ? info.timestamp : undefined,
    });
  }
  return { files, rejected };
};

export const composeCommonsPrecisionCandidates = (input: {
  metadataPayload: unknown;
  seeds: readonly CommonsFileEvidenceSeed[];
  depictsByPageId: ReadonlyMap<number, readonly string[]>;
  entityEvidence: Pick<WikidataEntityEvidence, "qid" | "names">;
}): {
  candidates: ReturnType<typeof rankCommonsPrecisionCandidates>["candidates"];
  rejected: Array<{ fileTitle: string; reason: CommonsPrecisionRejectReason | CommonsMetadataRejectReason }>;
} => {
  const metadata = parseCommonsFileMetadataResponse(input.metadataPayload);
  const seeds = new Map(input.seeds.map((seed) => [seed.pageId, seed]));
  const uniqueMetadata = new Map<number, CommonsFileMetadata>();
  for (const file of metadata.files) {
    if (!uniqueMetadata.has(file.pageId)) uniqueMetadata.set(file.pageId, file);
  }
  const rawCandidates: CommonsPrecisionRawCandidate[] = [...uniqueMetadata.values()].flatMap((file) => {
    const seed = seeds.get(file.pageId);
    if (!seed || seed.fileTitle !== file.fileTitle || !QID.test(input.entityEvidence.qid)) return [];
    return [{
      ...file,
      targetQid: input.entityEvidence.qid,
      targetNames: input.entityEvidence.names as CommonsPrecisionName[],
      directP18: seed.directP18,
      exactCategories: seed.exactCategories,
      depictsQids: [...(input.depictsByPageId.get(file.pageId) ?? [])],
    }];
  });
  const ranked = rankCommonsPrecisionCandidates(rawCandidates);
  return {
    candidates: ranked.candidates,
    rejected: [
      ...metadata.rejected.map((item) => ({ fileTitle: item.fileTitle ?? "File:(unknown)", reason: item.reason })),
      ...ranked.rejected,
    ],
  };
};
