import { isRecord } from "./validation.ts";
import {
  COMMONS_PRECISION_CONTRACT_VERSION,
  COMMONS_PRECISION_MAX_DURATION_MS,
  COMMONS_PRECISION_MAX_INSPECTED,
  COMMONS_PRECISION_MAX_REQUESTS,
  type CommonsPrecisionResolvedEntity,
  type CommonsPrecisionResponse,
  type CommonsPrecisionState,
} from "./commonsPrecision.ts";
import {
  buildCommonsFileMetadataParams,
  composeCommonsPrecisionCandidates,
  parseCommonsFileMetadataResponse,
} from "./commonsPrecisionPipeline.ts";
import {
  COMMONS_API_URL,
  planCommonsPrecisionRequest,
  type CommonsPrecisionPlannedRequest,
  type CommonsPrecisionTransportState,
} from "./commonsPrecisionTransport.ts";
import {
  mergeCommonsFileEvidence,
  parseCommonsCategoryMembersResponse,
  parseCommonsDepictsResponse,
  parseWikidataEntityEvidenceResponse,
  parseWikidataSearchResponse,
  resolveUniqueWikidataEntity,
  type CommonsFileEvidenceInput,
  type WikidataEntityEvidence,
} from "./commonsPrecisionWikimedia.ts";

export const COMMONS_PRECISION_EXCLUDED_INSTANCE_OF_QIDS = new Set([
  "Q5", "Q43229", "Q1656682", "Q4167410", "Q14897293", "Q4167836", "Q13406463",
]);

export interface CommonsPrecisionTransportResult {
  state: CommonsPrecisionTransportState | "project-quota-reached" | "in-progress";
  payload?: unknown;
  status?: number;
}

export interface CommonsPrecisionEngineDependencies {
  request: (plan: CommonsPrecisionPlannedRequest) => Promise<CommonsPrecisionTransportResult>;
  now?: () => number;
}

export interface CommonsPrecisionEngineResult {
  response: CommonsPrecisionResponse;
  qid?: string;
  requestCount: number;
  inspectedCount: number;
  durationMs: number;
  upstreamStatus?: 429 | 503;
  allCandidatesRejected: boolean;
  entityEvidence?: WikidataEntityEvidence;
  continuation?: { layer: "read-category-files" | "search-adopted-text"; value: string };
  seenPageIds: number[];
  rejectedByReason: Record<string, number>;
}

