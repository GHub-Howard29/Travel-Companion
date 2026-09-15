import assert from "node:assert/strict";
import { createCommonsPrecisionUsageDelta } from "../supabase/functions/travel-route/commonsPrecisionUsage.ts";
import {
  COMMONS_PRECISION_USAGE_RETAINED_COMPLETE_MONTHS,
  getCommonsPrecisionUsageMonthKey,
  isCommonsPrecisionUsageDateRetained,
  mergeCommonsPrecisionUsageDailyRow,
  pruneCommonsPrecisionUsageDailyRows,
  sumCommonsPrecisionUsageByMonth,
} from "../supabase/functions/travel-route/commonsPrecisionUsageDaily.ts";

assert.equal(getCommonsPrecisionUsageMonthKey("2026-09-15"), "2026-09");
assert.throws(() => getCommonsPrecisionUsageMonthKey("2026-02-30"), /不存在/);
assert.equal(isCommonsPrecisionUsageDateRetained("2025-08-31", "2026-09-15"), true);
assert.equal(isCommonsPrecisionUsageDateRetained("2025-07-31", "2026-09-15"), false);
assert.equal(isCommonsPrecisionUsageDateRetained("2026-10-01", "2026-09-15"), false);
assert.equal(COMMONS_PRECISION_USAGE_RETAINED_COMPLETE_MONTHS, 13);

const first = createCommonsPrecisionUsageDelta({ state: "results", upstreamRequests: 2, durationMs: 1_000 });
const second = createCommonsPrecisionUsageDelta({ state: "timeout", upstreamRequests: 1, durationMs: 6_000 });
const row = mergeCommonsPrecisionUsageDailyRow(null, "2026-09-15", first);
const merged = mergeCommonsPrecisionUsageDailyRow(row, "2026-09-15", second);
assert.equal(merged.counters.precisionSearches, 2);
assert.equal(merged.counters.timeoutCount, 1);
assert.throws(() => mergeCommonsPrecisionUsageDailyRow(row, "2026-09-16", first), /日期不一致/);

const rows = [merged, mergeCommonsPrecisionUsageDailyRow(null, "2025-08-31", first), mergeCommonsPrecisionUsageDailyRow(null, "2025-07-31", second)];
const retained = pruneCommonsPrecisionUsageDailyRows(rows, "2026-09-15");
assert.equal(retained.length, 2);
assert.equal(sumCommonsPrecisionUsageByMonth(rows, "2026-09").precisionSearches, 2);
assert.equal(sumCommonsPrecisionUsageByMonth(rows, "2025-08").upstreamRequests, 2);
retained[0].counters.precisionSearches = 999;
assert.equal(rows[0].counters.precisionSearches, 2, "清理結果不得修改原始列");
console.log("V3.9.1 Commons 日彙總日期、保留、合併與月份加總契約驗證通過。");
