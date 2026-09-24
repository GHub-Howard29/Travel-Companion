import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260924091852_v397_full_application_snapshots.sql");
const cleanupMigration = read("supabase/migrations/20260924110000_v397_deferred_storage_cleanup.sql");
const tool = read("scripts/application-snapshot-admin.mjs");
const deferredDeletionService = read("src/services/deferredStorageDeletionService.ts");

assert.match(migration, /create table private\.application_snapshots/);
assert.match(migration, /'trips'/);
assert.match(migration, /'other_info_items'/);
assert.match(migration, /'admin_users'/);
assert.match(migration, /'admin_profiles'/);
assert.match(migration, /'checklists'/);
assert.match(migration, /'checklist_items'/);
assert.match(migration, /'exchange_purchases'/);
assert.match(migration, /'expenses'/);
assert.match(migration, /'trip_deletion_tombstones'/);
assert.match(migration, /'storage_references'/);
assert.match(migration, /extensions\.digest/);
assert.match(migration, /limit 7/);
assert.match(migration, /0 19 \* \* \*/);
assert.match(migration, /revoke all on table private\.application_snapshots[\s\S]*authenticated, service_role/);
assert.match(migration, /revoke all on function private\.tc_create_application_snapshot/);
assert.match(tool, /create-pre-restore/);
assert.match(tool, /checksumValid/);
assert.match(cleanupMigration, /clock_timestamp\(\) \+ interval '8 days'/);
assert.match(cleanupMigration, /private\.application_snapshots/);
assert.match(cleanupMigration, /tc_storage_object_is_referenced/);
assert.match(cleanupMigration, /delete from storage\.objects/);
assert.match(cleanupMigration, /drop policy if exists expense_attachments_delete_v351/);
assert.match(cleanupMigration, /drop policy if exists itinerary_covers_delete_v390/);
assert.match(deferredDeletionService, /tc_schedule_storage_deletion/);

console.log("V3.9.7 完整應用資料快照靜態契約通過。");
