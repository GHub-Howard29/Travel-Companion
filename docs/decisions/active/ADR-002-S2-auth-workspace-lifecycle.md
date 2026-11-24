# ADR-002-S2：登入身份切換、旅程清單 reconciliation 與登出生命週期

> **工作狀態：ACCEPTED／已核准直接實作；尚未開始程式修改。**
>
> 本文件是 S2 實作、逐項驗證與跨對話續行的唯一階段紀錄。新對話應依本文件「實作順序」直接執行，不需重新調查已列出的程式證據，也不得要求使用者再次核准本文件已明確授權的範圍。

- **日期：** 2026-11-24
- **所屬決策：** [ADR-002](ADR-002-card-save-screen-flicker.md)
- **基準分支／Commit：** `develop`／`4d4d31f522129e292913f6c5803d694c34c491e7`
- **調查方式：** 程式碼唯讀檢查；未執行動態測試。

## 1. 目標與問題範圍

修正以下相互關聯的身份生命週期問題：

1. 訪客登入後，旅程清單未自動依新身份重新 reconciliation，常需手動刷新頁面才顯示正確筆數。
2. 登出時舊 Workspace 非同步載入可能因 epoch 失效提前返回，且登出流程未重設 Loading，造成畫面持續顯示「正在建立雲端 safe 連線...」。
3. 登出時沒有完整停止卡片管理與「編輯旅程」的 Lease heartbeat；尤其編輯旅程 heartbeat 位於 App 層，Modal 卸載不會停止它。
4. 登出後仍可能保留舊的 `expenseBookTripId`，使費用簿 hook 以舊識別碼繼續啟動載入流程。

本階段只處理身份切換、Workspace 清單更新、Loading、既有編輯 Lease 生命週期及舊帳本識別清理。不得把它擴大成各功能同步機制重構。

## 2. 已核准的決策與修正邊界

### 2.1 身份與旅程清單

- 使用 Supabase `user.id` 作為身份切換與非同步結果隔離的主要識別值；Email 仍可供既有權限／管理者資料查詢使用，但不得作為唯一身份版本依據。
- 初始 Workspace 載入與 reconciliation 必須隨登入狀態及身份變更重新觸發，包含 guest → signed-in、user A → user B、signed-in → signed-out。
- 每次身份切換都要使舊身份的 Workspace／Trip load 結果失效；舊請求不得回寫新身份的旅程清單、選取旅程、權限或其他身份狀態。
- reconciliation Promise 必須綁定啟動時的身份及 Workspace epoch／generation。新身份不得重用舊身份 Promise；舊 Promise 的 finally 也不得清除新身份正在使用的 Promise。
- 只更新清單及必要的選取狀態；若原選取旅程仍有效，保留現有選取行為。不得重寫 `tripRepository.ts` 的 seed／cloud／local merge 演算法。

### 2.2 登出與既有 Lease

- 登出沿用目前卡片管理、卡片編輯及編輯旅程的 Lease service／RPC／scope，不新增第二套鎖定協定、不改 RPC schema、TTL、owner 判斷或 ADR-001 的鎖定契約。
- 卡片管理退出應重用 `closeManageMode()` 所使用的底層清理動作：停止 heartbeat、釋放卡片 Lease、清除本機 Lease marker、清除未送出的表單／排序／時間調整／複製草稿、退出管理狀態、釋放旅程管理 Lease。
- 日期切換與登出應共用同一套清理核心。若現有 `closeManageMode()` 的「保存中拒絕退出」UI guard 會阻止身份切換，應在已送出的保存 Promise 完成後呼叫共用清理核心；不得為了登出而保留未送出的草稿，也不得略過 Lease 清理。
- 編輯旅程沿用 App 既有 `closeTripEditor()`：停止 App 層 heartbeat、清除 `tripEditorLeaseTripIdRef` 與本機 marker、關閉 Modal、嘗試 Release `__trip__` Lease。不得只依賴 Modal unmount。
- 明確登出時，應在舊 Session 仍有效時先完成已送出保存及 Lease Release 嘗試，再執行 `supabase.auth.signOut()`。先停止 heartbeat，避免 Release 期間仍續租。
- 若因外部 Session 變化、離線或 RPC 失敗而無法在舊 Session 有效時 Release：仍必須停止本機 heartbeat、清除本機持有標記；不得宣稱雲端鎖已立即釋放，雲端依既有 expiry 回收。
- 不改 ADR-001／ADR-002 已接受的卡片保存、CAS、Pending／Recovery、Trip Lease 契約。

### 2.3 草稿與已送出保存的界線

