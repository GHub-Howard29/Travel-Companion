import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const migration = readFileSync(resolve(projectRoot, "supabase/migrations/20260915105815_v391_commons_precision_infrastructure.sql"), "utf8");
const legacyTableRlsMigration = readFileSync(resolve(projectRoot, "supabase/migrations/20260916153228_v391_restore_legacy_table_rls.sql"), "utf8");
for (const table of ["commons_precision_cache", "commons_precision_quota_state", "commons_precision_upstream_lock", "commons_precision_usage_daily"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
}
for (const fn of ["tc_claim_commons_precision_upstream_slot", "tc_acquire_commons_precision_upstream_lock", "tc_release_commons_precision_upstream_lock", "tc_put_commons_precision_cache", "tc_acquire_commons_precision_cache_lock", "tc_release_commons_precision_cache_lock", "tc_add_commons_precision_usage"]) {
  assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`));
}
assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete|execute)[^;]+to\s+(?:anon|authenticated)/i);
assert.doesNotMatch(migration, /security definer/i);
assert.match(migration, /interval '13 months'/);
assert.match(migration, /interval '25 seconds'/);
assert.match(migration, /active_rows >= 5000/);
assert.match(migration, /total_bytes \+ requested_bytes > 10485760/);
assert.match(migration, /candidate_bytes \+ requested_bytes > 8388608/);
assert.match(migration, /evidence_bytes \+ requested_bytes > 2097152/);
assert.doesNotMatch(migration, /trip_id|user_id|search_query|file_title|image_url|ip_address/i);

for (const table of ["checklists", "checklist_items", "other_info_items", "exchange_purchases"]) {
  assert.match(legacyTableRlsMigration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(legacyTableRlsMigration, new RegExp(`create policy ${table}_${operation}_policy`, "i"));
  }
}
assert.match(legacyTableRlsMigration, /revoke all on table public\.checklists,[\s\S]+from anon, authenticated/i);
assert.match(legacyTableRlsMigration, /for select\s+to anon, authenticated/i);
assert.match(legacyTableRlsMigration, /for (?:insert|update|delete)\s+to authenticated/i);
assert.match(legacyTableRlsMigration, /tc_can_write_shared_trip\(trip_id\)/i);
assert.match(legacyTableRlsMigration, /create or replace function public\.tc_can_sync_private_checklist\(target_trip_id text\)/i);
assert.match(legacyTableRlsMigration, /security invoker/i);
assert.doesNotMatch(legacyTableRlsMigration, /security definer/i);
console.log("V3.9.1 Commons migration RLS、service-role-only、容量與資料最小化靜態驗證通過。");
