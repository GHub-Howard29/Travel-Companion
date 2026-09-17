import assert from "node:assert/strict";
import { createCommonsPrecisionUserAgent, executeCommonsPrecisionRequest } from "../supabase/functions/travel-route/commonsPrecisionFetch.ts";

const contactUrl = "https://github.com/GHub-Howard29/Travel-Companion/issues";
assert.equal(createCommonsPrecisionUserAgent(contactUrl), `Travel-Companion/3.9.1 (${contactUrl})`);
assert.throws(() => createCommonsPrecisionUserAgent("owner@example.com"), /HTTPS URL/);
const plan = { layer: "resolve-entity", url: "https://www.wikidata.org/w/api.php?action=wbsearchentities", timeoutMs: 3_000 };
let captured;
const ok = await executeCommonsPrecisionRequest(plan, contactUrl, async (input, init) => {
  captured = { input, init };
  return new Response(JSON.stringify({ search: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
});
assert.equal(ok.state, "ok");
assert.equal(captured.init.method, "GET");
assert.equal(captured.init.redirect, "error");
assert.equal(captured.init.headers["User-Agent"], createCommonsPrecisionUserAgent(contactUrl));
assert.equal(captured.init.headers.Authorization, undefined);
const limited = await executeCommonsPrecisionRequest(plan, contactUrl, async () => new Response("", { status: 429 }));
assert.deepEqual(limited, { state: "rate-limited", status: 429 });
const unavailable = await executeCommonsPrecisionRequest(plan, contactUrl, async () => new Response("", { status: 503 }));
assert.deepEqual(unavailable, { state: "upstream-error", status: 503 });
const wrongType = await executeCommonsPrecisionRequest(plan, contactUrl, async () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } }));
assert.equal(wrongType.state, "upstream-error");
const blocked = await executeCommonsPrecisionRequest({ ...plan, url: "https://example.com/w/api.php" }, contactUrl, async () => { throw new Error("不得呼叫"); });
assert.equal(blocked.state, "upstream-error");
console.log("V3.9.1 Commons Wikimedia fetch、User-Agent、白名單與無重試契約驗證通過。");