| 身份離開時的狀態 | 定案行為 |
|---|---|
| 尚未送出保存的卡片草稿／表單／排序草稿／時間調整草稿 | 直接丟棄 |
| 已送出且仍在執行的卡片保存 | 等待既有保存 Promise 收斂，再釋放 Lease／清理 |
| 已確認本機保存成功、雲端待同步 | 保留既有正式本機資料及 Pending 狀態；不可把它當作未送出草稿刪除 |
| 已確認雲端保存成功 | 保留 |
| 已送出的編輯旅程更新 | 等待既有提交流程完成或明確失敗，再釋放其 Lease |
| 未送出的編輯旅程表單 | 關閉並丟棄 |

- 卡片保存優先沿用 `itinerarySavePromisesRef`，不得新增另一套保存佇列或改寫卡片同步協定。
- Trip Editor 的 `handleTripEditorSubmit()` 目前等待 `createTrip()`／`updateTrip()`；實作時需讓登出流程可辨識並等待已送出的編輯旅程提交，不可只讀 Modal 內部 `isSaving` 後就卸載。
- 等待只涵蓋已送出的保存／提交，不涵蓋尚未送出的草稿；不得因此無限等待無關背景同步。

### 2.4 Loading、畫面與身份資料

- 明確登出時，完成必要 Lease／已送出保存處理後，必須同步重設舊身份的畫面狀態及 `isLoading=false`，不得等所有非同步本機附件／封面清理完成才解除 Loading。
- 登出清理應使用 `finally`／等效保證完成 UI reset；清理錯誤仍須保留診斷，不可用 Loading spinner 永久遮住已登出畫面。
- 所有非同步 Workspace／Trip load 寫回均須檢查啟動時的身份及 epoch；舊請求不得清除或覆蓋新身份的 Loading／資料。
- 登出時清空 `expenseBookTripId`，避免費用簿載入 effect 在 signed-out 狀態使用舊帳本 ID。
- 既有 `clearSharedTripDataAfterAccessLoss()` 的隱私資料清理仍須執行；調整順序時不可跳過其同步 localStorage 清理及非同步附件／封面清理。

## 3. 已確認的程式證據

以下是 2026-11-24 唯讀檢查確認的現況；行號以基準 commit 為參照，實作時可因前置變更而移動，應以符號名稱定位。

### 3.1 登入清單更新缺口

**`src/hooks/useTripWorkspace.ts`**

- 約 247–286 行：`getSession()` 與 `onAuthStateChange` 更新 `userId`、`userEmail`、`isSessionReady`。現有失效判斷主要涵蓋 `SIGNED_OUT` 或既有 Email 變更；guest → signed-in 沒有明確身份失效。
- 約 311–392 行：`reconcileTripWorkspaceWithResult()` 以單一 `reconciliationPromiseRef.current` 合併呼叫，沒有綁定啟動身份；finally 無條件清空 ref。
- 約 416–466 行：初始 Workspace effect 依賴 `isSessionReady`，沒有依賴 `userId`／登入身份。訪客載入完成後登入，不會因此重新取得完整清單。
- 約 468–673 行：選取旅程載入 effect 有依賴 `userEmail`，會重新查詢該旅程管理權限；這不等於重新 reconciliation 整份 `tripOptions`。
- 約 524 行：舊 Trip load 發現 Workspace epoch 不符時提前 return。

**已確認結論：** guest → signed-in 缺少完整清單 reconciliation 觸發；單一 Promise 沒有身份隔離是額外競態缺口。兩者均有靜態程式證據，但本輪尚未動態重現 Promise 競態。

### 3.2 登出 Loading 缺口

**`src/App.tsx` 約 669–693 行**

- `handleLogout()` 先 invalidate Workspace，再 `signOut()`，接著逐筆等待 `clearSharedTripDataAfterAccessLoss()`，最後才清 React 身份及旅程狀態。
- 沒有呼叫 `setIsLoading(false)`。
- 舊 Trip load 可在 epoch mismatch 提前 return，跳過後續解除 Loading。

**已確認結論：** 登出未重設 Loading，且舊載入流程存在不會走到解除 Loading 的路徑；兩者可共同造成持續 Loading。

### 3.3 卡片管理 Lease

**`src/components/ItineraryPage.tsx`**

