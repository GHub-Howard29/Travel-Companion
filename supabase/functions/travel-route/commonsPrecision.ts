export const COMMONS_PRECISION_MIN_SCORE = 25;
export const COMMONS_PRECISION_PAGE_SIZE = 6;
export const COMMONS_PRECISION_MAX_REQUESTS = 9;
export const COMMONS_PRECISION_MAX_DURATION_MS = 20_000;
export const COMMONS_PRECISION_MAX_INSPECTED = 30;
export const COMMONS_PRECISION_CONTRACT_VERSION = "commons-precision-v1";

export type CommonsPrecisionState =
  | "results"
  | "no-suitable-image"
  | "entity-not-found"
  | "entity-ambiguous"
  | "inspection-limit-reached"
  | "project-quota-reached"
  | "in-progress"
  | "offline"
  | "rate-limited"
  | "timeout"
  | "upstream-error"
  | "session-expired";

export type CommonsPrecisionEvidenceKind =
  | "p18"
  | "exact-category"
  | "structured-depicts"
  | "description"
  | "filename"
  | "broad-association"
  | "wrong-entity";

export type CommonsPrecisionVerifiedExclusion =
  | "wrong-entity"
  | "disallowed-subject";

export interface CommonsPrecisionName {
  value: string;
  languageTag: string;
}

export interface CommonsPrecisionRawCandidate {
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
  descriptionWasTruncated?: boolean;
  sourceSha1?: string;
  sourceRevisionAt?: string;
  targetQid: string;
  targetNames: CommonsPrecisionName[];
  directP18?: boolean;
  exactCategories?: string[];
  depictsQids?: string[];
  reliableCapturedAt?: string;
  currentAppearanceVerified?: boolean;
  verifiedBroadAssociation?: boolean;
  verifiedInteriorFragment?: boolean;
  verifiedExclusions?: CommonsPrecisionVerifiedExclusion[];
}

export interface CommonsPrecisionScoreItem {
  rule: string;
  points: number;
  evidence: string;
}

export interface CommonsPrecisionMatchEvidence {
  kind: CommonsPrecisionEvidenceKind;
  qid?: string;
  category?: string;
  queryLanguage?: string;
}

export interface CommonsPrecisionCandidate extends CommonsPrecisionRawCandidate {
  reviewStatus: "needs-review";
  score: number;
  scoreBreakdown: CommonsPrecisionScoreItem[];
  matchEvidence: CommonsPrecisionMatchEvidence[];
}

export type CommonsPrecisionRejectReason =
  | "invalid-attribution"
  | "license-not-allowed"
  | "source-not-allowed"
  | "image-too-small"
  | "wrong-entity"
  | "disallowed-subject"
  | "no-strong-evidence"
  | "score-below-threshold";

export type CommonsPrecisionEvaluation =
  | { accepted: true; candidate: CommonsPrecisionCandidate }
  | { accepted: false; reason: CommonsPrecisionRejectReason };

export interface CommonsPrecisionResponse {
  contractVersion: typeof COMMONS_PRECISION_CONTRACT_VERSION;
  state: CommonsPrecisionState;
  candidates: CommonsPrecisionCandidate[];
  nextPageToken?: string;
}

export interface CommonsPrecisionPublicCandidate {
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
  descriptionWasTruncated?: boolean;
  sourceSha1?: string;
  sourceRevisionAt?: string;
  reviewStatus: "needs-review";
  score: number;
  scoreBreakdown: CommonsPrecisionScoreItem[];
  matchEvidence: CommonsPrecisionMatchEvidence[];
}

export interface CommonsPrecisionPublicResponse {
  contractVersion: typeof COMMONS_PRECISION_CONTRACT_VERSION;
  state: CommonsPrecisionState;
  candidates: CommonsPrecisionPublicCandidate[];
  nextPageToken?: string;
}

