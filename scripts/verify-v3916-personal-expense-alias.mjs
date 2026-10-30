import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const sidebar = fs.readFileSync("src/components/layout/AppSidebar.tsx", "utf8");
const modal = fs.readFileSync("src/components/PersonalExpenseAliasModal.tsx", "utf8");
const storage = fs.readFileSync("src/storage/personalExpenseAliasStorage.ts", "utf8");
const hook = fs.readFileSync("src/hooks/useExpenseBook.ts", "utf8");
const workspace = fs.readFileSync("src/hooks/useTripWorkspace.ts", "utf8");
const participants = fs.readFileSync("src/utils/participantUtils.ts", "utf8");
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

// Shared expense recorder identity must use the union of metadata and hydrated
// Trip detail maps; an empty metadata object must not mask the authorized map.
assert.match(participants, /export const mergeParticipantEmailMaps/);
assert.match(participants, /Object\.entries\(map \?\? \{\}\)/);
assert.match(participants, /merged\.set\(normalizedParticipant, normalizedEmail\)/);
assert.match(
  workspace,
  /const participantEmailMap = mergeParticipantEmailMaps\([\s\S]*selectedTripMeta\?\.participantEmailMap,[\s\S]*currentTrip\?\.content\.participantEmailMap/,
);

const { mergeParticipantEmailMaps, getExpenseRecorderAlias } = await import(
  "../src/utils/participantUtils.ts"
);
const detailMap = {
  Howard: "howard@example.com",
  Carol: "carol@example.com",
};
const resolvedMap = mergeParticipantEmailMaps({}, detailMap);
assert.equal(
  getExpenseRecorderAlias("HOWARD@example.com", "Carol", resolvedMap),
  "Howard",
  "Howard 建立、Carol 付款時，紀錄者必須仍顯示 Howard",
);
assert.deepEqual(
  mergeParticipantEmailMaps({ Howard: "old@example.com" }, detailMap),
  detailMap,
  "同名參與者以較後載入的 current Trip detail 對照為準",
);
assert.equal(
  getExpenseRecorderAlias("unknown@example.com", "Carol", resolvedMap),
  "未設定代號",
  "無法辨識的新紀錄者不可錯誤回推成付款人",
);
assert.equal(
  getExpenseRecorderAlias(null, "Carol", resolvedMap),
  "Carol",
  "僅對舊版沒有 recorded_by_email 的歷史帳目保留相容行為",
);

console.log("V3.9.16 個人帳本代號與共用帳本紀錄者 Email 對照回歸驗證通過。");
