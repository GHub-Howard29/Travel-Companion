import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { canonical, readRemoteBaseline, sameFixtureRows } from "./testdata-download.mjs";
import { buildFixtureImportSql, checksumFixture, normalizeFixtureRows } from "./lib/testdata-download-apply.mjs";
import { classifyThreeWaySync, createBaselineRecord } from "./lib/testdata-clock-sync.mjs";

const syncLocalSource = await readFile(new URL("./sync-local-database.mjs", import.meta.url), "utf8");
assert.match(syncLocalSource, /npm\", \[\"run\", \"testdata:download\"\]/,
  "db:sync:local must use content-based download");
assert.doesNotMatch(syncLocalSource, /testdata:handoff|testdata:import:all/,
  "db:sync:local must not call version-chain handoff/import commands");

const fixture = {
  trips: [{ id: "tc-test-download", title: "Synthetic", created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z", is_public: false, content: { testPurpose: "three-way-sync", nested: { b: 2, a: 1 } } }],
  checklists: [{ id: "c1", trip_id: "tc-test-download", scope: "shared", title: "List", created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z" }],
  checklist_items: [{ id: "i1", checklist_id: "c1", label: "Item", created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z" }],
  expenses: [],
  exchange_purchases: [],
  other_info_items: [],
};
const local = structuredClone(fixture);
local.trips[0].created_at = "2026-11-06T00:00:00Z";
local.trips[0].updated_at = "2026-11-06T00:00:00Z";
assert.equal(sameFixtureRows(local, fixture), true,
  "different database timestamps alone must not trigger download");
assert.equal(checksumFixture(local), checksumFixture(fixture),
  "timestamps are excluded from the sync content checksum");

const editedRemote = structuredClone(fixture);
editedRemote.trips[0].updated_at = "2026-11-07T00:00:00Z";
editedRemote.trips[0].title = "Edited on remote node";
const baseChecksum = checksumFixture(fixture);
const remoteChecksum = checksumFixture(editedRemote);
const localChecksum = checksumFixture(local);
assert.deepEqual(classifyThreeWaySync({ localChecksum, remoteChecksum, baseChecksum }),
  { action: "download", reason: "git-only-change"},
  "remote-only content changes must select download independent of timestamps");
assert.deepEqual(classifyThreeWaySync({ localChecksum: remoteChecksum, remoteChecksum: baseChecksum, baseChecksum }),
  { action: "upload", reason: "local-only-change" },
  "local-only content changes must select upload independent of timestamps");
const conflictingLocal = structuredClone(fixture);
conflictingLocal.trips[0].title = "Conflicting local edit";
assert.deepEqual(classifyThreeWaySync({
  localChecksum: checksumFixture(conflictingLocal), remoteChecksum, baseChecksum,
}), { action: "conflict", reason: "both-sides-changed" },
"independent local and remote edits must stop as conflict");
assert.deepEqual(classifyThreeWaySync({
  localChecksum: remoteChecksum, remoteChecksum, baseChecksum,
}), { action: "unchanged", reason: "same-content" },
"converged content must not generate a false conflict");
assert.equal(checksumFixture({ ...fixture, trips: [{ ...fixture.trips[0], content: { nested: { a: 1, b: 2 }, testPurpose: "three-way-sync" } }] }), checksumFixture(fixture),
  "nested JSON key order must not change content checksum");

const contentChanged = structuredClone(fixture);
contentChanged.checklist_items[0].label = "Edited locally";
assert.equal(sameFixtureRows(contentChanged, fixture), false,
  "different local content must trigger B-side overwrite");

const orderChanged = structuredClone(fixture);
orderChanged.checklists.reverse();
orderChanged.trips[0].content = { nested: { a: 1, b: 2 }, testPurpose: "three-way-sync" };
assert.equal(sameFixtureRows(orderChanged, fixture), true,
  "JSON object key order and row order must not trigger a download");

const missingRow = structuredClone(fixture);
missingRow.expenses.push({ trip_id: "tc-test-download", title: "Local extra" });
assert.equal(sameFixtureRows(missingRow, fixture), false,
  "extra local rows must be replaced by the B-side snapshot");

assert.equal(sameFixtureRows(fixture, fixture), true);

const legacyFixture = structuredClone(fixture);
legacyFixture.trips[0].content = {
  __testFixture: true,
  checklistData: [{ id: "legacy-checklist", label: "legacy" }],
  participantEmailMap: { local: "private@example.com" },
  nested: { b: 2, a: 1 },
};
legacyFixture.trips[0].participants = ["local-only participant"];
legacyFixture.trips[0].owner_user_id = "local-user-id";
legacyFixture.checklists[0].created_by = "local-user-id";
const normalizedLegacy = normalizeFixtureRows(legacyFixture);
assert.equal(normalizedLegacy.trips[0].content.testPurpose, "three-way-sync",
  "legacy synthetic marker must normalize to the current marker");
assert.equal(Object.hasOwn(normalizedLegacy.trips[0], "participants"), false,
  "participant column must never enter a fixture");
assert.equal(Object.hasOwn(normalizedLegacy.trips[0], "owner_user_id"), false);
assert.equal(Object.hasOwn(normalizedLegacy.checklists[0], "created_by"), false);
assert.equal(Object.hasOwn(normalizedLegacy.trips[0].content, "__testFixture"), false);
assert.equal(Object.hasOwn(normalizedLegacy.trips[0].content, "checklistData"), false);
assert.equal(Object.hasOwn(normalizedLegacy.trips[0].content, "participantEmailMap"), false);
assert.equal(sameFixtureRows(legacyFixture, fixture), true,
  "legacy marker and local-only account/participant data must not block download comparison");

const downloadedLocal = structuredClone(fixture);
downloadedLocal.trips[0].participants = ["this-device-only"];
downloadedLocal.trips[0].content.participantEmailMap = { local: "private@example.com" };
downloadedLocal.trips[0].content.checklistData = [{ id: "local-checklist" }];
assert.equal(sameFixtureRows(downloadedLocal, fixture), true,
  "downloaded local DB must compare equal after preserving local-only participant data");
assert.equal(sameFixtureRows(downloadedLocal, { ...fixture, trips: [{ ...fixture.trips[0], title: "Edited after download" }] }), false,
  "a real business-data edit after download must remain uploadable");

const checkedInLegacy = JSON.parse(await readFile(new URL("../supabase/test-fixtures/tc-test-sync-example/data.json", import.meta.url), "utf8"));
const checkedInLegacyManifest = JSON.parse(await readFile(new URL("../supabase/test-fixtures/tc-test-sync-example/manifest.json", import.meta.url), "utf8"));
const checkedInLegacyNormalized = normalizeFixtureRows(checkedInLegacy);
const acceptedLegacyBaseline = await readRemoteBaseline(fileURLToPath(new URL("../supabase/test-fixtures/tc-test-sync-example", import.meta.url)));
assert.equal(acceptedLegacyBaseline.manifest.fixtureId, checkedInLegacyManifest.fixtureId);
assert.equal(acceptedLegacyBaseline.data.trips[0].content.testPurpose, "three-way-sync");
const currentBaseline = await readRemoteBaseline(fileURLToPath(new URL("../supabase/test-fixtures/trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab", import.meta.url)));
assert.equal(currentBaseline.data.trips[0].content.testPurpose, "three-way-sync");
assert.doesNotThrow(() => buildFixtureImportSql([currentBaseline]),
  "current-format fixtures must pass the same import contract");
assert.equal(checkedInLegacyNormalized.trips[0].id, checkedInLegacyManifest.fixtureId);
assert.equal(checkedInLegacyNormalized.trips[0].content.testPurpose, "three-way-sync",
  "the previously blocked tc-test-sync-example fixture must normalize to the current contract");
assert.equal(Object.hasOwn(checkedInLegacyNormalized.trips[0], "participants"), false);
assert.doesNotThrow(() => buildFixtureImportSql([{
  manifest: checkedInLegacyManifest,
  data: checkedInLegacyNormalized,
}]), "the legacy fixture must pass the same SQL import contract after normalization");
for (const table of ["trips", "checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"]) {
  assert.equal(checkedInLegacy[table].length, checkedInLegacyManifest.counts[table],
    `legacy fixture manifest count must remain valid for ${table}`);
}

const downloadSource = await readFile(new URL("./testdata-download.mjs", import.meta.url), "utf8");
const uploadSource = await readFile(new URL("./testdata-upload.mjs", import.meta.url), "utf8");
const tripRepositorySource = await readFile(new URL("../src/services/tripRepository.ts", import.meta.url), "utf8");
const workspaceSource = await readFile(new URL("../src/hooks/useTripWorkspace.ts", import.meta.url), "utf8");
assert.match(tripRepositorySource, /content:\s*\{\s*\.\.\.currentRecord\.detail\.content,/,
  "editing Trip details must preserve testPurpose so the updated DB remains eligible for upload");
assert.match(workspaceSource, /content:\s*\{\s*\.\.\.storedRecord\.detail\.content,/,
  "editing itinerary cards must preserve testPurpose so the updated DB remains eligible for upload");
assert.match(downloadSource, /\[testdata-download\] 下載檢查完成/,
  "successful download must print a visible completion summary");
assert.match(downloadSource, /success: !excelFailed/,
  "overall result must report an Excel RPC dataset failure independently");
assert.match(downloadSource, /下載失敗：\$\{error\.message\}/,
  "failed download must print a clear error");
assert.match(downloadSource, /error\?\.stack/,
  "failed download must print stack details for diagnosis");
assert.match(downloadSource, /fileURLToPath\(import\.meta\.url\)/,
  "direct CLI detection must convert the module URL to a platform-native path");
assert.doesNotMatch(downloadSource, /new URL\(import\.meta\.url\)\.pathname/,
  "direct CLI detection must not compare against URL.pathname on Windows");
assert.equal(downloadSource.includes("tripPattern"), false,
  "fixture discovery must not depend on a fixed TRIP ID format");
assert.match(downloadSource, /try\s*\{\s*excelPlan = await prepareExcelRpcDatasetDownload\(\)/,
  "RPC dataset validation failure must be isolated from TRIP fixture discovery");
assert.match(downloadSource, /const fixturePlans = \[\]/,
  "TRIP fixtures must be planned independently of the RPC dataset");
assert.match(downloadSource, /normalizeFixtureRows\(rawData\)/,
  "download must normalize legacy marker and excluded local-only fields before validating");
assert.match(downloadSource, /currentTrip\.content\?\.__testFixture !== true/,
  "download may update only an explicitly marked legacy synthetic local target");
assert.match(uploadSource, /where is_public = false and coalesce\(content->>'testPurpose', ''\) = 'three-way-sync'/,
  "upload must select all private marked test trips");
assert.match(uploadSource, /rawData\[0\]|rawData\.trips\[0\]\.content\?\.__testFixture/,
  "upload baseline must recognize the explicitly marked legacy fixture format");
assert.match(downloadSource, /classifyThreeWaySync\(/,
  "download must use the shared three-way content comparison");
assert.match(uploadSource, /classifyThreeWaySync\(/,
  "upload must use the same three-way content comparison");
assert.match(uploadSource, /createSyncedManifest\([\s\S]*?localChecksum/,
  "published fixture manifest must carry the new common baseline checksum");
assert.match(downloadSource, /writeSyncState\(syncState, baselineUpdates, baselinePath\)/,
  "successful download must save the new common Base only to this machine's local state");
assert.doesNotMatch(downloadSource, /createSyncedManifest\(item\.manifest, item\.checksum\)/,
  "download must not rewrite Git manifest metadata to pretend it is this machine's historical Base");
assert.match(uploadSource, /countExcludedFixtureFields\(rawData\)/,
  "upload exclusion counts must come from actual local values, not constants");
assert.equal(uploadSource.includes("tripPattern"), false,
  "upload must not require a fixed TRIP ID format");
assert.match(uploadSource, /let excelRpcReport[\s\S]*catch \(error\)[\s\S]*excelRpcReport = \{ fixtureId: EXCEL_RPC_DATASET_ID, result: "error"/,
  "RPC dataset errors must be reported separately from TRIP fixture processing");
assert.match(uploadSource, /const candidateIds = await query\([\s\S]*?const fixtureReports = \[\]/,
  "TRIP fixture scanning must continue after RPC dataset handling");

console.log("testdata download checks passed (multi-fixture IDs, independent RPC handling, content comparison, visible reporting, and Windows CLI entrypoint)");
