import assert from "node:assert/strict";

import {
  COMMONS_PRECISION_PROJECT_PER_DAY,
  COMMONS_PRECISION_PROJECT_PER_MINUTE,
  COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS,
  acquireCommonsPrecisionUpstreamLock,
  createCommonsPrecisionUsageSnapshot,
  getCommonsPrecisionTaipeiDateKey,
  isCommonsPrecisionUpstreamLockActive,
  reserveCommonsPrecisionUpstreamRequest,
} from "../supabase/functions/travel-route/commonsPrecisionQuota.ts";

const dayOne = Date.UTC(2026, 0, 1, 16, 0, 0);
assert.equal(getCommonsPrecisionTaipeiDateKey(dayOne), "2026-01-02");
assert.equal(getCommonsPrecisionTaipeiDateKey(dayOne - 1), "2026-01-01");
assert.throws(() => getCommonsPrecisionTaipeiDateKey(-1), /時間戳記/);

let snapshot = createCommonsPrecisionUsageSnapshot(dayOne);
for (let index = 0; index < COMMONS_PRECISION_PROJECT_PER_MINUTE; index += 1) {
  const decision = reserveCommonsPrecisionUpstreamRequest(snapshot, dayOne + index);
  assert.equal(decision.state, "allowed");
  snapshot = decision.snapshot;
}
const minuteLimit = reserveCommonsPrecisionUpstreamRequest(snapshot, dayOne + 1_000);
assert.deepEqual(minuteLimit, {
  state: "project-quota-reached",
  reason: "minute",
  snapshot,
});
const nextMinute = reserveCommonsPrecisionUpstreamRequest(snapshot, dayOne + 60_000);
assert.equal(nextMinute.state, "allowed");
assert.equal(nextMinute.snapshot.minuteUpstreamRequests, 1);

snapshot = {
  ...createCommonsPrecisionUsageSnapshot(dayOne),
  dailyUpstreamRequests: COMMONS_PRECISION_PROJECT_PER_DAY,
};
const dailyLimit = reserveCommonsPrecisionUpstreamRequest(snapshot, dayOne + 1_000);
assert.equal(dailyLimit.state, "project-quota-reached");
if (dailyLimit.state === "project-quota-reached") assert.equal(dailyLimit.reason, "daily");
const nextTaipeiDay = reserveCommonsPrecisionUpstreamRequest(snapshot, dayOne + 24 * 60 * 60 * 1_000);
assert.equal(nextTaipeiDay.state, "allowed", "Asia/Taipei 跨日後應重置每日計數");
assert.equal(nextTaipeiDay.snapshot.dailyUpstreamRequests, 1);

const acquired = acquireCommonsPrecisionUpstreamLock(undefined, dayOne);
assert.equal(acquired.state, "acquired");
if (acquired.state !== "acquired") throw new Error("lock should be acquired");
assert.equal(acquired.lock.expiresAtMs, dayOne + COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS);
assert.equal(isCommonsPrecisionUpstreamLockActive(acquired.lock, dayOne + COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS - 1), true);
assert.equal(isCommonsPrecisionUpstreamLockActive(acquired.lock, dayOne + COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS), false);
const blocked = acquireCommonsPrecisionUpstreamLock(acquired.lock, dayOne + 1_000);
assert.equal(blocked.state, "in-progress");
const reacquired = acquireCommonsPrecisionUpstreamLock(acquired.lock, dayOne + COMMONS_PRECISION_UPSTREAM_LOCK_TTL_MS);
assert.equal(reacquired.state, "acquired");

console.log("V3.9.1 Wikimedia 專案級用量閘門、Asia/Taipei 日界線與 25 秒單一上游鎖驗證通過。");