export const projectCommonsPrecisionCandidate = (
  candidate: CommonsPrecisionCandidate,
): CommonsPrecisionPublicCandidate => ({
  fileTitle: candidate.fileTitle,
  thumbnailUrl: candidate.thumbnailUrl,
  cropImageUrl: candidate.cropImageUrl,
  thumbnailMime: candidate.thumbnailMime,
  sourcePageUrl: candidate.sourcePageUrl,
  creator: candidate.creator,
  credit: candidate.credit,
  license: candidate.license,
  licenseUrl: candidate.licenseUrl,
  width: candidate.width,
  height: candidate.height,
  description: candidate.description,
  descriptionWasTruncated: candidate.descriptionWasTruncated,
  sourceSha1: candidate.sourceSha1,
  sourceRevisionAt: candidate.sourceRevisionAt,
  reviewStatus: candidate.reviewStatus,
  score: candidate.score,
  scoreBreakdown: candidate.scoreBreakdown.map((item) => ({ ...item })),
  matchEvidence: candidate.matchEvidence.map((item) => ({ ...item })),
});

const OPAQUE_NEXT_PAGE_TOKEN = /^cp1\.[A-Za-z0-9_-]{16,4096}$/;

export const projectCommonsPrecisionResponse = (input: {
  state: CommonsPrecisionState;
  candidates: readonly CommonsPrecisionCandidate[];
  nextPageToken?: string;
}): CommonsPrecisionPublicResponse => {
  if (input.candidates.length > COMMONS_PRECISION_PAGE_SIZE ||
    new Set(input.candidates.map((candidate) => candidate.fileTitle)).size !== input.candidates.length) {
    throw new RangeError("候選回應數量或去重契約不正確");
  }
  if (input.nextPageToken !== undefined &&
    (input.state !== "results" || !OPAQUE_NEXT_PAGE_TOKEN.test(input.nextPageToken))) {
    throw new RangeError("nextPageToken 必須為同一 session 的不透明 token");
  }
  return {
    contractVersion: COMMONS_PRECISION_CONTRACT_VERSION,
    state: input.state,
    candidates: input.candidates.map(projectCommonsPrecisionCandidate),
    ...(input.state === "results" && input.nextPageToken !== undefined ? { nextPageToken: input.nextPageToken } : {}),
  };
};

const normalizeText = (value: string): string => value
  .normalize("NFKC")
  .toLocaleLowerCase("en")
  .replace(/[_\s]+/g, " ")
  .trim();

const isLetterOrNumber = (value: string | undefined): boolean =>
  Boolean(value && /[\p{L}\p{N}]/u.test(value));

const containsWholeName = (text: string, rawName: string): boolean => {
  const haystack = normalizeText(text);
  const name = normalizeText(rawName);
  if (!name) return false;
  let start = haystack.indexOf(name);
  while (start >= 0) {
    const end = start + name.length;
    const needsBoundary = /[\p{Script=Latin}\p{N}]/u.test(name);
    if (!needsBoundary || (!isLetterOrNumber(haystack[start - 1]) && !isLetterOrNumber(haystack[end]))) {
      return true;
    }
    start = haystack.indexOf(name, start + 1);
  }
  return false;
};

const getFilenameText = (fileTitle: string): string => fileTitle
  .replace(/^File:/i, "")
  .replace(/\.[^.]+$/, "");

const isHttpsHost = (value: string | undefined, hostname: string): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname;
  } catch {
    return false;
  }
};

const isHttpsUrl = (value: string | undefined): boolean => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const isAllowedCommonsPrecisionLicense = (license: string): boolean =>
  /^(?:CC0(?: 1\.0)?|Public domain|CC BY (?:1\.0|2\.0|2\.5|3\.0|4\.0))$/i.test(license.trim());

const hasValidAttribution = (candidate: CommonsPrecisionRawCandidate): boolean => {
  const isCcBy = /^CC BY /i.test(candidate.license.trim());
  return Boolean(candidate.creator.trim()) && candidate.creator.length <= 500 &&
    (!candidate.credit || candidate.credit.length <= 500) &&
    (!isCcBy || isHttpsUrl(candidate.licenseUrl));
};

