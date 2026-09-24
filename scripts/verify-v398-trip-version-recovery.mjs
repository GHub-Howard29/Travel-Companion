import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canRecoverStaleTripVersion,
  updateTripWithVersionRecovery,
} from "../src/utils/tripVersionRecovery.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const repository = readSource("src/services/tripRepository.ts");
const cloudService = readSource("src/services/tripCloudService.ts");

assert.match(repository, /updateTripWithVersionRecovery/);
assert.match(repository, /getCloudTripRecord\(supabase, record\.meta\.id\)/);
assert.match(repository, /error instanceof TripVersionConflictError/);
assert.match(cloudService, /export const getCloudTripRecord/);
assert.match(cloudService, /\.eq\("id", tripId\)[\s\S]*?\.maybeSingle\(\)/);

const tripMeta = {
  id: "trip-a",
  title: "Trip",
  departureDate: "2026-10-03",
  participants: ["A", "B"],
  currencyConfig: { code: "JPY", symbol: "¥" },
};
const storedRecord = {
  meta: {
    ...tripMeta,
    detailPath: "/trips/trip-a.json",
  },
  detail: {
    id: "trip-a",
    title: "Trip",
    departureDate: "2026-10-03",
    isPublic: true,
    sidebarConfig: [],
    content: {
      days: [1],
      daysData: { 1: [{ id: "card-a", title: "Card" }] },
      checklistData: [{ id: "local-checklist" }],
      otherInfoItems: [{ id: "local-other-info" }],
    },
  },
  editorEmails: ["editor@example.invalid"],
  updatedAt: "2026-09-24T10:00:00.000Z",
  cloudUpdatedAt: "incorrect-local-time",
};
const cloudRecord = {
  ...storedRecord,
  meta: {
    currencyConfig: { symbol: "¥", code: "JPY" },
    participants: ["A", "B"],
    departureDate: "2026-10-03",
    title: "Trip",
    id: "trip-a",
  },
  detail: {
    ...storedRecord.detail,
    content: {
      ...storedRecord.detail.content,
      checklistData: [{ id: "cloud-checklist" }],
      otherInfoItems: [{ id: "cloud-other-info" }],
    },
  },
  editorEmails: [],
  updatedAt: "2026-09-24T09:00:00.000Z",
  cloudUpdatedAt: "2026-09-24T09:00:00.000Z",
};

assert.equal(
  canRecoverStaleTripVersion(storedRecord, cloudRecord),
  true,
  "獨立同步資料、非持久化 meta 與物件鍵順序不得阻止舊版本自癒",
);

const remotelyEditedRecord = {
  ...cloudRecord,
  detail: {
    ...cloudRecord.detail,
    content: {
      ...cloudRecord.detail.content,
      daysData: { 1: [{ id: "card-a", title: "Other device edit" }] },
    },
  },
};
assert.equal(
  canRecoverStaleTripVersion(storedRecord, remotelyEditedRecord),
  false,
  "真正的行程本體差異必須維持版本衝突",
);

const staleConflict = new Error("stale version");
const updateAttempts = [];
let cloudLoads = 0;
const recoveredRecord = await updateTripWithVersionRecovery({
  currentStoredRecord: storedRecord,
  expectedUpdatedAt: "incorrect-local-time",
  update: async (expectedUpdatedAt) => {
    updateAttempts.push(expectedUpdatedAt);
    if (updateAttempts.length === 1) throw staleConflict;
    return { ...cloudRecord, updatedAt: "2026-09-24T11:00:00.000Z" };
  },
  loadLatestCloudRecord: async () => {
    cloudLoads += 1;
    return cloudRecord;
  },
  isVersionConflict: (error) => error === staleConflict,
});
assert.deepEqual(updateAttempts, [
  "incorrect-local-time",
  "2026-09-24T09:00:00.000Z",
]);
assert.equal(cloudLoads, 1, "自癒只能重新讀取一次雲端 Trip");
assert.equal(recoveredRecord.updatedAt, "2026-09-24T11:00:00.000Z");

let realConflictAttempts = 0;
await assert.rejects(
  updateTripWithVersionRecovery({
    currentStoredRecord: storedRecord,
    expectedUpdatedAt: "incorrect-local-time",
    update: async () => {
      realConflictAttempts += 1;
      throw staleConflict;
    },
    loadLatestCloudRecord: async () => remotelyEditedRecord,
    isVersionConflict: (error) => error === staleConflict,
  }),
  (error) => error === staleConflict,
);
assert.equal(realConflictAttempts, 1, "真正的跨裝置衝突不得自動重試");

const unrelatedError = new Error("network failure");
let unrelatedCloudLoads = 0;
await assert.rejects(
  updateTripWithVersionRecovery({
    currentStoredRecord: storedRecord,
    expectedUpdatedAt: "current-time",
    update: async () => {
      throw unrelatedError;
    },
    loadLatestCloudRecord: async () => {
      unrelatedCloudLoads += 1;
      return cloudRecord;
    },
    isVersionConflict: (error) => error === staleConflict,
  }),
  (error) => error === unrelatedError,
);
assert.equal(unrelatedCloudLoads, 0, "非版本衝突不得觸發額外雲端讀取");

console.log("V3.9.8 舊版 Trip 時間戳自癒與真正跨裝置衝突保護驗證通過。");
