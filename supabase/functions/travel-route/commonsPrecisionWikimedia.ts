import { isRecord } from "./validation.ts";
import {
  COMMONS_PRECISION_MAX_DURATION_MS,
  COMMONS_PRECISION_MAX_INSPECTED,
  COMMONS_PRECISION_MAX_REQUESTS,
  type CommonsPrecisionName,
  type CommonsPrecisionState,
} from "./commonsPrecision.ts";

export const COMMONS_PRECISION_REQUEST_TIMEOUT_MS = 3_000;

const QID = /^Q[1-9][0-9]*$/;
const FILE_TITLE = /^File:.+/;
const WIKIDATA_SEARCH_DESCRIPTION_MAX_LENGTH = 240;

export interface WikidataSearchEntity {
  qid: string;
  label: string;
  description?: string;
  aliases: string[];
  matchedText?: string;
}

export interface WikidataEntityEvidence {
  qid: string;
  instanceOfQids: string[];
  p18FileTitles: string[];
  p373Categories: string[];
  names: CommonsPrecisionName[];
}

export type WikidataEntityResolution =
  | { state: "resolved"; entity: WikidataSearchEntity }
  | { state: "entity-not-found" | "entity-ambiguous" };

export interface CommonsFileSeed {
  pageId: number;
  fileTitle: string;
}

export interface CommonsCategoryPage {
  files: CommonsFileSeed[];
  continuation?: string;
}

export interface CommonsFileEvidenceSeed extends CommonsFileSeed {
  directP18: boolean;
  exactCategories: string[];
  fromAdoptedTextSearch: boolean;
}

export interface CommonsFileEvidenceInput extends CommonsFileSeed {
  kind: "p18" | "exact-category" | "adopted-text";
  category?: string;
}

const normalizeText = (value: string): string => value
  .normalize("NFKC")
  .toLocaleLowerCase("en")
  .replace(/\s+/g, " ")
  .trim();

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const getStringClaimValues = (entity: Record<string, unknown>, property: string): string[] => {
  const claims = isRecord(entity.claims) ? entity.claims[property] : undefined;
  if (!Array.isArray(claims)) return [];
  return claims.flatMap((claim) => {
    if (!isRecord(claim) || claim.rank === "deprecated" || !isRecord(claim.mainsnak) || !isRecord(claim.mainsnak.datavalue)) return [];
    const value = claim.mainsnak.datavalue.value;
    return typeof value === "string" ? [value.trim()] : [];
  }).filter(Boolean).slice(0, 50);
};

const getEntityIdClaimValues = (entity: Record<string, unknown>, property: string): string[] => {
  const claims = isRecord(entity.claims) ? entity.claims[property] : undefined;
  if (!Array.isArray(claims)) return [];
  return claims.flatMap((claim) => {
    if (!isRecord(claim) || claim.rank === "deprecated" || !isRecord(claim.mainsnak) || !isRecord(claim.mainsnak.datavalue) ||
      !isRecord(claim.mainsnak.datavalue.value)) return [];
    const id = claim.mainsnak.datavalue.value.id;
    return typeof id === "string" && QID.test(id) ? [id] : [];
  }).slice(0, 50);
};

const getLocalizedValues = (
  entity: Record<string, unknown>,
  field: "labels" | "aliases",
  language: string,
): string[] => {
  const collection = isRecord(entity[field]) ? entity[field] : {};
  const entry = Object.entries(collection).find(([key]) => key.toLowerCase() === language.toLowerCase())?.[1];
  const entries = field === "labels" ? [entry] : Array.isArray(entry) ? entry : [];
  return entries.flatMap((value) => {
    if (!isRecord(value) || typeof value.value !== "string") return [];
    const text = value.value.normalize("NFKC").replace(/\s+/g, " ").trim();
    return text ? [text] : [];
  });
};

export const parseWikidataSearchResponse = (payload: unknown): WikidataSearchEntity[] => {
  if (!isRecord(payload) || !Array.isArray(payload.search)) return [];
  const entities = payload.search.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !QID.test(entry.id) || typeof entry.label !== "string") return [];
    const label = entry.label.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!label) return [];
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((value): value is string => typeof value === "string")
        .map((value) => value.normalize("NFKC").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 24)
      : [];
    const description = typeof entry.description === "string"
      ? entry.description.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, WIKIDATA_SEARCH_DESCRIPTION_MAX_LENGTH)
      : undefined;
    const matchedText = isRecord(entry.match) && typeof entry.match.text === "string"
      ? entry.match.text.normalize("NFKC").replace(/\s+/g, " ").trim()
      : undefined;
    return [{
      qid: entry.id,
      label,
      ...(description ? { description } : {}),
      aliases: unique(aliases),
      matchedText: matchedText || undefined,
    }];
  });
  const uniqueEntities = new Map<string, WikidataSearchEntity>();
  for (const entity of entities) {
    if (!uniqueEntities.has(entity.qid)) uniqueEntities.set(entity.qid, entity);
  }
  return [...uniqueEntities.values()].slice(0, 10);
};

