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
assert.equal(validateExcelRpcDataset({ manifest, cases }).manifest.checksum, checksum);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", cards: [{ ...cases[0].cards[0], time: "24:00" }] }]), /invalid start time/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", cards: [{ ...cases[0].cards[0], departureTime: "08:00" }] }]), /invalid end time/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", email: "someone@example.com" }]), /Unsupported\/private case field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", expected: { user_id: "auth-user" } }]), /local\/private field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", expected: { participantEmailMap: { name: "x@example.com" } } }]), /local\/private field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", expected: { requestId: "00000000-0000-4000-8000-000000000000" } }]), /local\/private field/);
assert.throws(() => normalizeExcelRpcDatasetCases([{ ...cases[0], caseId: "bad-case", cards: [{ ...cases[0].cards[0], location: "unexpected" }] }]), /unsupported card field/);
assert.throws(() => validateExcelRpcDataset({ manifest: { ...manifest, checksum: "0".repeat(64) }, cases }), /count\/checksum mismatch/);

const first = createLocalExcelRpcExecution({ caseId: "duplicate-title-date-request-a" });
const second = createLocalExcelRpcExecution({ caseId: "duplicate-title-date-request-a" });
assert.notEqual(first.requestId, second.requestId, "each local rebuild must get a new request UUID");
assert.match(first.requestId, /^[0-9a-f-]{36}$/i);

const initialPlan = planExcelRpcDatasetUpload({
  manifest,
  cases,
  applied: null,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-05T01:00:00.000Z",
});
assert.equal(initialPlan.action, "adopt-current");
assert.equal(initialPlan.applied.version, manifest.version);
const changedCases = [...cases, {
  caseId: "new-synthetic-case",
  title: "New synthetic case",
  departureDate: "2030-02-01",
  currencyCode: "TWD",
  currencySymbol: "NT$",
  cards: [{ day: 1, time: "10:00", title: "New card", type: "景點" }],
}];
const applied = { version: manifest.version, checksum: manifest.checksum, baselineAt: manifest.baselineAt };
const publishPlan = planExcelRpcDatasetUpload({
  manifest,
  cases: changedCases,
  applied,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-07T02:00:00.000Z",
});
assert.equal(publishPlan.action, "publish");
assert.equal(publishPlan.manifest.version, manifest.version + 1);
assert.equal(publishPlan.manifest.parentVersion, manifest.version);
assert.equal(publishPlan.manifest.parentChecksum, manifest.checksum);
assert.equal(publishPlan.manifest.counts.cases, 6);
assert.equal(planExcelRpcDatasetUpload({
  manifest,
  cases,
  applied,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-07T03:00:00.000Z",
}).action, "unchanged");
assert.throws(() => planExcelRpcDatasetUpload({
  manifest,
  cases: changedCases,
  applied: { ...applied, checksum: "0".repeat(64) },
  sourceHost: "NODE-A",
  baselineAt: "2026-11-07T02:00:00.000Z",
}), /does not match Git current/);
assert.throws(() => planExcelRpcDatasetUpload({
  manifest,
  cases: changedCases,
  applied: null,
  sourceHost: "NODE-A",
  baselineAt: "2026-11-07T02:00:00.000Z",
}), /no applied baseline/);

const incoming = {
  version: 2,
  parentVersion: 1,
  parentChecksum: manifest.checksum,
  checksum: publishPlan.manifest.checksum,
  baselineAt: "2026-11-07T02:00:00.000Z",
};
assert.deepEqual(classifyExcelRpcDatasetDownload({ incoming, applied }), { action: "download" });
assert.deepEqual(classifyExcelRpcDatasetDownload({ incoming: manifest, applied }), { action: "unchanged" });
assert.deepEqual(classifyExcelRpcDatasetDownload({ incoming: manifest, applied: null }), { action: "adopt-current" });
assert.throws(() => classifyExcelRpcDatasetDownload({
  incoming: { ...incoming, parentChecksum: "0".repeat(64) },
  applied,
}), /parent mismatch/);
assert.throws(() => classifyExcelRpcDatasetDownload({
  incoming: { ...incoming, version: 3 },
  applied,
}), /revision gap/);
assert.throws(() => classifyExcelRpcDatasetDownload({
  incoming: manifest,
  applied: { ...applied, checksum: "0".repeat(64) },
}), /same-version checksum conflict/);
assert.throws(() => classifyExcelRpcDatasetDownload({
  incoming,
  applied,
  localCopyChecksum: "0".repeat(64),
}), /Local Excel RPC case edits are not uploaded/);

console.log("Excel RPC portable dataset checks passed (multi-trip inputs, date/time preservation, private-field rejection, checksum, upload/download revision and conflict policy, local request isolation).");



