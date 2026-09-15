import assert from "node:assert/strict";
import { createCommonsPrecisionUsageDelta } from "../supabase/functions/travel-route/commonsPrecisionUsage.ts";
import { mergeCommonsPrecisionUsageDailyRow } from "../supabase/functions/travel-route/commonsPrecisionUsageDaily.ts";
import {
  COMMONS_PRECISION_USAGE_DAILY_CONTRACT_VERSION,
  assertCommonsPrecisionUsagePersistenceShape,
  createCommonsPrecisionUsageDailyAtomicUpdate,
  createCommonsPrecisionUsageDailyPersistencePayload,
} from "../supabase/functions/travel-route/commonsPrecisionUsagePersistence.ts";

const delta = createCommonsPrecisionUsageDelta({ state: "results", upstreamRequests: 2, durationMs: 1_000 });
const row = mergeCommonsPrecisionUsageDailyRow(null, "2026-09-15", delta);
const payload = createCommonsPrecisionUsageDailyPersistencePayload(row);
assert.equal(payload.contractVersion, COMMONS_PRECISION_USAGE_DAILY_CONTRACT_VERSION);
assertCommonsPrecisionUsagePersistenceShape(payload);
const update = createCommonsPrecisionUsageDailyAtomicUpdate({ dateKey: "2026-09-15", currentDateKey: "2026-09-15", delta });
assert.equal(update.dateKey, "2026-09-15");
assert.equal(update.pruneMonthBefore, "2026-09");
assert.throws(() => createCommonsPrecisionUsageDailyAtomicUpdate({ dateKey: "2026-09-14", currentDateKey: "2026-09-15", delta }), /當日列/);
assert.throws(() => assertCommonsPrecisionUsagePersistenceShape({ ...payload, userId: "x" }), /禁止保存欄位/);
assert.throws(() => assertCommonsPrecisionUsagePersistenceShape({ ...payload, counters: { ...payload.counters, query: 1 } }), /禁止未知計數欄位/);
assert.throws(() => assertCommonsPrecisionUsagePersistenceShape({ ...payload, contractVersion: "old" }), /版本不符/);
console.log("V3.9.1 Commons 用量日彙總持久化邊界與原子更新輸入契約驗證通過。");