export const resolveUniqueWikidataEntity = (
  query: string,
  entities: WikidataSearchEntity[],
  instanceOfByQid: ReadonlyMap<string, readonly string[]>,
  excludedInstanceOfQids: ReadonlySet<string>,
): WikidataEntityResolution => {
  const normalizedQuery = normalizeText(query);
  const eligible = entities.filter((entity) => {
    const names = [entity.label, ...entity.aliases, entity.matchedText ?? ""].map(normalizeText).filter(Boolean);
    const instanceOf = instanceOfByQid.get(entity.qid) ?? [];
    return names.includes(normalizedQuery) && !instanceOf.some((qid) => excludedInstanceOfQids.has(qid));
  });
  if (eligible.length === 0) return { state: "entity-not-found" };
  if (eligible.length > 1) return { state: "entity-ambiguous" };
  return { state: "resolved", entity: eligible[0] };
};

export const parseWikidataEntityEvidenceResponse = (
  payload: unknown,
  qid: string,
  targetLanguage: string,
): WikidataEntityEvidence | null => {
  if (!QID.test(qid) || !isRecord(payload) || !isRecord(payload.entities) || !isRecord(payload.entities[qid])) return null;
  const entity = payload.entities[qid];
  const languages = unique([
    targetLanguage.toLowerCase(),
    "zh-hant",
    "en",
    ...(targetLanguage.toLowerCase() === "ja" ? ["ja"] : []),
  ]);
  const names: CommonsPrecisionName[] = [];
  const seenNames = new Set<string>();
  for (const language of languages) {
    const values = [
      ...getLocalizedValues(entity, "labels", language).slice(0, 1),
      ...getLocalizedValues(entity, "aliases", language).slice(0, 7),
    ];
    for (const value of values) {
      const key = normalizeText(value);
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      names.push({ value, languageTag: language });
      if (names.length === 24) break;
    }
    if (names.length === 24) break;
  }
  return {
    qid,
    instanceOfQids: unique(getEntityIdClaimValues(entity, "P31")),
    p18FileTitles: unique(getStringClaimValues(entity, "P18").map((title) =>
      FILE_TITLE.test(title) ? title : `File:${title}`).filter((title) => FILE_TITLE.test(title))),
    p373Categories: unique(getStringClaimValues(entity, "P373").map((category) =>
      category.replace(/^Category:/i, "").trim()).filter(Boolean)),
    names,
  };
};

export const parseCommonsCategoryMembersResponse = (payload: unknown): CommonsCategoryPage => {
  const members = isRecord(payload) && isRecord(payload.query) && Array.isArray(payload.query.categorymembers)
    ? payload.query.categorymembers
    : [];
  const files = members.flatMap((member) => {
    if (!isRecord(member) || member.ns !== 6 || !Number.isSafeInteger(member.pageid) || Number(member.pageid) <= 0 ||
      typeof member.title !== "string" || !FILE_TITLE.test(member.title)) return [];
    return [{ pageId: Number(member.pageid), fileTitle: member.title }];
  });
  const continuation = isRecord(payload) && isRecord(payload.continue) && typeof payload.continue.cmcontinue === "string" &&
      payload.continue.cmcontinue.length > 0 && payload.continue.cmcontinue.length <= 1_000
    ? payload.continue.cmcontinue
    : undefined;
  const uniqueFiles = new Map<number, CommonsFileSeed>();
  for (const file of files) {
    if (!uniqueFiles.has(file.pageId)) uniqueFiles.set(file.pageId, file);
  }
  return {
    files: [...uniqueFiles.values()],
    continuation,
  };
};

export const parseCommonsDepictsResponse = (
  payload: unknown,
  pageIds: readonly number[],
): Map<number, string[]> => {
  const result = new Map<number, string[]>();
  if (!isRecord(payload) || !isRecord(payload.entities)) return result;
  for (const pageId of unique(pageIds.filter((value) => Number.isSafeInteger(value) && value > 0))) {
    const entity = payload.entities[`M${pageId}`];
    if (!isRecord(entity)) continue;
    result.set(pageId, unique(getEntityIdClaimValues(entity, "P180")));
  }
  return result;
};

export const mergeCommonsFileEvidence = (
  inputs: readonly CommonsFileEvidenceInput[],
): CommonsFileEvidenceSeed[] => {
  const merged = new Map<string, CommonsFileEvidenceSeed>();
  for (const input of inputs) {
    if (!Number.isSafeInteger(input.pageId) || input.pageId <= 0 || !FILE_TITLE.test(input.fileTitle)) continue;
    const key = `page:${input.pageId}`;
    const current = merged.get(key) ?? {
      pageId: input.pageId,
      fileTitle: input.fileTitle,
      directP18: false,
      exactCategories: [],
      fromAdoptedTextSearch: false,
    };
    if (input.kind === "p18") current.directP18 = true;
    if (input.kind === "exact-category" && input.category?.trim()) {
      current.exactCategories = unique([...current.exactCategories, input.category.trim()]);
    }
    if (input.kind === "adopted-text") current.fromAdoptedTextSearch = true;
    merged.set(key, current);
  }
  return [...merged.values()];
};

