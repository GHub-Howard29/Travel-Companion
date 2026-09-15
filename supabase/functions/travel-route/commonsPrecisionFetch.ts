import {
  classifyCommonsPrecisionHttpStatus,
  classifyCommonsPrecisionTransportFailure,
  isAllowedCommonsPrecisionApiUrl,
  type CommonsPrecisionPlannedRequest,
} from "./commonsPrecisionTransport.ts";
import type { CommonsPrecisionTransportResult } from "./commonsPrecisionEngine.ts";

const CONTACT_URL = /^https:\/\/[^\s]+$/;

export const createCommonsPrecisionUserAgent = (contactUrl: string): string => {
  const value = contactUrl.trim();
  if (!CONTACT_URL.test(value)) throw new RangeError("Wikimedia 聯絡網址必須是公開 HTTPS URL");
  return `Travel-Companion/3.9.1 (${value})`;
};

export const executeCommonsPrecisionRequest = async (
  plan: CommonsPrecisionPlannedRequest,
  contactUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommonsPrecisionTransportResult> => {
  if (!isAllowedCommonsPrecisionApiUrl(plan.url)) return { state: "upstream-error" };
  try {
    const response = await fetchImpl(plan.url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": createCommonsPrecisionUserAgent(contactUrl),
      },
      redirect: "error",
      signal: AbortSignal.timeout(plan.timeoutMs),
    });
    const state = classifyCommonsPrecisionHttpStatus(response.status);
    if (state !== "ok") return { state, status: response.status };
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return { state: "upstream-error", status: response.status };
    return { state: "ok", status: response.status, payload: await response.json() };
  } catch (error) {
    return { state: classifyCommonsPrecisionTransportFailure(error) };
  }
};
