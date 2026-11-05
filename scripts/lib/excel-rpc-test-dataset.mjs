import { createHash, randomUUID } from "node:crypto";

export const EXCEL_RPC_DATASET_SCHEMA_VERSION = 1;
export const EXCEL_RPC_DATASET_ID = "excel-rpc-core";
export const EXCEL_RPC_CASE_STATUSES = ["active", "regression_pending", "released", "archived", "deleted"];

const forbiddenKeys = /email|phone|password|token|secret|api.?key|user.?id|created.?by|owner.?user.?id|request.?id|response.?payload|trip.?id|auth.?id/i;
const forbiddenText = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function scanSafe(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSafe(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.test(key) && item !== null && item !== "" && item !== false) {
        throw new Error(`Excel RPC dataset contains a local/private field at ${location}.${key}`);
      }
      scanSafe(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && forbiddenText.test(value)) {
    throw new Error(`Excel RPC dataset contains an email or credential at ${location}.`);
  }
}

export function normalizeExcelRpcDatasetCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("Excel RPC dataset must contain at least one case.");
  const seen = new Set();
  const result = cases.map((testCase, index) => {
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) throw new Error("Each Excel RPC case must be an object.");
    const allowedCaseKeys = new Set(["caseId", "title", "departureDate", "currencyCode", "currencySymbol", "dayCount", "cards", "expected"]);
    const unsupportedCaseKey = Object.keys(testCase).find((key) => !allowedCaseKeys.has(key));
    if (unsupportedCaseKey) throw new Error(`Unsupported/private case field: ${unsupportedCaseKey}`);
    scanSafe(testCase, `$.cases[${index}]`);
    if (typeof testCase.caseId !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(testCase.caseId)) throw new Error("Invalid stable caseId.");
    if (seen.has(testCase.caseId)) throw new Error(`Duplicate Excel RPC caseId: ${testCase.caseId}`);
    seen.add(testCase.caseId);
    if (typeof testCase.title !== "string" || !testCase.title.trim()) throw new Error(`Case ${testCase.caseId} needs a title.`);
    if (typeof testCase.departureDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(testCase.departureDate)) throw new Error(`Case ${testCase.caseId} needs YYYY-MM-DD departureDate.`);
    if (typeof testCase.currencyCode !== "string" || !/^[A-Z]{3}$/.test(testCase.currencyCode)) throw new Error(`Case ${testCase.caseId} needs an ISO currency code.`);
    if (typeof testCase.currencySymbol !== "string" || !testCase.currencySymbol.trim()) throw new Error(`Case ${testCase.caseId} needs a currency symbol.`);
    if (!Array.isArray(testCase.cards) || testCase.cards.length < 1 || testCase.cards.length > 1000) throw new Error(`Case ${testCase.caseId} needs 1..1000 cards.`);
    let maxDay = 0;
    for (const card of testCase.cards) {
      if (!card || typeof card !== "object" || Array.isArray(card)) throw new Error(`Case ${testCase.caseId} contains a malformed card.`);
      const allowedCardKeys = new Set(["day", "time", "departureTime", "title", "type", "desc"]);
      const unsupportedCardKey = Object.keys(card).find((key) => !allowedCardKeys.has(key));
      if (unsupportedCardKey) throw new Error(`Case ${testCase.caseId} contains an unsupported card field: ${unsupportedCardKey}`);
      if (!Number.isInteger(card.day) || card.day < 1 || card.day > 30) throw new Error(`Case ${testCase.caseId} contains an invalid day.`);
      if (typeof card.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(card.time)) throw new Error(`Case ${testCase.caseId} contains an invalid start time.`);
      if (card.departureTime !== undefined && card.departureTime !== null &&
          (typeof card.departureTime !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(card.departureTime) || card.departureTime < card.time)) {
        throw new Error(`Case ${testCase.caseId} contains an invalid end time.`);
      }
      if (typeof card.title !== "string" || !card.title.trim()) throw new Error(`Case ${testCase.caseId} contains an empty card title.`);
      if (!["交通", "住宿", "景點", "餐飲", "自駕", "其他"].includes(card.type)) throw new Error(`Case ${testCase.caseId} contains an invalid card type.`);
      if (card.desc !== undefined && card.desc !== null && typeof card.desc !== "string") throw new Error(`Case ${testCase.caseId} contains an invalid description.`);
      maxDay = Math.max(maxDay, card.day);
    }
    if (testCase.dayCount !== undefined && testCase.dayCount !== maxDay) throw new Error(`Case ${testCase.caseId} dayCount does not match its cards.`);
    const normalized = {
      caseId: testCase.caseId,
      title: testCase.title.trim(),
      departureDate: testCase.departureDate,
      currencyCode: testCase.currencyCode,
      currencySymbol: testCase.currencySymbol,
      dayCount: maxDay,
      cards: testCase.cards.map((card) => ({
        day: card.day,
        time: card.time,
        ...(card.departureTime !== undefined ? { departureTime: card.departureTime } : {}),
        title: card.title.trim(),
        type: card.type,
        ...(card.desc !== undefined ? { desc: card.desc ?? "" } : {}),
      })),
      expected: testCase.expected && typeof testCase.expected === "object" ? canonical(testCase.expected) : {},
    };
    scanSafe(normalized, `$.cases.${testCase.caseId}`);
    return normalized;
  });
  return result.sort((a, b) => a.caseId.localeCompare(b.caseId));
}

