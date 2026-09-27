import assert from "node:assert/strict";
import fs from "node:fs";

const revisionHook = fs.readFileSync("src/hooks/useTripDataRevision.ts", "utf8");
const expenseHook = fs.readFileSync("src/hooks/useExpenseBook.ts", "utf8");
const expenseScreen = fs.readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");

assert.match(revisionHook, /if \(!tripId \|\| !email \|\| !navigator\.onLine\) \{\s*return;\s*\}/s);
assert.doesNotMatch(
  revisionHook,
  /if \(!tripId \|\| !email \|\| !navigator\.onLine\) \{[\s\S]*?current \?\? "available"/,
);
assert.match(revisionHook, /if \(!navigator\.onLine \|\| !hasAnyManagementRole\) return false;/);
assert.match(revisionHook, /if \(!revision\) \{\s*return false;\s*\}/s);
assert.match(
  revisionHook,
  /catch \(error\) \{\s*console\.warn\("Failed to check Trip data revision", error\);\s*return false;\s*\}/s,
);
assert.doesNotMatch(
  revisionHook,
  /Failed to revalidate Trip access after revision"[\s\S]*?current \?\? "available"/,
);

const personalSaveStart = expenseHook.indexOf("const saveToPersonalBook = async () =>");
const personalSaveEnd = expenseHook.indexOf("const saveToOfflineSandbox = async () =>");
assert.ok(personalSaveStart >= 0 && personalSaveEnd > personalSaveStart);
const personalSaveBlock = expenseHook.slice(personalSaveStart, personalSaveEnd);
assert.doesNotMatch(personalSaveBlock, /alert\s*\(/);

assert.match(expenseScreen, /個人帳本僅儲存在此裝置/);
assert.match(
  expenseScreen,
  /帳目與照片不會同步到共用雲端。更換裝置或清除瀏覽器資料前，請先匯出 Excel 備份。照片附件也只保存在目前裝置。/,
);
assert.match(expenseScreen, /個人帳本・僅存本機/);

console.log("V3.9.16 離線 revision 誤報與個人帳本非阻斷提示 regression 通過。");
