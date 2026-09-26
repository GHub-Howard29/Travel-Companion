import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const edge = readFileSync(resolve(root, "supabase/functions/travel-route/index.ts"), "utf8");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260926194000_v3913_commons_translation_batch.sql"),
  "utf8",
);
const client = readFileSync(resolve(root, "src/services/travelRouteService.ts"), "utf8");
const itineraryPage = readFileSync(resolve(root, "src/components/ItineraryPage.tsx"), "utf8");

assert.match(edge, /GOOGLE_CLOUD_TRANSLATE_API_KEY/);
assert.match(edge, /https:\/\/translation\.googleapis\.com\/language\/translate\/v2/);
assert.match(edge, /target:\s*"zh-TW"/);
assert.match(edge, /tc_claim_commons_translation_slots/);
assert.match(edge, /translationSource:\s*translated\?\.source/);
assert.match(edge, /translationStatus:\s*translated \? "ready" : "unavailable"/);
assert.match(edge, /batchContractVersion === 2/g);
assert.match(edge, /sourceKind:\s*"broad-search"/);
assert.match(edge, /sourceKind:\s*"category"/);
assert.match(edge, /userId:\s*clients\.userId/);
assert.match(edge, /tripId:\s*body\.tripId/);
assert.match(edge, /nextBatchToken/);
assert.match(edge, /hasMoreEligibleCandidates/);
assert.match(edge, /session-expired/);

for (const table of [
  "commons_category_translation_cache",
  "commons_translation_usage_windows",
  "commons_candidate_batch_sessions",
]) {
  assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}

assert.match(migration, /grant select, insert, update, delete on table public\.commons_category_translation_cache to service_role/);
assert.match(migration, /grant select, insert, update, delete on table public\.commons_candidate_batch_sessions to service_role/);
assert.match(migration, /tc_cleanup_v3913_commons_ephemeral/);
assert.match(migration, /tc_claim_commons_translation_slots/);

assert.match(client, /canonicalName: string/);
assert.match(client, /displayChineseLabel\?: string/);
assert.match(client, /translationSource\?: "wikidata" \| "google-nmt"/);
assert.match(client, /searchCommonsEligiblePhotoBatch/);
assert.match(client, /getCommonsEligibleCategoryPhotoBatch/);
assert.match(client, /batchContractVersion: 2/);

// Product Owner approved the V3.9.13 UI preview; the formal itinerary UI must now use v2.
assert.match(itineraryPage, /searchCommonsEligiblePhotoBatch/);
assert.match(itineraryPage, /getCommonsEligibleCategoryPhotoBatch/);
assert.match(itineraryPage, /category\.canonicalName/);
assert.match(itineraryPage, /category\.displayChineseLabel/);
assert.match(itineraryPage, /commonsPage >= Math\.ceil\(commonsCandidates\.length \/ 6\) - 1 && commonsNextBatchToken/);
assert.match(itineraryPage, /commonsCategoryPage >= Math\.ceil\(commonsCategoryCandidates\.length \/ 6\) - 1 && commonsCategoryNextBatchToken/);
assert.doesNotMatch(itineraryPage, /commonsNextOffset/);
assert.doesNotMatch(itineraryPage, /commonsCategoryContinuation/);

const walkFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = resolve(dir, name);
  return statSync(path).isDirectory() ? walkFiles(path) : [path];
});
for (const file of walkFiles(resolve(root, "src"))) {
  const content = readFileSync(file, "utf8");
  assert.doesNotMatch(
    content,
    /GOOGLE_CLOUD_TRANSLATE_API_KEY/,
    `Translation API secret name leaked into browser source: ${file}`,
  );
}

console.log("V3.9.13 Commons 翻譯、私有快取、batch v2、安全邊界與正式 UI 切換驗證通過。");