export type CommonsPrecisionRequestLayer =
  | "resolve-entity"
  | "read-entity-evidence"
  | "read-p18-files"
  | "read-category-files"
  | "read-structured-data"
  | "search-adopted-text";

const REQUEST_LAYERS: readonly CommonsPrecisionRequestLayer[] = [
  "resolve-entity",
  "read-entity-evidence",
  "read-p18-files",
  "read-category-files",
  "read-structured-data",
  "search-adopted-text",
];
const CONTINUABLE_LAYERS = new Set<CommonsPrecisionRequestLayer>([
  "read-category-files",
  "search-adopted-text",
]);
const SKIPPABLE_LAYERS = new Set<CommonsPrecisionRequestLayer>([
  "read-p18-files",
  "read-category-files",
  "read-structured-data",
  "search-adopted-text",
]);

export interface CommonsPrecisionOperation {
  startedAtMs: number;
  requestCount: number;
  inspectedCount: number;
  layerIndex: number;
  continuation?: string;
  activeRequest?: { layer: CommonsPrecisionRequestLayer; startedAtMs: number };
  terminalState?: Extract<CommonsPrecisionState, "inspection-limit-reached" | "rate-limited" | "timeout" | "upstream-error" | "offline">;
}

export const createCommonsPrecisionOperation = (startedAtMs: number): CommonsPrecisionOperation => ({
  startedAtMs,
  requestCount: 0,
  inspectedCount: 0,
  layerIndex: 0,
});

export type BeginCommonsPrecisionRequestResult =
  | { status: "started"; state: CommonsPrecisionOperation; layer: CommonsPrecisionRequestLayer; continuation?: string }
  | { status: "in-progress" | "complete" | "stopped"; state: CommonsPrecisionOperation };

export const beginNextCommonsPrecisionRequest = (
  operation: CommonsPrecisionOperation,
  nowMs: number,
): BeginCommonsPrecisionRequestResult => {
  if (operation.terminalState) return { status: "stopped", state: operation };
  if (operation.activeRequest) return { status: "in-progress", state: operation };
  if (operation.layerIndex >= REQUEST_LAYERS.length) return { status: "complete", state: operation };
  if (operation.requestCount >= COMMONS_PRECISION_MAX_REQUESTS ||
    nowMs - operation.startedAtMs >= COMMONS_PRECISION_MAX_DURATION_MS ||
    operation.inspectedCount >= COMMONS_PRECISION_MAX_INSPECTED) {
    return { status: "stopped", state: { ...operation, terminalState: "inspection-limit-reached", continuation: undefined } };
  }
  const layer = REQUEST_LAYERS[operation.layerIndex];
  return {
    status: "started",
    layer,
    continuation: operation.continuation,
    state: {
      ...operation,
      requestCount: operation.requestCount + 1,
      activeRequest: { layer, startedAtMs: nowMs },
    },
  };
};

export const completeCommonsPrecisionRequest = (
  operation: CommonsPrecisionOperation,
  nowMs: number,
  result: { inspectedCount?: number; continuation?: string },
): CommonsPrecisionOperation => {
  if (!operation.activeRequest) return operation;
  if (nowMs - operation.activeRequest.startedAtMs >= COMMONS_PRECISION_REQUEST_TIMEOUT_MS) {
    return { ...operation, activeRequest: undefined, continuation: undefined, terminalState: "timeout" };
  }
  const rawInspectedCount = result.inspectedCount ?? 0;
  const inspectedDelta = Number.isFinite(rawInspectedCount) && rawInspectedCount > 0
    ? Math.trunc(rawInspectedCount)
    : 0;
  const inspectedCount = operation.inspectedCount + inspectedDelta;
  if (nowMs - operation.startedAtMs >= COMMONS_PRECISION_MAX_DURATION_MS || inspectedCount >= COMMONS_PRECISION_MAX_INSPECTED) {
    return { ...operation, inspectedCount, activeRequest: undefined, continuation: undefined, terminalState: "inspection-limit-reached" };
  }
  const continuation = CONTINUABLE_LAYERS.has(operation.activeRequest.layer) && result.continuation &&
      result.continuation.length <= 1_000
    ? result.continuation
    : undefined;
  return {
    ...operation,
    inspectedCount,
    activeRequest: undefined,
    continuation,
    layerIndex: continuation ? operation.layerIndex : operation.layerIndex + 1,
  };
};

export const skipCommonsPrecisionLayer = (operation: CommonsPrecisionOperation): CommonsPrecisionOperation =>
  operation.activeRequest || operation.terminalState || operation.layerIndex >= REQUEST_LAYERS.length ||
    !SKIPPABLE_LAYERS.has(REQUEST_LAYERS[operation.layerIndex])
    ? operation
    : { ...operation, layerIndex: operation.layerIndex + 1, continuation: undefined };

export const failCommonsPrecisionRequest = (
  operation: CommonsPrecisionOperation,
  state: Extract<CommonsPrecisionState, "rate-limited" | "timeout" | "upstream-error" | "offline">,
): CommonsPrecisionOperation => operation.activeRequest
  ? { ...operation, activeRequest: undefined, continuation: undefined, terminalState: state }
  : operation;
