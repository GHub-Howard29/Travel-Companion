import { isRecord } from "./validation.ts";

export type CommonsAiLanguage = "zh-Hant" | "en" | "ja";
export interface CommonsAiCandidate {
  query: string;
  languageTag: CommonsAiLanguage;
  kind: "original" | "translation" | "transliteration";
}

const MAX_INPUT = 240;
const MAX_QUERY = 80;
const MODEL = "gemini-2.5-flash";

const normalize = (value: string): string => value.normalize("NFKC").replace(/\s+/g, " ").trim();

const isLanguage = (value: unknown): value is CommonsAiLanguage => value === "zh-Hant" || value === "en" || value === "ja";

const isCandidate = (value: unknown): value is CommonsAiCandidate => {
  if (!isRecord(value) || typeof value.query !== "string" || !isLanguage(value.languageTag) ||
    !["original", "translation", "transliteration"].includes(String(value.kind))) return false;
  const query = normalize(value.query);
  return query.length >= 2 && query.length <= MAX_QUERY && !/[\r\n]|https?:\/\//i.test(query) &&
    !Array.from(query).some((character) => character.charCodeAt(0) < 32);
};

export const parseCommonsAiCandidates = (payload: unknown): CommonsAiCandidate[] => {
  const candidates = isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates : [];
  const seen = new Set<string>();
  return candidates.filter(isCandidate).map((candidate) => ({
    query: normalize(candidate.query),
    languageTag: candidate.languageTag,
    kind: candidate.kind,
  })).filter((candidate) => {
    const key = `${candidate.languageTag}:${candidate.query.toLocaleLowerCase("en")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
};

export const requestCommonsAiCandidates = async (input: {
  rawInput: string;
  targetLanguage: CommonsAiLanguage;
  excludedQueries?: string[];
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<CommonsAiCandidate[]> => {
  const rawInput = normalize(input.rawInput);
  if (rawInput.length < 2 || rawInput.length > MAX_INPUT) throw new RangeError("AI 候選詞原始輸入長度不正確");
  const excludedQueries = (input.excludedQueries ?? []).map(normalize).filter((value) => value.length >= 2 && value.length <= MAX_QUERY).slice(0, 6);
  const response = await (input.fetchImpl ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "你是旅遊照片搜尋詞整理器。只輸出符合 JSON schema 的候選搜尋詞，不提供解釋、不提供網址、地址或座標，不捏造地名。" }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ rawInput, targetLanguage: input.targetLanguage, excludedQueries }) }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: { candidates: { type: "ARRAY", maxItems: 3, items: { type: "OBJECT", properties: { query: { type: "STRING" }, languageTag: { type: "STRING", enum: ["zh-Hant", "en", "ja"] }, kind: { type: "STRING", enum: ["original", "translation", "transliteration"] } }, required: ["query", "languageTag", "kind"] } } }, required: ["candidates"] },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(response.status === 429 ? "ai-quota-reached" : "ai-unavailable");
  const body: unknown = await response.json();
  const candidate = isRecord(body) && Array.isArray(body.candidates) && isRecord(body.candidates[0]) ? body.candidates[0] : undefined;
  const content = candidate && isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts[0] : undefined;
  const rawText = isRecord(content) && typeof content.text === "string" ? content.text : undefined;
  if (!rawText) throw new Error("ai-invalid-response");
  try {
    const parsed: unknown = JSON.parse(rawText);
    const candidates = parseCommonsAiCandidates(parsed);
    return candidates.filter((candidate) => !excludedQueries.some((excluded) => candidate.query.toLocaleLowerCase("en") === excluded.toLocaleLowerCase("en")));
  } catch {
    throw new Error("ai-invalid-response");
  }
};
