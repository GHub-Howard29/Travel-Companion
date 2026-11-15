import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/App.tsx", "utf8");
const expenseScreen = readFileSync("src/components/expense/ExpenseScreen.tsx", "utf8");
const expenseBookHook = readFileSync("src/hooks/useExpenseBook.ts", "utf8");
const expenseRealtime = readFileSync("src/utils/expenseRealtimeLifecycle.ts", "utf8");
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
  /catch \(error\) \{[\s\S]*Initial cloud workspace load failed; using cached trip data[\s\S]*if \(!navigator\.onLine\) setIsOnline\(false\)[\s\S]*await loadStoredWorkspace\(\)/,
  "雲端啟動失敗時必須保留瀏覽器實際連線狀態，並回退已載入的本機行程",
);
assert.match(
  tripWorkspace,
  /connectivityRecoveryPendingRef = useRef\(startsOffline\)/,
  "離線與雲端同步恢復需求必須獨立於 React state 保存，避免 online 事件造成狀態更新競態",
);
assert.doesNotMatch(
  tripWorkspace,
  /auth\/v1\/health|connectivityHealthUrl|probeConnectivity|setInterval\(/,
  "正常在線時不可執行 Auth Health 常態探測或固定輪詢",
);
assert.match(
  tripWorkspace,
  /const reconcileTripWorkspaceWithResult = useCallback[\s\S]*completed: false[\s\S]*completed: true, selectedTripWasRemoved/,
  "Trip reconciliation 必須明確區分是否完成與選取的 Trip 是否被移除",
);
const tripRecoveryLifecycle = readFileSync("src/utils/tripWorkspaceRecoveryLifecycle.ts", "utf8");
assert.match(
  tripWorkspace,
  /startTripWorkspaceRecoveryLifecycle\(\{[\s\S]*isSessionReady: \(\) => isSessionReady[\s\S]*isOnline: \(\) => navigator\.onLine[\s\S]*reconcile: reconcileTripWorkspaceWithResult[\s\S]*initiallyPending: connectivityRecoveryPendingRef\.current[\s\S]*onPendingChange:[\s\S]*connectivityRecoveryPendingRef\.current = pending/,
  "Trip workspace 必須將 Session Ready、連線狀態、reconciliation 與唯一 pending ref 注入 recovery lifecycle",
);
assert.match(
  tripRecoveryLifecycle,
  /!recoveryPending[\s\S]*!isSessionReady\(\)[\s\S]*!isOnline\(\)[\s\S]*inFlight/,
  "recovery 必須有 pending、Session Ready、online 與 in-flight 四道執行條件",
);
assert.match(
  tripRecoveryLifecycle,
  /!result\.completed \|\| !isOnline\(\)/,
  "只有 reconciliation 完成且仍在線時才可結束 recovery pending",
);
assert.match(
  tripRecoveryLifecycle,
  /windowTarget\.addEventListener\("online",[\s\S]*windowTarget\.addEventListener\("offline",[\s\S]*windowTarget\.addEventListener\("focus",[\s\S]*documentTarget\.addEventListener\("visibilitychange"/,
  "recovery 必須監聽 online/offline/focus/visibilitychange",
);
assert.match(
  tripRecoveryLifecycle,
  /removeEventListener\("online",[\s\S]*removeEventListener\("offline",[\s\S]*removeEventListener\("focus",[\s\S]*removeEventListener\("visibilitychange"/,
  "recovery lifecycle stop 必須移除所有事件監聽",
);
assert.match(
  tripWorkspace,
  /await reconcileTripWorkspace\(\)/,
  "Session Ready 後仍必須保留必要的 Trip 初始雲端載入",
);

assert.match(
  app,
  /isExpenseBookPageActive:[\s\S]*resolveTravelToolType\([\s\S]*\) === "expense"/,
  "共享帳本頁面判斷必須沿用目前的 travel tool type resolver",
);
assert.match(
  expenseBookHook,
  /isUsingSharedExpenseBook && !isExpenseBookPageActive/,
  "共享帳本離開帳本頁面時不可執行初始雲端載入",
);
assert.match(
  expenseBookHook,
  /!isExpenseBookPageActive[\s\S]*!userEmail/,
  "共享帳本 Realtime 與同步事件監聽只可在帳本頁面啟用",
);
assert.match(
  expenseBookHook,
  /startExpenseRealtimeLifecycle\(/,
  "共享帳本必須使用可測試的 Realtime lifecycle",
);
assert.doesNotMatch(
  expenseRealtime,
  /setInterval\([^)]*30_000/,
  "共享帳本不可再固定每 30 秒刷新",
);
assert.match(
  expenseRealtime,
  /\.subscribe\(\(status\) => \{[\s\S]*status === "SUBSCRIBED"[\s\S]*hasSubscribed \|\| needsRefreshAfterConnection\)[\s\S]*status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT"/,
  "Realtime 重新連線成功後必須補讀共享帳本",
);

console.log("狀態保留、離線啟動、共享帳本頁面同步與無常態 Health 輪詢回歸驗證通過。");
