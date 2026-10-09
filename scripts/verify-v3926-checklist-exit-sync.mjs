import { readFile } from "node:fs/promises";

const source = await readFile("src/components/ChecklistPage.tsx", "utf8");

const requiredPatterns = [
  ["退出同步入口", /const exitManageMode = async \(closeUi = true\)/],
  ["退出入口先等待同步", /await syncOnManageExit\(\);\s+if \(!closeUi\) return;/],
  ["管理按鈕使用統一退出入口", /const closeManageMode = \(\) => \{\s+void exitManageMode\(true\);/],
  ["元件卸載使用統一退出入口", /void syncOnManageExitRef\.current\?\.\(\);/],
  ["同步進行中可被退出流程等待", /if \(cloudOrderSyncPromiseRef\.current\) \{\s+await cloudOrderSyncPromiseRef\.current;/],
  ["保留元件隱藏時的背景同步", /if \(document\.visibilityState === "hidden"\) \{\s+void flushPendingCloudOrder\(\);/],
];

const failures = requiredPatterns
  .filter(([, pattern]) => !pattern.test(source))
  .map(([label]) => label);

if (failures.length > 0) {
  throw new Error(`共同清單退出同步驗證失敗：${failures.join("、")}`);
}

const managementButtonUsesUnifiedExit =
  (source.match(/onClick=\{closeManageMode\}/g) ?? []).length >= 2;
if (!managementButtonUsesUnifiedExit) {
  throw new Error("共同清單退出同步驗證失敗：管理面板關閉按鈕未全部使用統一退出入口");
}

console.log("V3.9.26 共同清單退出管理同步驗證通過");
