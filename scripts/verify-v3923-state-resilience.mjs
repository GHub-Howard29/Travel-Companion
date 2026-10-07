import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/App.tsx", "utf8");
const expenseScreen = readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");
const privateChecklistHook = readFileSync("src/hooks/usePrivateChecklistState.ts", "utf8");
const tripWorkspace = readFileSync("src/hooks/useTripWorkspace.ts", "utf8");

const applyTripDefaultsBody =
  app.match(/const applyTripDefaults = useCallback\(\(trip: TripMeta\) => \{([\s\S]*?)\n  \}, \[/)?.[1] ?? "";

assert.doesNotMatch(
  applyTripDefaultsBody,
  /setNewPayer/,
  "重新整理行程預設值不可覆蓋使用者已手動選擇的付款人",
);
assert.match(
  app,
  /const payerDefaultScopeRef = useRef\(""/,
  "付款人預設值必須以帳本 scope 為初始化邊界",
);
assert.match(
  app,
  /currentPayer && effectiveExpenseMembers\.includes\(currentPayer\)[\s\S]*currentPayer[\s\S]*fallbackPayer/,
  "同一帳本 scope 內必須保留仍有效的手動付款人選擇",
);

assert.match(
  privateChecklistHook,
  /const scheduleRealtimeRefresh = useCallback\(\(\) => \{[\s\S]*syncLatestChecklist\(\)/,
  "私人清單 Realtime refresh 必須走 pending-aware 同步流程",
);
assert.doesNotMatch(
  privateChecklistHook,
  /reloadPrivateChecklistFromCloud/,
  "私人清單不可再用 raw cloud snapshot 覆蓋本機 pending 狀態",
);

const numericInputMatches = expenseScreen.match(/inputMode="numeric"/g) ?? [];
assert.equal(
  numericInputMatches.length,
  2,
  "新增與編輯金額欄位都必須使用穩定的手機數字鍵盤輸入模式",
);
assert.match(
  expenseScreen,
  /setNewAmount\(e\.target\.value\.replace\(\/\\D\/g, ""\)\)/,
  "新增金額必須以文字輸入保存完整多位數字",
);
assert.match(
  expenseScreen,
  /amount: e\.target\.value\.replace\(\/\\D\/g, ""\)/,
  "編輯金額必須以文字輸入保存完整多位數字",
);

assert.match(
  tripWorkspace,
  /const startsOffline = !navigator\.onLine;[\s\S]*useState\(startsOffline\)/,
  "PWA 冷啟動若一開始就離線，不可等待 Supabase session 才開始載入本機資料",
);
assert.match(
  tripWorkspace,
  /startsOffline \? readLastAuthenticatedEmail\(\) : null/,
  "離線冷啟動應沿用最後一次已驗證的登入 Email，讓私人本機資料仍可辨識使用者",
);
assert.match(
  tripWorkspace,
  /rememberAuthenticatedEmail\(session\.user\.email\)/,
  "正常登入 session 必須保存最後已驗證 Email，供未來離線冷啟動使用",
);
assert.match(
  tripWorkspace,
  /const loadStoredWorkspace = async \(\) => \{[\s\S]*readStoredTripRecords\(\)[\s\S]*storedRecords\.length > 0[\s\S]*sortTripsByDateDesc/,
  "離線冷啟動必須優先直接讀本機行程，不可先依賴任何 fetch",
);
assert.match(
  tripWorkspace,
  /: await getTripMetas\(supabase, getBasePath\(\), \[\]\)/,
  "只有本機完全沒有已存行程時，才可回退靜態快取行程清單",
);
assert.match(
  tripWorkspace,
  /catch \(error\) \{[\s\S]*Initial cloud workspace load failed; using cached trip data[\s\S]*setIsOnline\(false\)[\s\S]*await loadStoredWorkspace\(\)/,
  "雲端啟動失敗時必須回退已載入的本機行程，不可直接結束成空白狀態",
);

console.log("V3.9.23 狀態保留、私人清單同步、金額輸入與離線啟動回歸驗證通過。");