const getStrongEvidenceRank = (candidate: CommonsPrecisionCandidate): number => {
  const kinds = new Set(candidate.matchEvidence.map((evidence) => evidence.kind));
  if (kinds.has("p18")) return 4;
  if (kinds.has("exact-category")) return 3;
  if (kinds.has("structured-depicts")) return 2;
  if (kinds.has("description")) return 1;
  return 0;
};

const compareCanonicalTitle = (left: string, right: string): number => {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return a < b ? -1 : a > b ? 1 : 0;
};

export const evaluateCommonsPrecisionCandidate = (
  input: CommonsPrecisionRawCandidate,
): CommonsPrecisionEvaluation => {
  if (!isAllowedCommonsPrecisionLicense(input.license)) {
    return { accepted: false, reason: "license-not-allowed" };
  }
  if (!hasValidAttribution(input)) {
    return { accepted: false, reason: "invalid-attribution" };
  }
  if (!isHttpsHost(input.sourcePageUrl, "commons.wikimedia.org") ||
    !isHttpsHost(input.thumbnailUrl, "upload.wikimedia.org") ||
    !isHttpsHost(input.cropImageUrl, "upload.wikimedia.org")) {
    return { accepted: false, reason: "source-not-allowed" };
  }
  if (!input.fileTitle.startsWith("File:") || !/^Q[1-9][0-9]*$/.test(input.targetQid)) {
    return { accepted: false, reason: "source-not-allowed" };
  }
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || Math.min(input.width, input.height) < 1200) {
    return { accepted: false, reason: "image-too-small" };
  }
  if (input.verifiedExclusions?.includes("wrong-entity")) {
    return { accepted: false, reason: "wrong-entity" };
  }
  if (input.verifiedExclusions?.includes("disallowed-subject")) {
    return { accepted: false, reason: "disallowed-subject" };
  }

  const scoreBreakdown: CommonsPrecisionScoreItem[] = [];
  const matchEvidence: CommonsPrecisionMatchEvidence[] = [];
  const names = input.targetNames.filter((name) => Boolean(normalizeText(name.value))).slice(0, 24);
  const descriptionName = !input.descriptionWasTruncated && input.description && input.description.length <= 500
    ? names.find((name) => containsWholeName(input.description!, name.value))
    : undefined;
  const filenameName = names.find((name) => containsWholeName(getFilenameText(input.fileTitle), name.value));
  const depictsTarget = input.depictsQids?.includes(input.targetQid) ?? false;

  if (input.directP18) {
    scoreBreakdown.push({ rule: "direct-p18", points: 45, evidence: input.targetQid });
    matchEvidence.push({ kind: "p18", qid: input.targetQid });
  }
  const exactCategories = [...new Set(input.exactCategories?.map((category) => category.trim()).filter(Boolean) ?? [])].slice(0, 10);
  if (exactCategories.length > 0) {
    scoreBreakdown.push({ rule: "exact-category", points: 35, evidence: exactCategories.join(" | ") });
    matchEvidence.push(...exactCategories.map((category) => ({
      kind: "exact-category" as const,
      qid: input.targetQid,
      category,
    })));
  }
  if (depictsTarget) {
    scoreBreakdown.push({ rule: "structured-depicts", points: 25, evidence: input.targetQid });
    matchEvidence.push({ kind: "structured-depicts", qid: input.targetQid });
  } else if (descriptionName) {
    scoreBreakdown.push({ rule: "exact-description", points: 25, evidence: descriptionName.value });
    matchEvidence.push({ kind: "description", qid: input.targetQid, queryLanguage: descriptionName.languageTag });
  }
  if (filenameName) {
    scoreBreakdown.push({ rule: "exact-filename", points: 15, evidence: filenameName.value });
    matchEvidence.push({ kind: "filename", qid: input.targetQid, queryLanguage: filenameName.languageTag });
  }
  if (Math.min(input.width, input.height) >= 1600) {
    scoreBreakdown.push({ rule: "source-short-edge-1600", points: 10, evidence: String(Math.min(input.width, input.height)) });
  }
  if (input.reliableCapturedAt && input.currentAppearanceVerified && !Number.isNaN(Date.parse(input.reliableCapturedAt))) {
    scoreBreakdown.push({ rule: "verified-current-capture-date", points: 5, evidence: input.reliableCapturedAt });
  }
  if (input.verifiedInteriorFragment) {
    scoreBreakdown.push({ rule: "verified-interior-fragment", points: -25, evidence: "metadata" });
  }
  if (input.verifiedBroadAssociation) {
    scoreBreakdown.push({ rule: "broad-association", points: -30, evidence: input.targetQid });
    matchEvidence.push({ kind: "broad-association", qid: input.targetQid });
  }

  const strongEvidence = matchEvidence.some((evidence) =>
    ["p18", "exact-category", "structured-depicts", "description"].includes(evidence.kind));
  if (!strongEvidence) return { accepted: false, reason: "no-strong-evidence" };
  const score = scoreBreakdown.reduce((total, item) => total + item.points, 0);
  if (score < COMMONS_PRECISION_MIN_SCORE) return { accepted: false, reason: "score-below-threshold" };

  return {
    accepted: true,
    candidate: {
      ...input,
      reviewStatus: "needs-review",
      score,
      scoreBreakdown,
      matchEvidence,
    },
  };
};

