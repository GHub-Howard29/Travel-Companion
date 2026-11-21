import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveItineraryDaysToCloud, ItineraryCloudVersionConflictError } from "../src/services/itineraryCloudSaveService.ts";
import { createNonItineraryTripCloudRecord, saveNonItineraryTripCloudFields } from "../src/services/nonItineraryTripCloudSave.ts";

const input = {
  tripId: "trip-test",
  clientId: "client-test",
  expectedVersion: 4,
  daysData: { "1": [{ id: "card-1", title: "test" }] },
  operationId: "operation-test",
};
const expectedArgs = {
  p_trip_id: input.tripId,
  p_client_id: input.clientId,
  p_expected_version: input.expectedVersion,
  p_days_data: input.daysData,
  p_operation_id: input.operationId,
};

const createRpcClient = (data, error = null) => ({
  rpc: async (name, args) => {
    assert.equal(name, "tc_save_itinerary_days");
    assert.deepEqual(args, expectedArgs);
    return { data, error };
  },
});

const saved = await saveItineraryDaysToCloud(createRpcClient([{
  saved: true,
  current_version: 5,
  updated_at: "2026-11-21T00:00:00.000Z",
}]), input);
assert.deepEqual(saved, {
  saved: true,
  currentVersion: 5,
  updatedAt: "2026-11-21T00:00:00.000Z",
});

await assert.rejects(
  saveItineraryDaysToCloud(createRpcClient([{
    saved: false,
    current_version: 5,
    updated_at: null,
  }]), input),
  (error) => error instanceof ItineraryCloudVersionConflictError && error.currentVersion === 5,
);
await assert.rejects(
  saveItineraryDaysToCloud(createRpcClient(null, new Error("rpc rejected")), input),
  /rpc rejected/,
);
await assert.rejects(
  saveItineraryDaysToCloud(createRpcClient({ saved: true, current_version: "bad", updated_at: "now" }), input),
  /回應格式錯誤/,
);
await assert.rejects(
  saveItineraryDaysToCloud(createRpcClient([{
    saved: true,
    current_version: 5,
    updated_at: null,
  }]), input),
  /未回傳確認時間/,
);
await assert.rejects(
  saveItineraryDaysToCloud(createRpcClient([]), { ...input, expectedVersion: 0 }),
  /版本基準無效/,
);

const latestCloudRecord = {
  meta: { id: "trip-test", title: "Fresh title" },
  detail: {
    id: "trip-test",
    content: {
      days: [1],
      daysData: { "1": [{ id: "fresh-card" }] },
      checklistData: [],
      otherInfoFolders: [],
      mode: "guided",
    },
  },
  updatedAt: "2026-11-21T00:00:00.000Z",
  cloudUpdatedAt: "2026-11-21T00:00:00.000Z",
};
const patch = { otherInfoFolders: [{ id: "folder-1", name: "Travel" }] };
const merged = createNonItineraryTripCloudRecord(latestCloudRecord, patch);
assert.deepEqual(merged.detail.content.daysData, latestCloudRecord.detail.content.daysData);
assert.deepEqual(merged.detail.content.otherInfoFolders, patch.otherInfoFolders);
assert.notEqual(merged.updatedAt, latestCloudRecord.updatedAt);
assert.equal(merged.cloudUpdatedAt, latestCloudRecord.updatedAt);

assert.throws(
  () => createNonItineraryTripCloudRecord(latestCloudRecord, { daysData: { "1": [] } }),
  /只允許 Checklist／Other Info folders/,
);
assert.throws(
  () => createNonItineraryTripCloudRecord(latestCloudRecord, {}),
  /只允許 Checklist／Other Info folders/,
);

let readCount = 0;
let comparedRecord;
let comparedVersion;
const adapter = {
  readLatest: async (tripId) => {
    assert.equal(tripId, "trip-test");
    readCount += 1;
    return latestCloudRecord;
  },
  compareAndSwap: async (record, expectedUpdatedAt) => {
    comparedRecord = record;
    comparedVersion = expectedUpdatedAt;
    return record;
  },
};
const repositorySaved = await saveNonItineraryTripCloudFields("trip-test", patch, adapter);
assert.equal(readCount, 1);
assert.equal(comparedVersion, latestCloudRecord.updatedAt);
assert.deepEqual(comparedRecord.detail.content.daysData, latestCloudRecord.detail.content.daysData);
assert.deepEqual(repositorySaved.detail.content.otherInfoFolders, patch.otherInfoFolders);

await assert.rejects(
  saveNonItineraryTripCloudFields("trip-test", patch, {
    readLatest: async () => null,
    compareAndSwap: async () => {
      throw new Error("compareAndSwap should not run without a current row");
    },
  }),
  /找不到雲端旅程/,
);

await assert.rejects(
  saveNonItineraryTripCloudFields("trip-test", patch, {
    readLatest: async () => latestCloudRecord,
    compareAndSwap: async () => {
      throw new Error("Trip row changed after the current client loaded it");
    },
  }),
  /Trip row changed/,
  "a concurrent itinerary update must fail CAS rather than overwrite fresh daysData",
);

const service = readFileSync(new URL("../src/services/itineraryCloudSaveService.ts", import.meta.url), "utf8");
assert.match(service, /tc_save_itinerary_days/);
assert.match(service, /p_expected_version/);
assert.doesNotMatch(service, /\.from\(["']trips["']\)\s*\.update/);

const cloudService = readFileSync(new URL("../src/services/tripCloudService.ts", import.meta.url), "utf8");
assert.match(cloudService, /updateCloudTripNonItineraryFields/);
assert.match(cloudService, /readLatest:.*getCloudTripRecord/s);
assert.match(cloudService, /compareAndSwap:.*updateCloudTripRecord/s);

const repository = readFileSync(new URL("../src/services/tripRepository.ts", import.meta.url), "utf8");
assert.match(repository, /既有 Trip 不可透過非版本 upsert 保存/);
assert.match(repository, /insertCloudTripRecord\(supabase, record\)/, "new Trip creation must retain the dedicated insert path");
assert.match(repository, /updateCloudTripRecord\(supabase, record, version\)/, "the guarded legacy versioned path is still present pending S3 caller migration");

console.log("ADR-001 S2 Cloud Save and non-itinerary Repository contract tests passed.");