const countRejectedReasons = (items: readonly { reason: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  return counts;
};

const extractPages = (payload: unknown): unknown[] =>
  isRecord(payload) && isRecord(payload.query) && Array.isArray(payload.query.pages) ? payload.query.pages : [];

const combineMetadataPayloads = (payloads: readonly unknown[]): unknown => ({
  query: { pages: payloads.flatMap(extractPages) },
});

const mapTransportState = (state: CommonsPrecisionTransportResult["state"]): Extract<CommonsPrecisionState, "rate-limited" | "timeout" | "upstream-error" | "project-quota-reached" | "in-progress"> =>
  state === "rate-limited" ? "rate-limited"
    : state === "timeout" ? "timeout"
    : state === "project-quota-reached" ? "project-quota-reached"
    : state === "in-progress" ? "in-progress"
    : "upstream-error";

export const runCommonsPrecisionEngine = async (
  input: { query: string; language: string; selectedEntityQid?: string },
  dependencies: CommonsPrecisionEngineDependencies,
): Promise<CommonsPrecisionEngineResult> => {
  const now = dependencies.now ?? Date.now;
  const startedAtMs = now();
  let requestCount = 0;
  let inspectedCount = 0;
  let upstreamStatus: 429 | 503 | undefined;
  const metadataPayloads: unknown[] = [];
  const evidenceInputs: CommonsFileEvidenceInput[] = [];
  let rejectedByReason: Record<string, number> = {};
  const responseContext: {
    resolvedEntity?: CommonsPrecisionResolvedEntity;
    entityChoices?: CommonsPrecisionResolvedEntity[];
  } = {};

  let nextContinuation: CommonsPrecisionEngineResult["continuation"];
  const engineContext: { entityEvidence?: WikidataEntityEvidence } = {};
  const finish = (state: CommonsPrecisionState, candidates: CommonsPrecisionResponse["candidates"] = [], qid?: string): CommonsPrecisionEngineResult => ({
    response: { contractVersion: COMMONS_PRECISION_CONTRACT_VERSION, state, candidates, ...responseContext },
    qid,
    requestCount,
    inspectedCount,
    durationMs: Math.min(COMMONS_PRECISION_MAX_DURATION_MS, Math.max(0, now() - startedAtMs)),
    upstreamStatus,
    allCandidatesRejected: state === "no-suitable-image" && inspectedCount > 0,
    entityEvidence: engineContext.entityEvidence,
    continuation: nextContinuation,
    seenPageIds: evidenceInputs.map((item) => item.pageId).slice(0, COMMONS_PRECISION_MAX_INSPECTED),
    rejectedByReason,
  });

  const perform = async (plan: CommonsPrecisionPlannedRequest): Promise<{ payload?: unknown; stopped?: CommonsPrecisionEngineResult }> => {
    if (requestCount >= COMMONS_PRECISION_MAX_REQUESTS || now() - startedAtMs >= COMMONS_PRECISION_MAX_DURATION_MS || inspectedCount >= COMMONS_PRECISION_MAX_INSPECTED) {
      return { stopped: finish("inspection-limit-reached") };
    }
    requestCount += 1;
    const result = await dependencies.request(plan);
    if (result.state !== "ok") {
      if (result.status === 429 || result.status === 503) upstreamStatus = result.status;
      return { stopped: finish(mapTransportState(result.state)) };
    }
    return { payload: result.payload };
  };

  const search = await perform(planCommonsPrecisionRequest({ layer: "resolve-entity", query: input.query, language: input.language }));
  if (search.stopped) return search.stopped;
  const entities = parseWikidataSearchResponse(search.payload);
  if (entities.length === 0) return finish("entity-not-found");

  const evidenceRequest = await perform(planCommonsPrecisionRequest({ layer: "read-entity-evidence", qids: entities.map((entity) => entity.qid), targetLanguage: input.language }));
  if (evidenceRequest.stopped) return evidenceRequest.stopped;
  const evidenceByQid = new Map<string, WikidataEntityEvidence>();
  for (const entity of entities) {
    const evidence = parseWikidataEntityEvidenceResponse(evidenceRequest.payload, entity.qid, input.language);
    if (evidence) evidenceByQid.set(entity.qid, evidence);
  }
  const initialResolution = resolveUniqueWikidataEntity(
    input.query,
    entities,
    new Map([...evidenceByQid].map(([qid, evidence]) => [qid, evidence.instanceOfQids])),
    COMMONS_PRECISION_EXCLUDED_INSTANCE_OF_QIDS,
  );
  if (initialResolution.state === "entity-ambiguous") {
    responseContext.entityChoices = entities.flatMap((entity) => {
      const candidateResolution = resolveUniqueWikidataEntity(
        input.query,
        [entity],
        new Map([[entity.qid, evidenceByQid.get(entity.qid)?.instanceOfQids ?? []]]),
        COMMONS_PRECISION_EXCLUDED_INSTANCE_OF_QIDS,
      );
      return candidateResolution.state === "resolved" ? [{ qid: entity.qid, label: entity.label }] : [];
    });
  }
  const resolution = input.selectedEntityQid && initialResolution.state === "entity-ambiguous"
    ? resolveUniqueWikidataEntity(
      input.query,
      entities.filter((entity) => entity.qid === input.selectedEntityQid),
      new Map([[input.selectedEntityQid, evidenceByQid.get(input.selectedEntityQid)?.instanceOfQids ?? []]]),
      COMMONS_PRECISION_EXCLUDED_INSTANCE_OF_QIDS,
    )
    : initialResolution;
  if (resolution.state !== "resolved") return finish(resolution.state);
  responseContext.resolvedEntity = { qid: resolution.entity.qid, label: resolution.entity.label };
  const entityEvidence = evidenceByQid.get(resolution.entity.qid);
  if (!entityEvidence) return finish("entity-not-found");
  engineContext.entityEvidence = entityEvidence;

  if (entityEvidence.p18FileTitles.length > 0) {
    const p18 = await perform(planCommonsPrecisionRequest({ layer: "read-p18-files", fileTitles: entityEvidence.p18FileTitles }));
    if (p18.stopped) return p18.stopped;
    metadataPayloads.push(p18.payload);
    for (const file of parseCommonsFileMetadataResponse(p18.payload).files) evidenceInputs.push({ pageId: file.pageId, fileTitle: file.fileTitle, kind: "p18" });
  }

  for (const category of entityEvidence.p373Categories.slice(0, 2)) {
    const categoryResult = await perform(planCommonsPrecisionRequest({ layer: "read-category-files", category }));
    if (categoryResult.stopped) return categoryResult.stopped;
    const page = parseCommonsCategoryMembersResponse(categoryResult.payload);
    if (!nextContinuation && page.continuation) {
      nextContinuation = { layer: "read-category-files", value: JSON.stringify({ category, cursor: page.continuation }) };
    }
    for (const file of page.files) evidenceInputs.push({ ...file, kind: "exact-category", category });
  }

  const text = await perform(planCommonsPrecisionRequest({ layer: "search-adopted-text", query: input.query }));
  if (text.stopped) return text.stopped;
  metadataPayloads.push(text.payload);
  for (const file of parseCommonsFileMetadataResponse(text.payload).files) evidenceInputs.push({ pageId: file.pageId, fileTitle: file.fileTitle, kind: "adopted-text" });
  if (!nextContinuation && isRecord(text.payload) && isRecord(text.payload.continue) &&
    (typeof text.payload.continue.gsroffset === "string" || typeof text.payload.continue.gsroffset === "number")) {
    const offset = Number(text.payload.continue.gsroffset);
    if (Number.isSafeInteger(offset) && offset >= 0) nextContinuation = { layer: "search-adopted-text", value: String(offset) };
  }

  const seeds = mergeCommonsFileEvidence(evidenceInputs).slice(0, COMMONS_PRECISION_MAX_INSPECTED);
  inspectedCount = seeds.length;
  const missingMetadataTitles = seeds
    .filter((seed) => !metadataPayloads.some((payload) => parseCommonsFileMetadataResponse(payload).files.some((file) => file.pageId === seed.pageId)))
    .map((seed) => seed.fileTitle);
  if (missingMetadataTitles.length > 0) {
    const plan: CommonsPrecisionPlannedRequest = {
      layer: "read-p18-files",
      url: `${COMMONS_API_URL}?${buildCommonsFileMetadataParams(missingMetadataTitles).toString()}`,
      timeoutMs: 3_000,
    };
    const metadata = await perform(plan);
    if (metadata.stopped) return metadata.stopped;
    metadataPayloads.push(metadata.payload);
  }
  let depictsByPageId = new Map<number, string[]>();
  if (seeds.length > 0) {
    const depicts = await perform(planCommonsPrecisionRequest({ layer: "read-structured-data", pageIds: seeds.map((seed) => seed.pageId) }));
    if (depicts.stopped) return depicts.stopped;
    depictsByPageId = parseCommonsDepictsResponse(depicts.payload, seeds.map((seed) => seed.pageId));
  }
  const composed = composeCommonsPrecisionCandidates({
    metadataPayload: combineMetadataPayloads(metadataPayloads),
    seeds,
    depictsByPageId,
    entityEvidence,
  });
  rejectedByReason = countRejectedReasons(composed.rejected);
  const candidates = composed.candidates.slice(0, 6);
  return finish(candidates.length > 0 ? "results" : "no-suitable-image", candidates, entityEvidence.qid);
};

export const runCommonsPrecisionContinuationEngine = async (
  input: {
    query: string;
    entityEvidence: WikidataEntityEvidence;
    layer: "read-category-files" | "search-adopted-text";
    continuation: string;
    seenPageIds: readonly number[];
  },
  dependencies: CommonsPrecisionEngineDependencies,
): Promise<CommonsPrecisionEngineResult> => {
  const now = dependencies.now ?? Date.now;
  const startedAtMs = now();
  let requestCount = 0;
  let upstreamStatus: 429 | 503 | undefined;
  let nextContinuation: CommonsPrecisionEngineResult["continuation"];
  let rejectedByReason: Record<string, number> = {};
  const request = async (plan: CommonsPrecisionPlannedRequest): Promise<{ payload?: unknown; stopped?: CommonsPrecisionState }> => {
    if (requestCount >= COMMONS_PRECISION_MAX_REQUESTS || now() - startedAtMs >= COMMONS_PRECISION_MAX_DURATION_MS) return { stopped: "inspection-limit-reached" };
    requestCount += 1;
    const result = await dependencies.request(plan);
    if (result.status === 429 || result.status === 503) upstreamStatus = result.status;
    return result.state === "ok" ? { payload: result.payload } : { stopped: mapTransportState(result.state) };
  };
  const finish = (state: CommonsPrecisionState, candidates: CommonsPrecisionResponse["candidates"] = [], inspectedCount = 0): CommonsPrecisionEngineResult => ({
    response: { contractVersion: COMMONS_PRECISION_CONTRACT_VERSION, state, candidates },
    qid: input.entityEvidence.qid,
    requestCount,
    inspectedCount,
    durationMs: Math.min(COMMONS_PRECISION_MAX_DURATION_MS, Math.max(0, now() - startedAtMs)),
    upstreamStatus,
    allCandidatesRejected: state === "no-suitable-image" && inspectedCount > 0,
    entityEvidence: input.entityEvidence,
    continuation: nextContinuation,
    seenPageIds: [...new Set(input.seenPageIds)].slice(0, COMMONS_PRECISION_MAX_INSPECTED),
    rejectedByReason,
  });
  const inputs: CommonsFileEvidenceInput[] = [];
  let metadataPayload: unknown;
  if (input.layer === "read-category-files") {
    let context: { category?: unknown; cursor?: unknown };
    try { context = JSON.parse(input.continuation); } catch { return finish("session-expired"); }
    if (typeof context.category !== "string" || typeof context.cursor !== "string") return finish("session-expired");
    const pageResult = await request(planCommonsPrecisionRequest({ layer: "read-category-files", category: context.category, continuation: context.cursor }));
    if (pageResult.stopped) return finish(pageResult.stopped);
    const page = parseCommonsCategoryMembersResponse(pageResult.payload);
    for (const file of page.files) inputs.push({ ...file, kind: "exact-category", category: context.category });
    if (page.continuation) nextContinuation = { layer: "read-category-files", value: JSON.stringify({ category: context.category, cursor: page.continuation }) };
    if (inputs.length > 0) {
      const metadata = await request(planCommonsPrecisionRequest({ layer: "read-p18-files", fileTitles: inputs.map((item) => item.fileTitle) }));
      if (metadata.stopped) return finish(metadata.stopped);
      metadataPayload = metadata.payload;
    }
  } else {
    const offset = Number(input.continuation);
    if (!Number.isSafeInteger(offset) || offset < 0) return finish("session-expired");
    const text = await request(planCommonsPrecisionRequest({ layer: "search-adopted-text", query: input.query, offset }));
    if (text.stopped) return finish(text.stopped);
    metadataPayload = text.payload;
    for (const file of parseCommonsFileMetadataResponse(text.payload).files) inputs.push({ pageId: file.pageId, fileTitle: file.fileTitle, kind: "adopted-text" });
    if (isRecord(text.payload) && isRecord(text.payload.continue)) {
      const nextOffset = Number(text.payload.continue.gsroffset);
      if (Number.isSafeInteger(nextOffset) && nextOffset >= 0) nextContinuation = { layer: "search-adopted-text", value: String(nextOffset) };
    }
  }
  const seen = new Set(input.seenPageIds);
  const seeds = mergeCommonsFileEvidence(inputs).filter((seed) => !seen.has(seed.pageId)).slice(0, COMMONS_PRECISION_MAX_INSPECTED - seen.size);
  if (seeds.length === 0 || !metadataPayload) return finish(nextContinuation ? "inspection-limit-reached" : "no-suitable-image");
  const depicts = await request(planCommonsPrecisionRequest({ layer: "read-structured-data", pageIds: seeds.map((seed) => seed.pageId) }));
  if (depicts.stopped) return finish(depicts.stopped, [], seeds.length);
  const composed = composeCommonsPrecisionCandidates({
    metadataPayload,
    seeds,
    depictsByPageId: parseCommonsDepictsResponse(depicts.payload, seeds.map((seed) => seed.pageId)),
    entityEvidence: input.entityEvidence,
  });
  rejectedByReason = countRejectedReasons(composed.rejected);
  const candidates = composed.candidates.slice(0, 6);
  const allSeen = [...new Set([...input.seenPageIds, ...seeds.map((seed) => seed.pageId)])].slice(0, COMMONS_PRECISION_MAX_INSPECTED);
  const result = finish(candidates.length > 0 ? "results" : nextContinuation ? "inspection-limit-reached" : "no-suitable-image", candidates, seeds.length);
  return { ...result, seenPageIds: allSeen };
};
