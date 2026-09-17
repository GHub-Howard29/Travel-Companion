import type { CommonsPrecisionPublicResponse } from "./commonsPrecision.ts";

export const COMMONS_PRECISION_REGRESSION_FIXTURE_HEADER = "x-travel-companion-regression-fixture";
export const COMMONS_PRECISION_AMBIGUOUS_FIXTURE = "commons-entity-ambiguous";

const ENTITY_CHOICES = [
  { qid: "Q90000001", label: "中山站", description: "本機回歸資料：都會捷運車站" },
  { qid: "Q90000002", label: "中山站", description: "本機回歸資料：鐵路車站，描述用於驗證同名地點的多行排版" },
  { qid: "Q90000003", label: "中山站" },
] as const;

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
  selectedEntityQid?: string,
): CommonsPrecisionPublicResponse | null => {
  if (fixtureName !== COMMONS_PRECISION_AMBIGUOUS_FIXTURE) return null;
  if (!selectedEntityQid) {
    return {
      contractVersion: "commons-precision-v1",
      state: "entity-ambiguous",
      candidates: [],
      entityChoices: ENTITY_CHOICES.map((entity) => ({ ...entity })),
    };
  }
  const selected = ENTITY_CHOICES.find((entity) => entity.qid === selectedEntityQid);
  if (!selected) return null;
  return {
    contractVersion: "commons-precision-v1",
    state: "no-suitable-image",
    candidates: [],
    resolvedEntity: { ...selected },
  };
};
