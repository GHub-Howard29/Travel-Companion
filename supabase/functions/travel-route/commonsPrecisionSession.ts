import {
  COMMONS_PRECISION_CONTRACT_VERSION,
  COMMONS_PRECISION_MAX_INSPECTED,
  COMMONS_PRECISION_MAX_DURATION_MS,
  COMMONS_PRECISION_MAX_REQUESTS,
} from "./commonsPrecision.ts";
import type { CommonsPrecisionRequestLayer } from "./commonsPrecisionWikimedia.ts";

export const COMMONS_PRECISION_SESSION_TTL_MS = 10 * 60 * 1_000;
export const COMMONS_PRECISION_TOKEN_MAX_BYTES = 4_096;

const QID = /^Q[1-9][0-9]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
type CommonsPrecisionSessionLayer = Extract<CommonsPrecisionRequestLayer, "read-category-files" | "search-adopted-text"> | "read-related-category-files";
const CONTINUABLE_LAYER = new Set<CommonsPrecisionSessionLayer>([
  "read-category-files",
  "search-adopted-text",
  "read-related-category-files",
]);

export interface CommonsPrecisionSessionPayload {
  contractVersion: typeof COMMONS_PRECISION_CONTRACT_VERSION;
  qid: string;
  adoptedQueryHash: string;
  layer: CommonsPrecisionSessionLayer;
  continuation: string;
  seenPageIds: number[];
  requestCount: number;
  durationMs: number;
  extensionCategory?: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

export type OpenCommonsPrecisionTokenResult =
  | { status: "valid"; session: CommonsPrecisionSessionPayload }
  | { status: "session-expired" };

const encoder = new TextEncoder();
const asBufferSource = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

const isValidSessionPayload = (value: unknown): value is CommonsPrecisionSessionPayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommonsPrecisionSessionPayload>;
  return candidate.contractVersion === COMMONS_PRECISION_CONTRACT_VERSION &&
    typeof candidate.qid === "string" && QID.test(candidate.qid) &&
    typeof candidate.adoptedQueryHash === "string" && SHA256.test(candidate.adoptedQueryHash) &&
    typeof candidate.layer === "string" && CONTINUABLE_LAYER.has(candidate.layer) &&
    typeof candidate.continuation === "string" && candidate.continuation.length > 0 && candidate.continuation.length <= 1_000 &&
    Array.isArray(candidate.seenPageIds) && candidate.seenPageIds.length <= COMMONS_PRECISION_MAX_INSPECTED &&
    candidate.seenPageIds.every((pageId) => Number.isSafeInteger(pageId) && pageId > 0) &&
    typeof candidate.requestCount === "number" && Number.isSafeInteger(candidate.requestCount) && candidate.requestCount >= 0 && candidate.requestCount <= COMMONS_PRECISION_MAX_REQUESTS &&
    typeof candidate.durationMs === "number" && Number.isSafeInteger(candidate.durationMs) && candidate.durationMs >= 0 && candidate.durationMs <= COMMONS_PRECISION_MAX_DURATION_MS &&
    (candidate.extensionCategory === undefined || (typeof candidate.extensionCategory === "string" && candidate.extensionCategory.length > 0 && candidate.extensionCategory.length <= 200)) &&
    typeof candidate.issuedAtMs === "number" && Number.isSafeInteger(candidate.issuedAtMs) &&
    typeof candidate.expiresAtMs === "number" && Number.isSafeInteger(candidate.expiresAtMs) &&
    candidate.expiresAtMs > candidate.issuedAtMs &&
    candidate.expiresAtMs - candidate.issuedAtMs <= COMMONS_PRECISION_SESSION_TTL_MS;
};

