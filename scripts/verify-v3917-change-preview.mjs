import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260927180500_v3917_change_preview_journal.sql",
  "utf8",
);
const revisionHook = fs.readFileSync("src/hooks/useTripDataRevision.ts", "utf8");
const notice = fs.readFileSync("src/components/TripDataRevisionNotice.tsx", "utf8");
const modal = fs.readFileSync("src/components/TripChangePreviewModal.tsx", "utf8");
const service = fs.readFileSync("src/services/tripChangePreviewService.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");

assert.match(migration, /create table if not exists public\.trip_change_journal/);
assert.match(
  migration,
  /category in \('itinerary', 'photo', 'expense', 'checklist', 'settings'\)/,
);
assert.match(migration, /action in \('added', 'updated', 'deleted', 'changed'\)/);
assert.match(migration, /item_count integer not null check \(item_count > 0\)/);
assert.match(migration, /source_client_id uuid null/);
assert.match(migration, /revision bigint not null/);
assert.match(migration, /occurred_at timestamptz/);
assert.match(migration, /trip_change_journal_select_managers/);
assert.match(migration, /public\.tc_is_super_admin\(\)/);
assert.match(migration, /public\.tc_is_trip_editor\(trip_id\)/);
assert.match(migration, /interval '90 days'/);
assert.match(migration, /expenses_record_change_summary/);
assert.match(migration, /trips_record_checklist_summary/);
assert.match(migration, /tc_record_trip_master_summary/);

assert.match(revisionHook, /knownRevisionUpdatedAtRef/);
assert.match(revisionHook, /changePreviewWindowRef/);
assert.match(revisionHook, /getTripChangePreview/);
assert.match(revisionHook, /openChangePreview/);
assert.match(revisionHook, /fromRevision:/);
assert.match(revisionHook, /fromUpdatedAt:/);

assert.match(notice, />\s*預覽變更\s*</);
assert.match(notice, /onPreviewChanges/);
assert.match(modal, /變更摘要/);
assert.match(modal, /顯示自上次載入後的主要變更類別與數量/);
assert.match(
  modal,
  /此頁只顯示變更類別與數量，不顯示照片、帳目、核對項目或其他內容的詳細差異/,
);
assert.match(modal, /每日行程/);
assert.match(modal, /照片附件/);
assert.match(modal, /旅費帳本/);
assert.match(modal, /核對清單/);
assert.match(modal, /其他設定/);
assert.doesNotMatch(modal, /before\/after|JSON 差異|舊照片|新照片/);

assert.match(service, /trip_change_journal/);
assert.match(service, /APP_SOURCE_CLIENT_ID/);
assert.match(service, /row\.source_client_id !== APP_SOURCE_CLIENT_ID/);
assert.match(app, /<TripChangePreviewModal/);
assert.match(app, /onPreviewChanges=\{openChangePreview\}/);

console.log("V3.9.17 預覽變更摘要、最小 Change Journal 與非細節 UI 契約驗證通過。");
