import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const migration = readFileSync(resolve(projectRoot, "supabase/migrations/20260915105815_v391_commons_precision_infrastructure.sql"), "utf8");
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
console.log("V3.9.1 Commons migration RLS、service-role-only、容量與資料最小化靜態驗證通過。");
