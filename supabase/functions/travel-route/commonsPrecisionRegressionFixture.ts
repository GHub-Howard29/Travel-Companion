import type {
  CommonsPrecisionCandidateTier,
  CommonsPrecisionPublicCandidate,
  CommonsPrecisionPublicResponse,
} from "./commonsPrecision.ts";

export const COMMONS_PRECISION_REGRESSION_FIXTURE_HEADER = "x-travel-companion-regression-fixture";
export const COMMONS_PRECISION_BROAD_FIXTURE = "commons-broad-manual";
export const COMMONS_PRECISION_INSUFFICIENT_FIXTURE = "commons-insufficient";

const createCandidate = (
  index: number,
  tier: CommonsPrecisionCandidateTier,
): CommonsPrecisionPublicCandidate => ({
  fileTitle: `File:V3.9.11 local fixture ${index}.svg`,
  thumbnailUrl: `/Travel-Companion/regression/commons-fixture-${index}.svg`,
  cropImageUrl: `/Travel-Companion/regression/commons-fixture-${index}.svg`,
  thumbnailMime: "image/png",
  sourcePageUrl: `https://commons.wikimedia.org/wiki/File:V3.9.11_local_fixture_${index}.svg`,
  creator: "Travel-Companion 本機回歸",
  license: "CC0 1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  width: 1200,
  height: 900,
  description: `本機合成候選照片 ${index}`,
  tier,
  reviewStatus: "needs-review",
  score: tier === "precise" ? 90 - index : 40 - index,
  scoreBreakdown: [{
    rule: tier === "precise" ? "exact-category" : "broad-association",
    points: tier === "precise" ? 90 - index : 40 - index,
    evidence: "loopback-only synthetic fixture",
  }],
  matchEvidence: [{ kind: tier === "precise" ? "exact-category" : "broad-association" }],
});

const BROAD_CANDIDATES = Array.from(
  { length: 6 },
  (_, index) => createCandidate(index + 1, "manual-review"),
);

const INSUFFICIENT_CANDIDATES = [
  createCandidate(1, "precise"),
  createCandidate(2, "precise"),
  createCandidate(3, "manual-review"),
  createCandidate(4, "manual-review"),
];

export const isLoopbackSupabaseRuntime = (supabaseUrl: string): boolean => {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "kong"].includes(url.hostname);
  } catch {
    return false;
  }
};

export const getCommonsPrecisionRegressionFixture = (
  fixtureName: string | null,
): CommonsPrecisionPublicResponse | null => {
  if (fixtureName === COMMONS_PRECISION_BROAD_FIXTURE) {
    return {
      contractVersion: "commons-precision-v2",
      state: "results",
      searchMode: "broad",
      candidates: BROAD_CANDIDATES.map((candidate) => ({ ...candidate })),
    };
  }
  if (fixtureName === COMMONS_PRECISION_INSUFFICIENT_FIXTURE) {
    return {
      contractVersion: "commons-precision-v2",
      state: "results",
      searchMode: "entity-guided",
      candidates: INSUFFICIENT_CANDIDATES.map((candidate) => ({ ...candidate })),
    };
  }
  return null;
};