export function checksumExcelRpcDataset(cases) {
  const normalized = normalizeExcelRpcDatasetCases(cases);
  return createHash("sha256").update(JSON.stringify(canonical(normalized))).digest("hex");
}

export function planExcelRpcDatasetUpload({ manifest, cases, baselineCases, sourceHost, baselineAt }) {
  const validated = validateExcelRpcDataset({
    manifest: { ...manifest, counts: undefined },
    cases,
    directoryName: EXCEL_RPC_DATASET_ID,
    verifyManifestDigest: false,
  });
  const baseline = validateExcelRpcDataset({
    manifest,
    cases: baselineCases,
    directoryName: EXCEL_RPC_DATASET_ID,
    verifyManifestDigest: false,
  });
  const currentCases = validated.cases;
  const sameContent = JSON.stringify(canonical(currentCases)) === JSON.stringify(canonical(baseline.cases));
  if (!sourceHost || typeof sourceHost !== "string" || !sourceHost.trim()) throw new Error("Excel RPC dataset needs sourceHost metadata.");
  if (sameContent) return { action: "unchanged", manifest: validated.manifest, cases: currentCases };
  const timestamp = new Date(baselineAt ?? new Date().toISOString());
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Excel RPC dataset baseline timestamp metadata is invalid.");
  const nextManifest = {
    ...validated.manifest,
    version: Number.isSafeInteger(validated.manifest.version) && validated.manifest.version > 0 ? validated.manifest.version + 1 : 1,
    sourceHost,
    baselineAt: timestamp.toISOString(),
    exportedAt: timestamp.toISOString(),
    counts: { cases: currentCases.length },
  };
  delete nextManifest.parentVersion;
  delete nextManifest.parentChecksum;
  delete nextManifest.checksum;
  return { action: "publish", manifest: nextManifest, cases: currentCases };
}

export function classifyExcelRpcDatasetDownload({ incoming, localCases, currentCases }) {
  if (!incoming || incoming.datasetId !== EXCEL_RPC_DATASET_ID) throw new Error("Incoming Excel RPC dataset structure is invalid.");
  const remote = normalizeExcelRpcDatasetCases(incoming.cases ?? currentCases ?? []);
  const local = localCases === undefined ? null : normalizeExcelRpcDatasetCases(localCases);
  return { action: local && JSON.stringify(canonical(local)) === JSON.stringify(canonical(remote)) ? "unchanged" : "download" };
}

export function validateExcelRpcDataset({ manifest, cases, directoryName = manifest?.datasetId, verifyManifestDigest = true }) {
  if (!manifest || manifest.schemaVersion !== EXCEL_RPC_DATASET_SCHEMA_VERSION ||
      manifest.datasetId !== EXCEL_RPC_DATASET_ID || directoryName !== manifest.datasetId) {
    throw new Error("Unsupported or mismatched Excel RPC dataset manifest.");
  }
  if (manifest.status !== undefined && !EXCEL_RPC_CASE_STATUSES.includes(manifest.status)) throw new Error("Invalid Excel RPC dataset lifecycle status.");
  const normalized = normalizeExcelRpcDatasetCases(cases);
  if (manifest.counts?.cases !== undefined && manifest.counts.cases !== normalized.length) {
    throw new Error("Excel RPC dataset case count does not match its file.");
  }
  return { manifest, cases: normalized };
}

export function createLocalExcelRpcExecution({ caseId, requestId = randomUUID() }) {
  if (typeof caseId !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(caseId)) throw new Error("Invalid Excel RPC caseId.");
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error("Invalid local RPC request UUID.");
  }
  return { caseId, requestId };
}
