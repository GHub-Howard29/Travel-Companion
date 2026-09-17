import {
  COMMONS_PRECISION_REQUEST_TIMEOUT_MS,
  type CommonsPrecisionRequestLayer,
} from "./commonsPrecisionWikimedia.ts";
import {
  buildCommonsCategoryMembersParams,
  buildCommonsDepictsParams,
  buildCommonsFileMetadataParams,
  buildCommonsTextSearchParams,
  buildWikidataEntityEvidenceParams,
  buildWikidataEntitySearchParams,
} from "./commonsPrecisionPipeline.ts";

export const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
export const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";

export type CommonsPrecisionTransportState =
  | "ok"
  | "rate-limited"
  | "timeout"
  | "upstream-error";

export interface CommonsPrecisionPlannedRequest {
  layer: CommonsPrecisionRequestLayer;
  url: string;
  timeoutMs: typeof COMMONS_PRECISION_REQUEST_TIMEOUT_MS;
}

const isSafeContinuation = (continuation: string | undefined): continuation is string =>
  continuation === undefined || (continuation.length > 0 && continuation.length <= 1_000);

const requireQid = (qid: string): string => {
  if (!/^Q[1-9][0-9]*$/.test(qid)) throw new RangeError("QID 格式不正確");
  return qid;
};

const requirePageIds = (pageIds: readonly number[]): number[] => {
  const values = [...new Set(pageIds.filter((pageId) => Number.isSafeInteger(pageId) && pageId > 0))];
  if (values.length === 0) throw new RangeError("至少需要一筆有效 Commons page ID");
  return values;
};

const toPlannedRequest = (layer: CommonsPrecisionRequestLayer, endpoint: string, params: URLSearchParams): CommonsPrecisionPlannedRequest => ({
  layer,
  url: `${endpoint}?${params.toString()}`,
  timeoutMs: COMMONS_PRECISION_REQUEST_TIMEOUT_MS,
});

export type CommonsPrecisionPlanInput =
  | { layer: "resolve-entity"; query: string; language: string }
  | { layer: "read-entity-evidence"; qids: readonly string[]; targetLanguage: string }
  | { layer: "read-p18-files"; fileTitles: readonly string[] }
  | { layer: "read-category-files"; category: string; continuation?: string }
  | { layer: "read-structured-data"; pageIds: readonly number[] }
  | { layer: "search-adopted-text"; query: string; offset?: number };

export const planCommonsPrecisionRequest = (input: CommonsPrecisionPlanInput): CommonsPrecisionPlannedRequest => {
  switch (input.layer) {
    case "resolve-entity":
      return toPlannedRequest(input.layer, WIKIDATA_API_URL, buildWikidataEntitySearchParams(input.query, input.language));
    case "read-entity-evidence":
      return toPlannedRequest(input.layer, WIKIDATA_API_URL, buildWikidataEntityEvidenceParams(input.qids.map(requireQid), input.targetLanguage));
    case "read-p18-files":
      return toPlannedRequest(input.layer, COMMONS_API_URL, buildCommonsFileMetadataParams(input.fileTitles));
    case "read-category-files":
      if (!isSafeContinuation(input.continuation)) throw new RangeError("Category continuation 格式不正確");
      return toPlannedRequest(input.layer, COMMONS_API_URL, buildCommonsCategoryMembersParams(input.category, input.continuation));
    case "read-structured-data":
      return toPlannedRequest(input.layer, COMMONS_API_URL, buildCommonsDepictsParams(requirePageIds(input.pageIds)));
    case "search-adopted-text":
      return toPlannedRequest(input.layer, COMMONS_API_URL, buildCommonsTextSearchParams(input.query, input.offset));
  }
};

export const isAllowedCommonsPrecisionApiUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "www.wikidata.org" || url.hostname === "commons.wikimedia.org") &&
      url.pathname === "/w/api.php";
  } catch {
    return false;
  }
};

export const classifyCommonsPrecisionHttpStatus = (status: number): CommonsPrecisionTransportState => {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "rate-limited";
  if (status === 408 || status === 504) return "timeout";
  return "upstream-error";
};

export const classifyCommonsPrecisionTransportFailure = (error: unknown): CommonsPrecisionTransportState => {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && /timeout|timed out|aborted/i.test(error.name + " " + error.message)) return "timeout";
  return "upstream-error";
};

export const isRetryableCommonsPrecisionState = (state: CommonsPrecisionTransportState): boolean =>
  state === "rate-limited" || state === "timeout" || state === "upstream-error";