- 約 1000–1026 行：`releaseEditingLease()` 會停止卡片 heartbeat、移除 visibility listener、清卡片 Lease ref／本機有效狀態；有卡片 ID 時，需登入且 online 才嘗試 Release RPC。
- 約 1031–1045 行：unmount cleanup 會停止旅程管理 heartbeat、清本機 marker，並嘗試釋放 `__trip__` Lease。
- 約 1047–1061 行：`resetForm()` 會釋放卡片 Lease 並清除未送出的表單草稿。
- 約 1097–1114 行：`closeManageMode()` 保存中會拒絕退出；非保存中則釋放卡片 Lease、reset form/time/order、釋放管理 Lease。
- 約 1146–1151 行：日期切換會呼叫 `closeManageMode()`，但目前沒有等待其完成才切換日期。
- `App.tsx` 約 1680–1686 行：`ItineraryPage` key 含 selectedTripId 與 userEmail；身份改變會 remount，但 unmount 時舊 Session 可能已失效，不能保證 Release RPC 成功。

**已確認結論：** 可沿用現有清理函式；但登出不能只依賴 unmount，也不能直接依賴會因 saving guard 而拒絕退出的 UI handler。

### 3.4 編輯旅程 Lease

**`src/App.tsx`**

- 約 784–789 行：`stopTripEditorLeaseHeartbeat()` 可停止 App 層 interval。
- 約 806–817 行：`closeTripEditor()` 會停止 heartbeat、清除 ref／本機 marker、關閉 Modal、嘗試 Release `__trip__`。
- 約 844–860 行：heartbeat 由 App 層建立與續租。
- 約 914–984 行：`handleTripEditorSubmit()` 會先驗證／renew Lease，再 await `createTrip()` 或 `updateTrip()`，成功後關閉 Modal。
- 約 669–693 行：目前 `handleLogout()` 沒有呼叫 `closeTripEditor()`。

**`src/components/TripEditorModal.tsx`**

- 約 265–266 行有本地 `isSaving`／`isDeleting` 狀態。
- 約 291–295 行 unmount cleanup 只清 Excel recovery timer，沒有停止 App 層 Lease heartbeat。

**已確認結論：** Modal 卸載不會停止 App 層 heartbeat；登出必須明確呼叫 App 層既有關閉／釋放機制。

### 3.5 保存 Promise 與費用簿識別碼

- `src/hooks/useTripWorkspace.ts` 約 974–1211 行：`saveItineraryTripDetail()` 使用 `itinerarySavePromisesRef` 追蹤同 Trip 已送出的保存 Promise；本機正式資料及 Pending 先寫入，之後才進行雲端 Lease／CAS／Save。
- `src/hooks/useTripWorkspace.ts` 約 129 行：`expenseBookTripId` 是獨立 state；約 650–661 行只在 selected Trip load 流程中更新／清空。登出清空 selectedTripId 後，該 effect 會因沒有 selectedTripId 而提前 return，未必清掉舊帳本 ID。
- `src/hooks/useExpenseBook.ts` 約 333–351 行：帳本載入 effect 主要依 `expenseBookTripId` 及頁面狀態判斷；不應讓 signed-out 狀態繼續使用舊識別碼。
- `src/storage/sharedTripDataStorage.ts` 28–74 行：`clearSharedTripDataAfterAccessLoss()` 會同步清除權限／部分共享資料快取，並非同步刪除附件及封面快取；登出不得因重排 UI reset 而跳過此隱私清理。

## 4. 實作順序（已核准，直接執行）

### Step 1 — 建立身份版本與 Workspace 隔離

檔案：`src/hooks/useTripWorkspace.ts`

1. 建立以 `user.id` 為主的身份 ref／generation；初始化 `getSession()` 與 `onAuthStateChange` 必須避免先後競態造成舊 session 覆蓋新 session。
2. guest → signed-in、signed-in → signed-out、user A → user B 均觸發 Workspace invalidation。
3. 初始清單 reconciliation 隨身份變更執行；以 userId／identity generation 作 dependency，不以 Email 作唯一依據。
4. reconciliation Promise 記錄啟動身份與 epoch；只有相同身份／epoch 可共用。finally 僅在 ref 仍指向該 Promise 時清除，舊 Promise 不可清除新 Promise。
5. 每個 async 寫回點檢查身份與 epoch；舊請求不可寫入新身份狀態。
6. 清單更新後，保留仍有效的 selectedTrip；若已失效，沿用既有 default／return Trip 選擇規則。
7. 不修改 `getTripMetas()`、`mergeTripRecords()` 或 seed/cloud/local merge 語意。

### Step 2 — 提供登出可等待的已送出保存結果

檔案：`src/hooks/useTripWorkspace.ts`、`src/App.tsx`、必要時 `src/components/TripEditorModal.tsx`

