import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMONS_PRECISION_SESSION_TTL_MS,
  hashAdoptedCommonsQuery,
  importCommonsPrecisionTokenKey,
  openCommonsPrecisionNextPageToken,
  sealCommonsPrecisionNextPageToken,
} from "../supabase/functions/travel-route/commonsPrecisionSession.ts";

const key = await importCommonsPrecisionTokenKey(new Uint8Array(32).fill(7));
const hash = await hashAdoptedCommonsQuery("  第一航廈  ");
assert.equal(hash.length, 64);
assert.equal(hash, await hashAdoptedCommonsQuery("第一航廈"), "候選詞 hash 應先正規化空白");
await assert.rejects(() => hashAdoptedCommonsQuery("x"), /2 至 120/);

const continuation = "categorymembers|opaque-private-continuation";
const token = await sealCommonsPrecisionNextPageToken({
  qid: "Q100",
  adoptedQueryHash: hash,
  layer: "read-category-files",
  continuation,
  seenPageIds: [10, 10, 11],
}, key, 1_000, new Uint8Array(12).fill(3));
assert.match(token, /^cp1\.[A-Za-z0-9_-]+$/);
assert.equal(token.includes(continuation), false, "原始 continuation 不得出現在 token");

const opened = await openCommonsPrecisionNextPageToken(token, key, {
  nowMs: 1_000 + COMMONS_PRECISION_SESSION_TTL_MS - 1,
  qid: "Q100",
  adoptedQueryHash: hash,
});
assert.equal(opened.status, "valid");
if (opened.status === "valid") {
  assert.equal(opened.session.layer, "read-category-files");
  assert.equal(opened.session.continuation, continuation);
  assert.deepEqual(opened.session.seenPageIds, [10, 11]);
  assert.equal(opened.session.contractVersion, "commons-precision-v1");
}
assert.deepEqual(await openCommonsPrecisionNextPageToken(token, key, {
  nowMs: 1_000 + COMMONS_PRECISION_SESSION_TTL_MS,
  qid: "Q100",
  adoptedQueryHash: hash,
}), { status: "session-expired" });
assert.deepEqual(await openCommonsPrecisionNextPageToken(token, key, {
  nowMs: 1_001,
  qid: "Q999",
  adoptedQueryHash: hash,
}), { status: "session-expired" });
assert.deepEqual(await openCommonsPrecisionNextPageToken(`${token.slice(0, -1)}x`, key, {
  nowMs: 1_001,
  qid: "Q100",
  adoptedQueryHash: hash,
}), { status: "session-expired" });

const textToken = await sealCommonsPrecisionNextPageToken({
  qid: "Q100",
  adoptedQueryHash: hash,
  layer: "search-adopted-text",
  continuation: "search|opaque",
  seenPageIds: [],
}, key, 1_000, new Uint8Array(12).fill(4));
assert.notEqual(textToken, token, "不同 layer 不得產生相同 token");
await assert.rejects(() => sealCommonsPrecisionNextPageToken({
  qid: "Q100",
  adoptedQueryHash: hash,
  layer: "read-category-files",
  continuation: "",
  seenPageIds: [],
}, key, 1_000), /內容不正確/);

const projectRoot = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(projectRoot, "supabase/functions/travel-route/commonsPrecisionSession.ts"), "utf8");
assert.doesNotMatch(source, /fetch\(|supabase|localStorage|indexedDB/i);
assert.match(source, /AES-GCM/);

console.log("V3.9.1 短效加密續頁 token、QID／候選詞綁定與到期行為驗證通過。");