export const rankCommonsPrecisionCandidates = (
  inputs: CommonsPrecisionRawCandidate[],
): { candidates: CommonsPrecisionCandidate[]; rejected: Array<{ fileTitle: string; reason: CommonsPrecisionRejectReason }> } => {
  const accepted: CommonsPrecisionCandidate[] = [];
  const rejected: Array<{ fileTitle: string; reason: CommonsPrecisionRejectReason }> = [];
  for (const input of inputs) {
    const result = evaluateCommonsPrecisionCandidate(input);
    if (result.accepted) accepted.push(result.candidate);
    else rejected.push({ fileTitle: input.fileTitle, reason: result.reason });
  }
  const verifiedDate = (candidate: CommonsPrecisionCandidate): number =>
    candidate.currentAppearanceVerified ? (Date.parse(candidate.reliableCapturedAt ?? "") || 0) : 0;
  accepted.sort((left, right) =>
    right.score - left.score ||
    getStrongEvidenceRank(right) - getStrongEvidenceRank(left) ||
    Math.min(right.width, right.height) - Math.min(left.width, left.height) ||
    verifiedDate(right) - verifiedDate(left) ||
    compareCanonicalTitle(left.fileTitle, right.fileTitle));
  return { candidates: accepted, rejected };
};

const EMPTY_ONLY_STATES = new Set<CommonsPrecisionState>([
  "no-suitable-image",
  "entity-not-found",
  "entity-ambiguous",
  "project-quota-reached",
  "in-progress",
  "session-expired",
]);
const PARTIAL_STATES = new Set<CommonsPrecisionState>([
  "inspection-limit-reached",
  "offline",
  "rate-limited",
  "timeout",
  "upstream-error",
]);

export const validateCommonsPrecisionResponse = (response: CommonsPrecisionResponse): boolean => {
  if (response.contractVersion !== COMMONS_PRECISION_CONTRACT_VERSION) return false;
  if (response.candidates.length > COMMONS_PRECISION_PAGE_SIZE) return false;
  if (new Set(response.candidates.map((candidate) => candidate.fileTitle)).size !== response.candidates.length) return false;
  if (response.candidates.some((candidate) => candidate.reviewStatus !== "needs-review" || candidate.score < COMMONS_PRECISION_MIN_SCORE)) return false;
  if (response.state === "results") return response.candidates.length > 0;
  if (EMPTY_ONLY_STATES.has(response.state)) return response.candidates.length === 0 && response.nextPageToken === undefined;
  if (PARTIAL_STATES.has(response.state)) return response.nextPageToken === undefined;
  return false;
};

export const hasReachedCommonsInspectionLimit = (input: {
  requestCount: number;
  elapsedMs: number;
  inspectedCount: number;
}): boolean => input.requestCount >= COMMONS_PRECISION_MAX_REQUESTS ||
  input.elapsedMs >= COMMONS_PRECISION_MAX_DURATION_MS ||
  input.inspectedCount >= COMMONS_PRECISION_MAX_INSPECTED;
