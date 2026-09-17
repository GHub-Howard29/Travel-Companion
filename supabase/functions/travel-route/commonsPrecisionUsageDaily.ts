import type { CommonsPrecisionUsageDelta } from "./commonsPrecisionUsage.ts";
import { createEmptyCommonsPrecisionUsageDelta, mergeCommonsPrecisionUsageDelta } from "./commonsPrecisionUsage.ts";

export const COMMONS_PRECISION_USAGE_RETAINED_COMPLETE_MONTHS = 13;

export interface CommonsPrecisionUsageDailyRow {
  dateKey: string;
  counters: CommonsPrecisionUsageDelta;
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const monthKeyPattern = /^\d{4}-\d{2}$/;

const parseDateKey = (dateKey: string): Date => {
  if (!dateKeyPattern.test(dateKey)) throw new RangeError("日彙總日期必須是 YYYY-MM-DD");
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) throw new RangeError("日彙總日期不存在");
  return date;
};

export const assertCommonsPrecisionUsageDateKey = (dateKey: string): string => {
  parseDateKey(dateKey);
  return dateKey;
};

export const getCommonsPrecisionUsageMonthKey = (dateKey: string): string => {
  assertCommonsPrecisionUsageDateKey(dateKey);
  return dateKey.slice(0, 7);
};

const monthIndex = (monthKey: string): number => {
  if (!monthKeyPattern.test(monthKey)) throw new RangeError("月份必須是 YYYY-MM");
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (month < 1 || month > 12) throw new RangeError("月份不存在");
  return year * 12 + month - 1;
};

export const isCommonsPrecisionUsageDateRetained = (dateKey: string, currentDateKey: string): boolean => {
  const rowDate = parseDateKey(dateKey);
  const currentDate = parseDateKey(currentDateKey);
  if (rowDate.getTime() > currentDate.getTime()) return false;
  const difference = monthIndex(getCommonsPrecisionUsageMonthKey(currentDateKey)) - monthIndex(getCommonsPrecisionUsageMonthKey(dateKey));
  return difference >= 0 && difference <= COMMONS_PRECISION_USAGE_RETAINED_COMPLETE_MONTHS;
};

export const mergeCommonsPrecisionUsageDailyRow = (
  row: CommonsPrecisionUsageDailyRow | null,
  dateKey: string,
  delta: CommonsPrecisionUsageDelta,
): CommonsPrecisionUsageDailyRow => {
  assertCommonsPrecisionUsageDateKey(dateKey);
  if (row && row.dateKey !== dateKey) throw new Error("日彙總列日期不一致");
  return { dateKey, counters: row ? mergeCommonsPrecisionUsageDelta(row.counters, delta) : mergeCommonsPrecisionUsageDelta(createEmptyCommonsPrecisionUsageDelta(), delta) };
};

export const pruneCommonsPrecisionUsageDailyRows = (
  rows: readonly CommonsPrecisionUsageDailyRow[],
  currentDateKey: string,
): CommonsPrecisionUsageDailyRow[] => {
  assertCommonsPrecisionUsageDateKey(currentDateKey);
  return rows.filter((row) => isCommonsPrecisionUsageDateRetained(row.dateKey, currentDateKey)).map((row) => ({ dateKey: row.dateKey, counters: { ...row.counters } }));
};

export const sumCommonsPrecisionUsageByMonth = (
  rows: readonly CommonsPrecisionUsageDailyRow[],
  monthKey: string,
): CommonsPrecisionUsageDelta => {
  monthIndex(monthKey);
  return rows.filter((row) => getCommonsPrecisionUsageMonthKey(row.dateKey) === monthKey).reduce((total, row) => mergeCommonsPrecisionUsageDelta(total, row.counters), createEmptyCommonsPrecisionUsageDelta());
};