export const hashAdoptedCommonsQuery = async (query: string): Promise<string> => {
  const normalized = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 120) throw new RangeError("採用搜尋詞須為 2 至 120 個字元");
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(encoder.encode(normalized)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const importCommonsPrecisionTokenKey = async (secret: Uint8Array): Promise<CryptoKey> => {
  if (secret.length !== 32) throw new RangeError("候選 session token 金鑰必須為 256-bit");
  return crypto.subtle.importKey("raw", asBufferSource(secret), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

export const sealCommonsPrecisionNextPageToken = async (
  input: {
    qid: string;
    adoptedQueryHash: string;
    layer: CommonsPrecisionSessionPayload["layer"];
    continuation: string;
    seenPageIds: readonly number[];
    requestCount?: number;
    durationMs?: number;
    extensionCategory?: string;
  },
  key: CryptoKey,
  nowMs: number,
  nonce?: Uint8Array,
): Promise<string> => {
  if (!QID.test(input.qid) || !SHA256.test(input.adoptedQueryHash) || !CONTINUABLE_LAYER.has(input.layer) ||
    !input.continuation || input.continuation.length > 1_000) {
    throw new RangeError("候選 session token 內容不正確");
  }
  if (!Number.isSafeInteger(input.requestCount ?? 0) || (input.requestCount ?? 0) < 0 || (input.requestCount ?? 0) > COMMONS_PRECISION_MAX_REQUESTS ||
    !Number.isSafeInteger(input.durationMs ?? 0) || (input.durationMs ?? 0) < 0 || (input.durationMs ?? 0) > COMMONS_PRECISION_MAX_DURATION_MS ||
    (input.extensionCategory !== undefined && (!input.extensionCategory.trim() || input.extensionCategory.length > 200))) {
    throw new RangeError("候選 session 預算或延伸分類不正確");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError("token 時間不正確");
  const seenPageIds = [...new Set(input.seenPageIds)].filter((pageId) => Number.isSafeInteger(pageId) && pageId > 0).slice(0, COMMONS_PRECISION_MAX_INSPECTED);
  const payload: CommonsPrecisionSessionPayload = {
    contractVersion: COMMONS_PRECISION_CONTRACT_VERSION,
    qid: input.qid,
    adoptedQueryHash: input.adoptedQueryHash,
    layer: input.layer,
    continuation: input.continuation,
    seenPageIds,
    requestCount: input.requestCount ?? 0,
    durationMs: input.durationMs ?? 0,
    ...(input.extensionCategory ? { extensionCategory: input.extensionCategory } : {}),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + COMMONS_PRECISION_SESSION_TTL_MS,
  };
  const iv = nonce ?? crypto.getRandomValues(new Uint8Array(12));
  if (iv.length !== 12) throw new RangeError("AES-GCM nonce 必須為 96-bit");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv), additionalData: asBufferSource(encoder.encode(COMMONS_PRECISION_CONTRACT_VERSION)) },
    key,
    asBufferSource(encoder.encode(JSON.stringify(payload))),
  );
  const tokenBytes = new Uint8Array(iv.length + ciphertext.byteLength);
  tokenBytes.set(iv);
  tokenBytes.set(new Uint8Array(ciphertext), iv.length);
  if (tokenBytes.length > COMMONS_PRECISION_TOKEN_MAX_BYTES) throw new RangeError("候選 session token 超過長度限制");
  return `cp1.${toBase64Url(tokenBytes)}`;
};

export const openCommonsPrecisionNextPageToken = async (
  token: string,
  key: CryptoKey,
  input: { nowMs: number; qid?: string; adoptedQueryHash: string },
): Promise<OpenCommonsPrecisionTokenResult> => {
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0 || (input.qid !== undefined && !QID.test(input.qid)) || !SHA256.test(input.adoptedQueryHash)) {
    return { status: "session-expired" };
  }
  if (typeof token !== "string" || !token.startsWith("cp1.")) return { status: "session-expired" };
  const tokenBytes = fromBase64Url(token.slice(4));
  if (!tokenBytes || tokenBytes.length < 13 || tokenBytes.length > COMMONS_PRECISION_TOKEN_MAX_BYTES) {
    return { status: "session-expired" };
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBufferSource(tokenBytes.slice(0, 12)), additionalData: asBufferSource(encoder.encode(COMMONS_PRECISION_CONTRACT_VERSION)) },
      key,
      asBufferSource(tokenBytes.slice(12)),
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    if (!isValidSessionPayload(parsed) || parsed.expiresAtMs <= input.nowMs ||
      (input.qid !== undefined && parsed.qid !== input.qid) || parsed.adoptedQueryHash !== input.adoptedQueryHash) {
      return { status: "session-expired" };
    }
    return { status: "valid", session: parsed };
  } catch {
    return { status: "session-expired" };
  }
};
