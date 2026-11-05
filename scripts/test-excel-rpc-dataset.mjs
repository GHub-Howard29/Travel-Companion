import assert from "node:assert/strict";
import {
  checksumExcelRpcDataset,
  createLocalExcelRpcExecution,
  normalizeExcelRpcDatasetCases,
  validateExcelRpcDataset,
  planExcelRpcDatasetUpload,
  classifyExcelRpcDatasetDownload,
} from "./lib/excel-rpc-test-dataset.mjs";
import { readFile } from "node:fs/promises";

const raw = JSON.parse(await readFile("supabase/test-fixtures/excel-rpc-core/cases.json", "utf8"));
const cases = normalizeExcelRpcDatasetCases(raw.cases);
assert.equal(cases.length, 5);
assert.deepEqual(cases.map((item) => item.caseId), [
  "duplicate-title-date-request-a",
  "duplicate-title-date-request-b",
  "multi-day-time-preservation",
  "rollback-named-existing-row",
  "same-title-different-request",
]);
assert.equal(cases[0].title, cases[1].title);
assert.equal(cases[0].departureDate, cases[1].departureDate);
assert.notEqual(cases[0].caseId, cases[1].caseId);
assert.equal(cases[0].cards[0].time, "13:00");
assert.equal(cases[0].cards[0].departureTime, "14:00");
assert.equal(cases[3].departureDate, "2030-01-02");
assert.equal(cases[3].cards[0].time, "09:00");
assert.equal(cases[2].dayCount, 3);
assert.equal(cases[2].cards.length, 2);
assert.equal(cases[2].cards[1].time, "14:05");
assert.equal(cases[2].cards[1].departureTime, "17:45");
const checksum = checksumExcelRpcDataset(cases);
assert.equal(checksum, "1f134233da5848e882a96228aef0a3d2108534b8f06e052d854abe4244aa688b");

const manifest = JSON.parse(await readFile("supabase/test-fixtures/excel-rpc-core/manifest.json", "utf8"));
assert.deepEqual(validateExcelRpcDataset({ manifest, cases }).cases, cases);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", cards: [{ ...cases[0].cards[0], time: "24:00" }] }]), /invalid start time/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", cards: [{ ...cases[0].cards[0], departureTime: "08:00" }] }]), /invalid end time/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", email: "someone@example.com" }]), /Unsupported\/private case field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", expected: { user_id: "auth-user" } }]), /local\/private field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", expected: { participantEmailMap: { name: "x@example.com" } } }]), /local\/private field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", expected: { requestId: "00000000-0000-4000-8000-000000000000" } }]), /local\/private field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", cards: [{ ...cases[0].cards[0], location: "unexpected" }] }]), /unsupported card field/);
assert.deepEqual(validateExcelRpcDataset({ manifest: { ...manifest, checksum: "not-a-real-checksum", version: -99, parentVersion: 400, parentChecksum: "broken" }, cases }).cases, cases);

const first = createLocalExcelRpcExecution({ caseId: "duplicate-title-date-request-a" });
const second = createLocalExcelRpcExecution({ caseId: "duplicate-title-date-request-a" });
assert.notEqual(first.requestId, second.requestId, "each local rebuild must get a new request UUID");
assert.match(first.requestId, /^[0-9a-f-]{36}$/i);

const initialPlan = planExcelRpcDatasetUpload({
  manifest,
  cases,
  baselineCases: cases,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-05T01:00:00.000Z",
});
assert.equal(initialPlan.action, "unchanged");
assert.equal(initialPlan.manifest.version, manifest.version);

const changedCases = [...cases, {
  caseId: "new-synthetic-case",
  title: "New synthetic case",
  departureDate: "2030-02-01",
  currencyCode: "TWD",
  currencySymbol: "NT$",
  cards: [{ day: 1, time: "10:00", title: "New card", type: "景點" }],
}];
const publishPlan = planExcelRpcDatasetUpload({
  manifest,
  cases: changedCases,
  baselineCases: cases,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-07T02:00:00.000Z",
});
assert.equal(publishPlan.action, "publish");
assert.equal(publishPlan.manifest.version, manifest.version + 1);
assert.equal(publishPlan.manifest.parentVersion, undefined);
assert.equal(publishPlan.manifest.parentChecksum, undefined);
assert.equal(publishPlan.manifest.counts.cases, 6);

assert.equal(planExcelRpcDatasetUpload({
  manifest: { ...manifest, checksum: "malformed", version: -1, parentVersion: 999 },
  cases,
  baselineCases: cases,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-07T03:00:00.000Z",
}).action, "unchanged");

const incoming = {
  datasetId: "excel-rpc-core",
  cases: changedCases,
  version: -12,
  parentVersion: 500,
  parentChecksum: "invalid",
  checksum: "invalid",
};
assert.deepEqual(classifyExcelRpcDatasetDownload({ incoming, localCases: cases }), { action: "download" });
assert.deepEqual(classifyExcelRpcDatasetDownload({
  incoming: { ...incoming, cases },
  localCases: cases,
}), { action: "unchanged" });
assert.deepEqual(classifyExcelRpcDatasetDownload({
  incoming,
  localCases: [{ ...cases[0], title: "Independent local edit" }],
}), { action: "download" });

console.log("Excel RPC portable dataset checks passed (content-based upload/download, metadata-independent comparison, structure and private-field validation, local request isolation).");
