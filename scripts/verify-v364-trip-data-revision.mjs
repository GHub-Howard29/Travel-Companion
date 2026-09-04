import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APP_SOURCE_CLIENT_HEADER,
  APP_SOURCE_CLIENT_ID,
  shouldNotifyForRevision,
  toAppDataRevision,
} from "../src/services/tripDataRevisionService.ts";
import { getParticipantAliasByEmail } from "../src/utils/participantUtils.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const ownNext = {
  revision: 11,
  updatedAt: "2026-09-04T00:00:00.000Z",
  sourceClientId: APP_SOURCE_CLIENT_ID,
};
assert.equal(shouldNotifyForRevision(10, ownNext), false);
assert.equal(shouldNotifyForRevision(9, ownNext), true, "own-source revision gaps must notify");
assert.equal(
  shouldNotifyForRevision(10, { ...ownNext, sourceClientId: crypto.randomUUID() }),
  true,
);
assert.equal(shouldNotifyForRevision(11, ownNext), false);
assert.deepEqual(
  toAppDataRevision({
    revision: "12",
    updated_at: "2026-09-04T00:00:01.000Z",
    source_client_id: null,
  }),
  {
    revision: 12,
    updatedAt: "2026-09-04T00:00:01.000Z",
    sourceClientId: null,
  },
);
assert.equal(toAppDataRevision({ revision: -1, updated_at: "bad" }), null);
assert.equal(
  getParticipantAliasByEmail(" HOWARD@EXAMPLE.COM ", {
    " Howard ": " howard@example.com ",
  }),
  "Howard",
  "historical participant lookup must normalize email and alias whitespace",
);
assert.equal(
  getParticipantAliasByEmail("other@example.com", {
    Howard: "howard@example.com",
  }),
  null,
);

const migration = readSource(
  "supabase/migrations/20260904105703_v364_trip_data_revision.sql",
);
const app = readSource("src/App.tsx");
const revisionHook = readSource("src/hooks/useTripDataRevision.ts");
const tripCloud = readSource("src/services/tripCloudService.ts");
const sharedCleanup = readSource("src/storage/sharedTripDataStorage.ts");
const tripEditor = readSource("src/components/TripEditorModal.tsx");
const appVersion = readSource("src/config/appVersion.ts");

assert.match(migration, /create table public\.app_data_revision/);
assert.match(migration, /constraint app_data_revision_singleton_check check \(singleton\)/);
assert.match(migration, /alter table public\.app_data_revision enable row level security/);
assert.match(migration, /grant select on table public\.app_data_revision to authenticated/);
assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*app_data_revision/i);
assert.match(migration, /realtime\.send\(/);
assert.match(migration, /travel-companion:data-revision:/);
assert.match(migration, /realtime\.messages\.extension = 'broadcast'/);
assert.match(migration, /realtime\.topic\(\)/);
assert.match(migration, /No INSERT policy is created on realtime\.messages/);
assert.match(migration, /trips_broadcast_data_revision_insert/);
assert.match(migration, /trips_broadcast_data_revision_update/);
assert.match(migration, /trips_broadcast_data_revision_delete/);
assert.match(migration, /old\.content - array\['checklistData', 'otherInfoItems'\]/);
assert.match(migration, /admin_users_broadcast_trip_editor_insert/);
assert.match(migration, /admin_users_broadcast_trip_editor_update/);
assert.match(migration, /admin_users_broadcast_trip_editor_delete/);
const payloadFields = migration.match(
  /perform realtime\.send\(\s*jsonb_build_object\(([\s\S]*?)\),\s*'revision_changed'/,
)?.[1] ?? "";
assert.match(payloadFields, /'revision'/);
assert.match(payloadFields, /'updated_at'/);
assert.match(payloadFields, /'source_client_id'/);
assert.doesNotMatch(payloadFields, /trip_id|email|role|participant/i);
assert.doesNotMatch(migration, /broadcast_changes/);

assert.equal(APP_SOURCE_CLIENT_HEADER, "x-travel-companion-client-id");
assert.match(app, /\[APP_SOURCE_CLIENT_HEADER\]: APP_SOURCE_CLIENT_ID/);
assert.match(revisionHook, /config: \{ private: true \}/);
assert.match(revisionHook, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 400\)/);
assert.match(revisionHook, /window\.location\.reload\(\)/);
assert.match(app, /isHistoricalReadOnlyParticipant/);
assert.match(app, /!isHistoricalReadOnlyParticipant/);
assert.match(app, /hasEditPermission=\{canEditTripMaster\}/);
assert.match(app, /canSyncSharedChecklist=\{canEditSharedTrip\}/);
assert.match(tripCloud, /\.eq\("updated_at", expectedUpdatedAt\)/);
assert.match(tripCloud, /throw new TripVersionConflictError\(\)/);
assert.match(app, /upsertCloudTripRecord/);
assert.doesNotMatch(sharedCleanup, /privateChecklist/i);
assert.match(sharedCleanup, /removeRestrictedOtherInfoFromStoredTrip/);
assert.match(tripEditor, /記帳代號設定（不授予本行程編輯權）/);
assert.match(tripEditor, /可編輯者 Google Email/);
assert.match(appVersion, /export const APP_VERSION = "3\.6\.4"/);
assert.match(appVersion, /export const MINIMUM_SUPPORTED_VERSION = "3\.6\.4"/);
assert.match(appVersion, /export const FORCE_UPDATE = true/);
assert.match(appVersion, /export const IS_MANDATORY_RELEASE = true/);

console.log("V3.6.4 歷史參與者、版本訊號、快取清理與併發控制驗證通過。");
