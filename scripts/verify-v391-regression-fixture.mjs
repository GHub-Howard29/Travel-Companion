import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMONS_PRECISION_AMBIGUOUS_FIXTURE,
  getCommonsPrecisionRegressionFixture,
  isLoopbackSupabaseRuntime,
} from "../supabase/functions/travel-route/commonsPrecisionRegressionFixture.ts";

assert.equal(isLoopbackSupabaseRuntime("http://127.0.0.1:54321"), true);
assert.equal(isLoopbackSupabaseRuntime("http://localhost:54321"), true);
assert.equal(isLoopbackSupabaseRuntime("http://kong:8000"), true);
assert.equal(isLoopbackSupabaseRuntime("https://project.supabase.co"), false);
assert.equal(isLoopbackSupabaseRuntime("not-a-url"), false);

const ambiguous = getCommonsPrecisionRegressionFixture(COMMONS_PRECISION_AMBIGUOUS_FIXTURE);
assert.ok(ambiguous);
assert.equal(ambiguous.state, "entity-ambiguous");
assert.equal(ambiguous.candidates.length, 0);
assert.equal(ambiguous.entityChoices?.length, 3);
assert.equal(ambiguous.entityChoices?.[0].description, "本機回歸資料：都會捷運車站");
assert.equal(ambiguous.entityChoices?.[2].description, undefined);

const selected = getCommonsPrecisionRegressionFixture(COMMONS_PRECISION_AMBIGUOUS_FIXTURE, "Q90000001");
assert.ok(selected);
assert.equal(selected.state, "no-suitable-image");
assert.deepEqual(selected.resolvedEntity, {
  qid: "Q90000001",
  label: "中山站",
  description: "本機回歸資料：都會捷運車站",
});
assert.equal(getCommonsPrecisionRegressionFixture(COMMONS_PRECISION_AMBIGUOUS_FIXTURE, "Q1"), null);
assert.equal(getCommonsPrecisionRegressionFixture("unknown"), null);

const root = resolve(import.meta.dirname, "..");
const edge = readFileSync(resolve(root, "supabase/functions/travel-route/index.ts"), "utf8");
const client = readFileSync(resolve(root, "src/services/travelRouteService.ts"), "utf8");
assert.match(edge, /isLoopbackSupabaseRuntime\(Deno\.env\.get\("SUPABASE_URL"\)/);
assert.match(edge, /if \(regressionFixture\) return json\(regressionFixture\)/);
assert.match(client, /import\.meta\.env\.DEV/);
assert.match(client, /tcRegressionFixture/);

console.log("V3.9.1 本機多實體瀏覽器 fixture、loopback 限制與正式環境防線驗證通過。");
