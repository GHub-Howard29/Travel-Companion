import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMONS_PRECISION_BROAD_FIXTURE,
  COMMONS_PRECISION_INSUFFICIENT_FIXTURE,
  getCommonsPrecisionRegressionFixture,
  isLoopbackSupabaseRuntime,
} from "../supabase/functions/travel-route/commonsPrecisionRegressionFixture.ts";

assert.equal(isLoopbackSupabaseRuntime("http://127.0.0.1:54321"), true);
assert.equal(isLoopbackSupabaseRuntime("http://localhost:54321"), true);
assert.equal(isLoopbackSupabaseRuntime("http://kong:8000"), true);
assert.equal(isLoopbackSupabaseRuntime("https://project.supabase.co"), false);
assert.equal(isLoopbackSupabaseRuntime("not-a-url"), false);

const broad = getCommonsPrecisionRegressionFixture(COMMONS_PRECISION_BROAD_FIXTURE);
assert.ok(broad);
assert.equal(broad.contractVersion, "commons-precision-v2");
assert.equal(broad.state, "results");
assert.equal(broad.searchMode, "broad");
assert.equal(broad.candidates.length, 6);
assert.ok(broad.candidates.every((candidate) => candidate.tier === "manual-review"));
assert.equal(broad.nextPageToken, undefined);

const insufficient = getCommonsPrecisionRegressionFixture(COMMONS_PRECISION_INSUFFICIENT_FIXTURE);
assert.ok(insufficient);
assert.equal(insufficient.contractVersion, "commons-precision-v2");
assert.equal(insufficient.state, "results");
assert.equal(insufficient.searchMode, "entity-guided");
assert.equal(insufficient.candidates.length, 4);
assert.deepEqual(insufficient.candidates.map((candidate) => candidate.tier), [
  "precise",
  "precise",
  "manual-review",
  "manual-review",
]);
assert.equal(insufficient.nextPageToken, undefined);
assert.equal(getCommonsPrecisionRegressionFixture("unknown"), null);

const root = resolve(import.meta.dirname, "..");
const edge = readFileSync(resolve(root, "supabase/functions/travel-route/index.ts"), "utf8");
const client = readFileSync(resolve(root, "src/services/travelRouteService.ts"), "utf8");
assert.match(edge, /isLoopbackSupabaseRuntime\(Deno\.env\.get\("SUPABASE_URL"\)/);
assert.match(edge, /if \(regressionFixture\) return json\(regressionFixture\)/);
assert.match(client, /import\.meta\.env\.DEV/);
assert.match(client, /tcRegressionFixture/);
assert.match(client, /commons-broad-manual/);
assert.match(client, /commons-insufficient/);

console.log("V3.9.11 本機廣泛候選、候選不足 fixture、loopback 限制與正式環境防線驗證通過。");
