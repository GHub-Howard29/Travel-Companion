import assert from "node:assert/strict";
import fs from "node:fs";

const expenseHook = fs.readFileSync("src/hooks/useExpenseBook.ts", "utf8");
const expenseScreen = fs.readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");
const itinerary = fs.readFileSync("src/components/ItineraryPage.tsx", "utf8");
const cropEditor = fs.readFileSync("src/components/CoverPhotoCropEditor.tsx", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260927060000_v3915_expense_realtime.sql",
  "utf8",
);

assert.match(migration, /supabase_realtime/);
assert.match(migration, /tablename = 'expenses'/);
assert.match(migration, /add table public\.expenses/);

assert.match(expenseHook, /table:\s*"expenses"/);
assert.doesNotMatch(expenseHook, /filter:\s*`trip_id=eq\.\$\{expenseBookTripId\}`/);
assert.match(expenseHook, /setTimeout\(refreshExpenseBook, 150\)/);
assert.match(expenseHook, /changedTripId && changedTripId !== expenseBookTripId/);
assert.match(expenseHook, /setInterval\(refreshExpenseBook, 30_000\)/);

assert.match(
  expenseScreen,
  /defaultPayerName && isUsingSharedExpenseBook && expenseMembers\.length > 1/,
);

assert.match(itinerary, /body\.style\.position = "fixed"/);
assert.match(itinerary, /body\.style\.overflow = "hidden"/);
assert.match(itinerary, /window\.scrollTo\(\{ top: scrollY, left: 0, behavior: "auto" \}\)/);
assert.match(itinerary, /h-dvh w-full overflow-y-auto overscroll-contain/);
assert.match(itinerary, /sticky bottom-0/);

assert.match(cropEditor, /max-w-\[50dvh\]/);
assert.match(cropEditor, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
assert.match(cropEditor, /hidden items-center gap-3 rounded-xl bg-slate-50 p-3 sm:flex/);

console.log("V3.9.15 Realtime、帳本文案、手機裁切與背景捲動鎖定驗證通過。");
