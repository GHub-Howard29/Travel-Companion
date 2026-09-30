import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const sidebar = fs.readFileSync("src/components/layout/AppSidebar.tsx", "utf8");
const modal = fs.readFileSync("src/components/PersonalExpenseAliasModal.tsx", "utf8");
const storage = fs.readFileSync("src/storage/personalExpenseAliasStorage.ts", "utf8");
const hook = fs.readFileSync("src/hooks/useExpenseBook.ts", "utf8");
const screen = fs.readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");

assert.match(storage, /personal_expense_alias_v1:/);
assert.match(storage, /localStorage\.getItem/);
assert.match(storage, /localStorage\.setItem/);
assert.doesNotMatch(storage, /supabase|fetch\(/i);

assert.match(app, /role === ROLE\.USER && userEmail/);
assert.match(app, /readPersonalExpenseAlias\(userEmail\)/);
assert.match(app, /const isPersonalExpenseAliasRequired =/);
assert.match(app, /!personalExpenseAlias/);
assert.match(app, /canEditPersonalExpenseAlias=\{role === ROLE\.USER\}/);
assert.match(app, /writePersonalExpenseAlias\(userEmail, alias\)/);

assert.match(modal, /設定個人帳本代號/);
assert.match(modal, /代號只存在此裝置/);
assert.match(modal, /!isRequired/);

assert.match(sidebar, /個人帳本代號/);
assert.match(sidebar, /canEditPersonalExpenseAlias &&/);

assert.match(hook, /: defaultPayerName \|\| userEmail/);
assert.match(screen, /!isUsingSharedExpenseBook && m === defaultPayerName/);

console.log("V3.9.16 USER 個人帳本代號本機儲存、首次必填與修改入口驗證通過。");