1. 沿用 `itinerarySavePromisesRef`，提供 App 登出流程可呼叫的最小等待入口，只等待目前 Trip 已送出的卡片保存 Promise。
2. 對 Trip Editor 已送出的 `handleTripEditorSubmit()` 建立可等待的 Promise／ref 或等效生命週期協調；不得只依賴 Modal 的 `isSaving` state。
3. 未送出的卡片／旅程表單草稿不建立 Promise、不等待、不保留。
4. 保存成功或失敗均要讓等待流程正常結束；失敗需保留原本錯誤／Pending／Recovery 語意，不得假裝成功。
5. 不修改卡片 Save RPC、CAS、Pending／Recovery、Trip Editor 更新契約。

### Step 3 — 讓卡片管理與編輯旅程共用登出清理入口

檔案：`src/components/ItineraryPage.tsx`、`src/App.tsx`

1. 為 `ItineraryPage` 提供一個 App 可在登出前等待的 identity-leave／dispose callback；它必須可停止卡片及 managed Trip heartbeat、清本機 marker，並重用 `releaseEditingLease()`、`resetForm()`、`resetTimeAdjustment()`、`resetOrder()`、`releaseManagedTripLease()` 的既有底層動作。
2. 日期切換的 `closeManageMode()` 與身份離開清理應共用底層清理核心；保留一般 UI 操作的 saving guard，但登出路徑在 Step 2 已等待已送出保存後，必須能清除未送出草稿並完成清理。
3. 編輯旅程直接呼叫既有 `closeTripEditor()`；先停止 heartbeat，再嘗試 Release。
4. 明確登出時，先停止／釋放舊身份 Lease，再呼叫 `signOut()`。避免先 signOut 才觸發 component unmount，導致 Release 無法使用舊 Session。
5. 若 Release 失敗或離線，記錄安全診斷並依既有 expiry 回收；本機 marker／heartbeat 必須確實清除。
6. 外部 Session 變化或身份切換不是由本 App logout 發起時，也要立即停止舊身份 heartbeat、清除舊本機持有狀態；只有仍可確認舊 Session 有效時才嘗試 RPC Release。

### Step 4 — 登出 UI／Workspace／費用簿狀態收斂

檔案：`src/App.tsx`、`src/hooks/useTripWorkspace.ts`

1. 防止重複登出流程並建立明確 identity-transition guard，避免清理期間接受舊身份操作。
2. 完成已送出保存等待及 Lease 清理後，呼叫 `signOut()`。
3. 同步重設舊身份 UI：`currentTrip`、`selectedTripId`、`tripOptions`、權限／profile、menu／screen、`expenseBookTripId`、`isLoading=false`。
4. 保留並執行 `clearSharedTripDataAfterAccessLoss()`；不得刪除已確認保存的 itinerary 正式資料或 Pending。
5. 將附件／封面等非同步清理與 UI reset 解耦；無論清理成功或失敗，登出畫面都不能永久 Loading。
6. 透過身份／epoch guard 保證舊 Trip load 的 return／finally 不會把新身份 Loading 或資料覆寫。

## 5. 實作後必須驗證

所有項目均須記錄執行環境、測試資料範圍、操作步驟、預期／實際結果及證據。未執行不得標示 PASS。

| ID | 驗證情境 | 操作 | 通過條件 |
|---|---|---|---|
| S2-01 | Guest → 登入 | 以訪客狀態載入，登入有效帳號，不刷新頁面 | 旅程清單自動 reconciliation，筆數／內容正確 |
| S2-02 | A → B 身份切換 | A 的清單查詢尚未完成時切換 B | A 的結果與 Promise 不污染 B；B 取得自己的清單及權限 |
| S2-03 | 舊 Promise finally 競態 | A reconciliation 尚在執行時啟動 B reconciliation，再讓 A 結束 | A 的 finally 不清除 B 的 Promise；B 可正常完成 |
| S2-04 | 登出時 Trip loading | selected Trip detail／權限查詢期間登出 | Loading 結束；舊資料不再顯示或回寫 |
| S2-05 | 登出時卡片草稿 | 開啟卡片表單、輸入但不保存，直接登出 | 草稿丟棄；卡片 heartbeat 停止；本機 Lease marker 清除；線上時 Release 有結果 |
| S2-06 | 登出時旅程管理模式 | 開啟管理模式／排序／時間調整／複製草稿後登出 | 未送出草稿全部丟棄；managed heartbeat 停止；`__trip__` Lease Release 或明確進入 expiry fallback |
| S2-07 | 登出時編輯旅程 | 開啟編輯旅程 Modal，未提交直接登出 | Modal 草稿丟棄；App 層 heartbeat 停止；marker 清除；Release 有結果 |
| S2-08 | 卡片保存已送出 | 卡片保存 RPC／雲端流程尚未完成時觸發登出 | logout 等待既有 Promise 收斂；成功資料保留，失敗／pending 按既有契約保留，不誤報成功 |
| S2-09 | Trip Editor 更新已送出 | 編輯旅程提交進行中觸發登出 | logout 等待提交結果；不與 Release／signOut 競態；結果正確 |
| S2-10 | 離線登出 | 離線狀態退出管理／登出 | 本機 heartbeat 與 marker 清除；不假稱 RPC Release 成功；雲端 Lease 依 expiry 回收 |
| S2-11 | 費用簿身份隔離 | 登出前載入個人／共同帳本，登出後觀察 | `expenseBookTripId` 清空；不以舊 ID 再啟動 load／Realtime／sync |
| S2-12 | 登出清理延遲／失敗 | 模擬附件或封面清理延遲／失敗 | UI 已完成登出且 Loading 關閉；隱私清理仍有執行與錯誤紀錄 |
| S2-13 | 登出後重新登入 | 登出完成後登入同一帳號及另一帳號 | 旅程清單、選取旅程、權限、帳本及 Lease 狀態皆為新 Session 正確值 |
| S2-14 | 回歸：日期切換退出管理 | 管理模式中切換日期 | 仍沿用共用清理核心，原有退出／Lease 行為不退化 |

### 自動化／靜態驗證

- 為身份切換、Promise generation／finally、Loading stale guard、logout in-flight save 及 Lease cleanup 新增或更新最小 regression tests。
- 執行相關 targeted tests。
- 執行專案規定的 typecheck／lint／build；build 須遵守根目錄 `AGENTS.md` 的 Node 22.23.2 主機辨識與 PATH 規則。
- 執行 `npm run verify:docs-links`、`git diff --check`。
- 需要動態 UI／Supabase 操作時只用隔離 loopback 測試環境與專用測試資料；不得使用 TEST-1 或正式 Supabase。

## 6. 明確不在本次授權範圍

- 不重寫 seed／cloud／local Trip merge 演算法。
- 不改卡片保存 RPC、CAS、version、Pending／Recovery、Checklist、Other Info、費用簿及其他功能的同步協定。
- 不新增草稿保護／草稿持久化機制。
- 不新增 Trip Lease RPC、lease key、TTL 或新的鎖定模型；沿用 ADR-001。
- 不修改 ADR-001 的 Accepted 契約。
- 不因本階段問題重做 ADR-002-S1 的 viewport／scroll、卡片排序跳動或 Preview 拆除工作；它們維持各自原進度。
- 不執行正式 DB／Secrets／Edge Function／部署操作。
- 本文件授權程式修改及必要的隔離測試／驗證；**不包含 Git commit、push、merge、tag 或 deploy**，須依各自明確指令執行。

## 7. 基準狀態與證據限制

- 2026-11-24 唯讀檢查：`develop`，HEAD `4d4d31f522129e292913f6c5803d694c34c491e7`；`origin/develop` 與本機差異 0／0；工作樹乾淨。
- 本輪已讀取 `src/hooks/useTripWorkspace.ts`、`src/App.tsx`、`src/components/ItineraryPage.tsx`、`src/components/TripEditorModal.tsx`、`src/hooks/useExpenseBook.ts`、`src/storage/sharedTripDataStorage.ts`。
- 本輪沒有修改程式／資料庫、沒有執行測試、沒有 commit／push／deploy。
- 已確認的靜態程式缺口與尚未動態重現的競態已分開標示；實作後依 S2-01～S2-14 驗證，不得把靜態推論寫成動態 PASS。

## 8. 跨對話直接續行指示

新對話／新 Agent 必須：

1. 先讀 `docs/decisions/README.md`。
2. 讀 [ADR-002 主檔](ADR-002-card-save-screen-flicker.md) 的 S2 Accepted 範圍，再讀本文件。
3. 依 Step 1 → Step 4 直接實作，並依 S2-01～S2-14 驗收。
4. 不得重新調查本文件第 3 節已列出的現況，也不得再次要求使用者核准已 Accepted 的實作範圍。
5. 若實作時發現文件未涵蓋的重大安全風險、與 ADR-001 衝突或不可避免的範圍變更，才暫停受影響部分並記錄具體證據；其餘工作繼續。
6. 每完成一個可驗證切片，更新本文件的實際變更／測試證據與狀態，再同步更新 `docs/decisions/README.md`。