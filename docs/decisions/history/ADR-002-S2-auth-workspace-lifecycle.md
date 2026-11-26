> **歸檔註記（2026-11-26）：** S2 執行紀錄已完成並移至 `docs/decisions/history/ADR-002-S2-auth-workspace-lifecycle.md`。S2 Step 1–4 實作完成；S2-01～14 全部 PASS，整體 Exit PASS（2026-11-25）。本記錄完整保留逐項驗收、歷史 PENDING／BLOCKED 輪次與 Exit 證據；不再有 S2 待續行項目，也不得重跑已 PASS 案例。ADR-002 的 Accepted 決策仍持續有效。

# ADR-002-S2：登入身份切換、旅程清單 reconciliation 與登出生命週期

> **工作狀態：ACCEPTED／Step 1–4 第一輪程式實作完成；S2-01～14 依各自驗收證據與 2026-11-25 校正後邊界判定：S2-01～14 全部 PASS。S2-10 不要求離線 Auth signOut；S2-13 不要求直接讀取 React hook 內部 state，費用簿行為證據沿用 S2-11。S2 整體 Exit 狀態仍須依階段總結條件確認。**
>
> 本文件是 S2 實作、逐項驗證與跨對話續行的唯一階段紀錄。實作順序供尚未完成的 Step 執行；Step 1–4 第一輪實作及 S2-01～14 逐項驗收現已完成。新對話應以第 9.4 節現行總表與文件末端最新紀錄確認狀態，直接處理整體 Exit 總結及尚缺的必要證據；不得依較早輪次的歷史 PENDING／BLOCKED 指示重跑已完成案例，也不得要求使用者再次核准本文件已明確授權的範圍。

- **日期：** 2026-11-24
- **所屬決策：** [ADR-002](../active/ADR-002-card-save-screen-flicker.md)
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
| S2-10 | 離線退出管理／Lease expiry fallback | 管理模式持有 Lease 時切換離線，觀察本機管理狀態與續租停止；再由另一個有效 Session 透過 App UI 接管 | 本機 heartbeat 停止且 Lease marker／管理狀態清除；無法 RPC Release 時不假稱立即釋放；雲端 Lease 依既有 expiry 回收；expiry 後另一 Session 可正常接管。**不要求離線時執行 Auth signOut**（正式離線 UI 沒有登出入口） |
| S2-11 | 費用簿身份隔離 | 登出前載入個人／共同帳本，登出後觀察 | `expenseBookTripId` 清空；不以舊 ID 再啟動 load／Realtime／sync |
| S2-12 | 登出清理延遲／失敗 | 模擬附件或封面清理延遲／失敗 | UI 已完成登出且 Loading 關閉；隱私清理仍有執行與錯誤紀錄 |
| S2-13 | 登出後重新登入 | 登出完成後以同一帳號重新登入，並驗證既有 A／B 不同身份切換結果 | 旅程清單、選取旅程、權限、帳本可觀察行為及 Lease 狀態皆屬新 Session；不得殘留前一身份資料或操作權。驗證以 App／Auth／Workspace／帳本行為及既有 S2-11 hook lifecycle 證據為準；不要求直接讀取特定 React hook 內部 state，也不新增測試 seam。 |
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
2. 讀 [ADR-002 主檔](../active/ADR-002-card-save-screen-flicker.md) 的 S2 Accepted 範圍，再讀本文件。
3. Step 1–4 已完成第一輪實作；本文件後續第 9 節紀錄已完成 S2-01～S2-14 逐項驗收。接續工作不得重跑已 PASS 案例；目前依第 9.4 節確認整體 Exit 條件與工程驗證證據，僅補做尚未取得有效證據的必要檢查。
4. 不得重新調查本文件第 3 節已列出的現況，也不得再次要求使用者核准已 Accepted 的實作範圍。
5. 若實作時發現文件未涵蓋的重大安全風險、與 ADR-001 衝突或不可避免的範圍變更，才暫停受影響部分並記錄具體證據；其餘工作繼續。
6. 每完成一個可驗證切片，更新本文件的實際變更／測試證據與狀態，再同步更新 `docs/decisions/README.md`。

## 9. 2026-11-25 第一輪實作紀錄

### 9.1 實作內容

**Step 1 — 身份版本與 Workspace 隔離：已完成第一輪實作**

- `useTripWorkspace.ts` 改以 Supabase `user.id` 作為身份切換判斷；`userIdRef` 同步保存目前身份。
- `onAuthStateChange` 與 `getSession()` 加入事件先後保護，避免較晚回傳的初始 session 覆蓋已收到的新身份事件。
- guest → signed-in、signed-in → signed-out、user A → user B 都會 invalidate workspace epoch，清除舊身份的畫面資料、旅程清單及權限狀態。
- 初始 workspace 載入與 reconciliation 依 `userId` 重新觸發；Trip detail 載入在新身份清單尚未完成前不會讀取舊 selected Trip。
- reconciliation Promise 記錄 `userId + epoch + promise`；只共用相同身份／epoch 的 Promise，finally 只在 ref 仍指向自身 Promise 時清除。
- 初始 Workspace、Trip detail、管理者 Email／Profile 非同步回寫增加 epoch／身份檢查。
- 未修改 `getTripMetas()`、Trip merge 或 seed/cloud/local merge 語意。

**Step 2 — 已送出保存等待：已完成第一輪實作**

- `waitForPendingItinerarySaves()` 沿用既有 `itinerarySavePromisesRef`，只等待已登記的卡片保存 Promise。
- `handleTripEditorSubmit()` 將已送出的提交 Promise 登記在 App 層 ref，登出可等待其完成或失敗。
- 登出開始後阻擋新的 Trip Editor 提交與卡片保存入口；未送出的草稿不建立等待工作。
- 未修改卡片 Save RPC、CAS、Pending／Recovery 或 Trip Editor 更新契約。

**Step 3 — Lease 清理共用入口：已完成第一輪實作**

- `ItineraryPage` 提供 App 可呼叫的 identity-leave callback。
- 新增 `cleanupManagementSession()` 作為共用清理核心；一般 `closeManageMode()` 保留原本保存中拒絕退出的 guard，身份離開路徑在已等待保存後直接使用相同核心。
- 共用核心沿用既有卡片 Lease release、表單／排序／時間調整／複製草稿清除、managed Trip Lease release。
- App 明確登出先等待保存、呼叫 ItineraryPage 清理、呼叫既有 `closeTripEditor()` 停止 App heartbeat 並嘗試釋放 `__trip__`，最後才 `signOut()`。
- 外部身份變更時也會停止 App 層 Trip Editor heartbeat 並呼叫既有 Lease 清理；若舊 Session 已不可用，保留既有 expiry fallback，不宣稱雲端 Lease 已立即釋放。

**Step 4 — UI／Workspace／費用簿收斂：已完成第一輪實作**

- `logoutInProgressRef` 防止重複登出並阻擋清理期間的新保存／提交。
- 登出完成舊身份保存與 Lease 處理後才執行 `signOut()`。
- 清空 Trip、selected Trip、Trip options、profile／權限、`expenseBookTripId`、menu／screen，並在成功及 finally 路徑設定 `isLoading=false`。`expenseBookTripId` 是產品實作需清空的內部 state；其驗收不要求測試工具直接讀取該 hook state，應以登出後無舊 ID load／Realtime／sync 等行為證據判斷，並可沿用 S2-11 已完成的實際 hook lifecycle 測試。
- 既有 `clearSharedTripDataAfterAccessLoss()` 仍會逐筆執行；附件／封面清理 Promise 不再阻擋 UI reset，錯誤保留 console 診斷。
- 已確認本機保存成功但雲端待同步的正式資料與 Pending 不會被登出草稿清理流程刪除。

### 9.2 變更檔案

- `src/hooks/useTripWorkspace.ts`
- `src/App.tsx`
- `src/components/ItineraryPage.tsx`
- `scripts/verify-adr002-s2-auth-workspace-lifecycle.mjs`（新增）
- `scripts/verify-v31012-itinerary-sync.mjs`（修正既有靜態斷言，使其符合目前 Trip-level Lease 呼叫方式；未變更產品行為）
- `scripts/verify-v3922-time-preview.mjs`（修正既有保存結果斷言，使其符合目前 localSaved／cloudSynced 回傳契約；未變更產品行為）
- `package.json`（新增 `verify:adr002-s2-auth-workspace-lifecycle` script）

### 9.3 已執行驗證

| 檢查 | 結果 | 證據／範圍 |
|---|---|---|
| `npm run verify:adr002-s2-auth-workspace-lifecycle` | PASS | 身份事件競態、userId／epoch Promise 隔離、finally ownership、保存等待、登出順序、Lease 清理入口及費用簿清空的靜態 regression guard |
| `npm exec tsc -- -p tsconfig.app.json --noEmit` | PASS | Node 22.23.2／npm 10.9.8 |
| targeted ESLint | PASS | `App.tsx`、`useTripWorkspace.ts`、`ItineraryPage.tsx`、新增 verifier |
| `npm run lint` | PASS | 全專案 ESLint，exit code 0，0 errors／0 warnings；包含本輪新增測試腳本 |
| `npm run test:trip-workspace-recovery-lifecycle` | PASS | 既有 Session Ready、offline guard、event trigger、in-flight deduplication、failure retention、success clearing、cleanup regression |
| `npm run test:p0-pending-autosync-idempotency` | PASS | 既有 Pending auto-sync idempotency regression |
| `npm run build` | PASS | 完整 verify chain、前端／Node TypeScript、production Vite build、PWA precache、browser security 與 weather bundle 驗證；job `job-1795539209045-ru34c0` exit code 0 |
| `node scripts/adr002-s2-local-fixture.mjs prepare / verify / cleanup` | PASS | 一次性建立兩個合成 Auth 使用者、兩筆 trip_editor 權限及一筆私有 Trip；verify 確認不同 userId／access token／refresh token、兩者皆可讀取私有 Trip，且正式 `getCloudTripRecordsStrict`／`getTripMetas` 均包含該 Trip。cleanup 後 Auth／Trip／admin_users／Lease／tombstone 筆數回到基準，六張同步資料表內容摘要完全一致，`local_last_changed_at` 還原；僅保留單調遞增的本機 `app_data_revision` |
| `scripts/adr002-s2-hook-lifecycle-test.html` | PASS | 以 deferred mock Supabase 驅動實際 `useTripWorkspace` hook；10 項斷言覆蓋 Guest→登入、A→B、舊 A response 隔離、舊 finally ownership、B Trip Editor 權限，以及登出期間延遲權限結果不回寫、loading 收斂 |
| `node --check scripts/adr002-s2-local-fixture.mjs` | PASS | fixture 建立／驗證／清理腳本語法 |
| `npm run verify:docs-links` | PASS | 156 份 Markdown、378 個本地目標 |
| `git diff --check` | PASS | 無 whitespace／patch 格式錯誤 |

完整 build 首次執行時發現兩個既有靜態 verifier 與目前原始碼契約不一致：V3.10.12 將 Trip-level Lease guard 誤寫成 card-id 參數；V3.9.22 time-preview 仍檢查已不存在的 `localSaved` 變數。已只修正兩個 verifier 的斷言以符合現行程式契約，沒有改動相應產品行為；兩個專項 verifier 及完整 build 後續均 PASS。

### 9.4 動態驗收狀態與限制

| ID | 動態驗收狀態 |
|---|---|
| S2-01 Guest → 登入清單自動更新 | PASS（hook-level）— Guest → SIGNED_IN 後不重載頁面，Trip list 自動出現登入者可見資料；實際 repository 亦以真實本機 Auth Session 驗證 |
| S2-02 A → B 身份切換 | PASS（hook-level／service）— A 舊 response 不寫入 B workspace；B 取得自己的 Trip list 與 trip_editor 權限；兩個真實本機 Auth Session 的 RLS／repository 驗證 PASS |
| S2-03 舊 Promise finally 競態 | PASS（hook-level）— A 舊 Promise finally 不會清除 B 尚在執行的 reconciliation Promise ownership；重複呼叫仍 dedupe |
| S2-04 登出時 Trip loading | PASS（hook-level）— Trip Editor permission query 延遲期間 SIGNED_OUT，晚到的 B 權限結果不回寫；currentTrip／permission／expenseBookTripId 清空且 loading 收斂 |
| S2-05 卡片未送出草稿／Lease 清理 | PASS（App UI／DB）— 新卡草稿取消與未送出登出清理；既有卡片編輯表單 Lease heartbeat／取消及整體登出 Release 均取得動態證據 |
| S2-06 管理／排序／時間／複製草稿清理 | PASS（App UI／DB）— 管理 Lease、時間調整模式登出清理、排序草稿拖曳後取消；未包含儲存順序 |
| S2-07 Trip Editor Modal／heartbeat | PASS（App UI／DB）— Trip Editor Modal heartbeat 與未提交登出清理 |
| S2-08 已送出卡片保存等待 | PASS（App UI／DB）— 卡片保存 RPC in-flight 期間登出等待；成功分支雲端保存完成，失敗分支 Pending 保留且未誤報同步成功，Lease 歸零 |
| S2-09 已送出 Trip Editor submit 等待 | PASS（App UI／DB）— Trip Editor metadata PATCH in-flight 時登出等待 submit Promise；放行後更新成功、卡片數與 itinerary version 保持不變，Modal 關閉、signOut 完成、Lease 歸零 |
| S2-10 離線退出管理／Lease expiry fallback | PASS — 第四輪已證實離線退出管理、停止續租、45 秒 TTL expiry，及另一有效 Session 透過 App UI 接管；Auth signOut 不屬此案例要求 |
| S2-11 費用簿舊 ID 隔離 | **PASS（App UI／Auth／實際 hook）** — 第五輪 7 項 `useExpenseBook` lifecycle assertions 全部通過：舊 Trip ID 查詢不增加、Realtime channel 移除、hook state 清空且無延遲 Load 重用舊 ID；`test:expense-realtime-lifecycle` 亦 PASS。 |
| S2-12 附件清理延遲／失敗 | **PASS（App UI／Runtime）** — 第五輪注入一次性 900ms 延遲後 rejection；確認清理 probe started／failed、manifest／身份快取清除、Auth token=null、Trip cache=[]、Loading indicators=0。 |
| S2-13 登出後重新登入／身份隔離 | **PASS（App UI／Auth／Workspace；第六輪）** — 同帳號 logout→relogin、A→B 不同帳號切換、Auth 身份、Trip selection、permission、個人帳本代號及 Lease 均有證據；費用簿舊 ID 行為沿用 S2-11 專項 hook 證據，不要求直接讀取 S2-13 當輪的 React hook 內部 state。 |
| S2-14 日期切換退出管理回歸 | **PASS（App UI／DB；第六輪）** — 原始 A/B Fixture 的 D1→D2、D2→D1 均在切換後退出管理並釋放 Lease；空白 D2 可進入管理，A/B Lease 互斥及接管亦已驗證。 |

- S2-01～04 的 PASS 是實際 `useTripWorkspace` hook 動態測試與真實本機 Auth／repository service 測試；hook 測試以 deferred mock Supabase 控制請求順序，不等於完整 App UI／正式資料庫端到端驗收。
- App-level logout coordinator 的保存等待／Lease Release、卡片草稿與 Modal heartbeat 由 S2-05～09 覆蓋；S2-05～09 均已取得 App UI／DB 動態證據。S2-10 離線管理退出與 Lease expiry fallback 已由第四輪 App UI／DB 動態驗收 PASS；不得以 hook-level logout 結果替代。
- fixture 使用全新 UUID 與 loopback Supabase；該輪測試後已刪除兩個合成 Auth 使用者、兩筆角色、專用 Trip 及其 tombstone，並確認六張同步資料表與 local change clock 回到當時測試前基準。沒有操作既有帳號／旅程。
- 該輪未連線正式 Supabase、未使用 TEST-1、未執行 migration／正式資料庫修復／部署；歷史狀態以該輪紀錄為準。
- 該輪未 commit／push；其後驗收進度見本文件後續日期紀錄，勿將此輪的下一步視為目前待辦。

**該輪當時下一步（歷史）：** 接續 S2-05～07；此項已由後續輪次完成，現行狀態以本節 9.4 總表及文件末端最新校正為準。


## 2026-11-25：交接續行與 S2 動態驗收環境確認

### 執行環境與範圍確認
- 以本機公司主機 `TPEPC-TM7503-01` 恢復 `D:\\Project\\Travel-Companion`；分支維持 `develop`，起始 HEAD `1af9dc65aa33136a47b7ecf7abb9a0a1bdee3470`，未提交工作樹僅包含本階段既有程式／文件變更。未 commit／push／deploy。
- 已啟動本機 Vite dev server（`http://127.0.0.1:5173/Travel-Companion/`，Vite 8.0.16）及透過受控 Chrome CDP 讀取畫面；本機 Supabase loopback API `127.0.0.1:54321` 與 Postgres `127.0.0.1:54322` 正常。未連線正式 Supabase、未使用 TEST-1。
- 目前受控頁面是全新 guest preview session；正式部署版分頁不作為本次未提交程式的測試目標。
- 本機資料庫唯讀盤點：Auth 共 6 個既有使用者；目前 `adr002-clean-08e5e77e@example.invalid` 有 `super_admin` 角色但無已記錄密碼；`adr002-test-20261122@example.invalid` 沒有 `admin_users` 角色；既有 `weather-rc-test*`、`v391-admin`、`test-1` 均不作為本階段測試帳號。現有 Trips 僅看到「測試用-1」「測試用-2」，不是本階段可直接使用的隔離編輯 fixture。
- 登入 Modal 的本機測試登入只接受帳密；建立帳號路徑使用 Supabase Auth signUp，不能為既有帳號重設密碼。以已存在的測試 email 嘗試建立帳號只回傳既存帳號錯誤，沒有建立或變更資料。未猜測密碼、未重設任何既有帳號、未調整 `admin_users` 或 Trip 權限。
- 曾有的獨立 Chrome debugging endpoint `127.0.0.1:9222` 本輪不可連線；Open Browser Use CDP 對目前新開 localhost 測試分頁可用。

### 本輪動態／自動化驗證
| 檢查 | 結果 | 證據／限制 |
|---|---|---|
| `npm run test:trip-workspace-recovery-lifecycle` | PASS（本輪重跑） | exit code 0；動態驗證 Session Ready gate、離線保護、event trigger、in-flight deduplication、失敗保留、完成清除及 listener cleanup。此測試是 recovery lifecycle，不等於 S2 identity reconciliation 驗收。 |
| 本機 Vite App 載入與 DOM 讀取 | PASS（環境可用） | CDP 確認 v3.11.5 guest preview 畫面完成載入，能讀取登入 Modal／DOM；尚未建立有效登入 Session。 |
| S2-01～S2-14 | 仍為 PENDING／部分執行條件 BLOCKED | 本輪沒有任何一項 S2 動態驗收取得足以標示 PASS 的證據。 |
| 既有 S2 靜態 verifier、typecheck、全專案 ESLint、P0 idempotency、完整 build、文件連結及 diff-check | 沿用前輪既有 PASS | 依索引與 9.3 紀錄，不重跑已完成切片。 |

### 測試方法判定與阻塞
- `verify-adr002-s2-auth-workspace-lifecycle.mjs` 是原始碼結構／順序的靜態 guard，不能證明 Promise 競態、登出等待、heartbeat 停止或 Lease Release 的執行結果。
- `test-trip-workspace-recovery-lifecycle.mjs` 使用 fake event target 與 deferred Promise，能驗證 recovery lifecycle 的動態行為；它沒有載入／驅動 `useTripWorkspace`，不能代表 S2-01／02／03。
- 既有 `test-adr001-dual-auth-session-local.mjs` 具備 loopback URL 固定檢查、唯一合成 Auth 使用者／Trip、不同 Session token 驗證及 finally cleanup；但其內容是 ADR-001 Lease／CAS，不能直接作為 S2 行為測試，也未在本輪執行。
- `useTripWorkspace` reconciliation 目前位於 React hook 私有 callback 與 refs 中，沒有可獨立注入 Supabase／延遲請求的公開純函式入口。若不增加 hook 測試驅動或抽離新的測試 seam，無法只用現有 mock 測試實際的 userId／epoch Promise race；本輪不為測試便利擴張產品架構。
- 動態 UI／Lease 驗收需要一次性 loopback identity、專用 Trip access／fixture、可控兩個 Session 及保存／提交延遲注入。現有本機資料沒有可直接使用且可由本階段 test account 編輯的專用 fixture；歷史帳號與既有 Trips 不得挪用。新增的 fixture provisioning 仍須遵循先前 ADR-002 記錄的明確隔離與 cleanup 邊界，不能以擴權既有帳號或直接修改其密碼代替。
- 因此本輪不執行資料庫建立／刪除／角色授權、不操作任何現有旅程、不宣稱雲端 Lease release 或 S2 Exit PASS。後續若提供合適測試 fixture provisioning 路徑，應使用全新 UUID 資料、測試前後數量／ownership 基準核對及 finally cleanup，並將 UI 行為證據逐項記錄。

### 當輪下一步（歷史基線；後續已完成）
1. 準備一個可自動建立及完整清理的 loopback-only S2 test fixture，提供兩個不同 Auth Session、專用 trip_editor 權限及唯一測試 Trip；不得沿用上述既有帳號／旅程。
2. 建立最小可驅動實際 hook／App 行為的測試入口（不是 source regex），以 deferred query／save／submit Promise 逐項驗 S2-01～04、08～09、11～13；若需新增可注入 seam，先維持最小範圍並不得改變正式產品行為。
3. 使用受控 localhost UI 與上述 fixture 完成 S2-05～07、10、14 的 heartbeat／Lease／草稿／日期切換案例；明確區分 Release 成功與 offline expiry fallback。
4. 每個案例只有取得實際動態觀察證據後才由 PENDING 轉 PASS；完成前維持 S2 非 Exit PASS。

## 2026-11-25：S2-01～04 隔離動態驗證完成

### 可重複測試入口
- 新增 `scripts/adr002-s2-local-fixture.mjs`，命令為：
  - `node scripts/adr002-s2-local-fixture.mjs prepare`
  - `node scripts/adr002-s2-local-fixture.mjs verify`
  - `node scripts/adr002-s2-local-fixture.mjs cleanup`
- Fixture 僅允許 `http://127.0.0.1:54321` loopback Supabase；使用全新 UUID 建立兩個 email-confirmed 合成 Auth 使用者、兩筆 `trip_editor` 角色及一筆 private Trip。manifest／一次性密碼只存於 OS temp，不寫入 repository。
- Cleanup 僅按 manifest 中的 fixture UUID 刪除 Lease、Trip version、Trip、該 Trip tombstone、角色及兩個合成 Auth 使用者。清理前後核對 Auth／Trip／admin_users／Lease／tombstone 筆數；另比較六張同步資料表完整 row digest，只有完全回到基準時才還原 `tc_testdata.sync_state.local_last_changed_at`。不回退單調遞增的 `app_data_revision`。
- 新增 `scripts/adr002-s2-hook-lifecycle-test.html`／`scripts/adr002-s2-hook-lifecycle-test.tsx`。在本機 Vite 開啟 `/Travel-Companion/scripts/adr002-s2-hook-lifecycle-test.html` 即可執行；它直接掛載實際 `useTripWorkspace` hook，以 mock Supabase 與 deferred Promise 控制事件順序，測試結束會 unmount 並還原該測試 origin 的 localStorage。

### 本輪動態結果
| 驗證 | 結果 | 證據 |
|---|---|---|
| Fixture `prepare → verify → cleanup` | PASS | 兩個真實本機 Auth session 的 userId、access token、refresh token 均不同；兩者皆可讀取 private fixture Trip 與自己的 trip_editor role；正式 `getCloudTripRecordsStrict`／`getTripMetas` 均包含該 Trip。Cleanup 後五項筆數回到基準、六張同步資料表 digest 完全一致、local change clock 還原，temp manifest 移除。 |
| S2-01 Guest → SIGNED_IN | PASS（hook-level） | 不重載頁面，SIGNED_IN 後 Trip list 自動更新並包含該使用者的 Trip。 |
| S2-02 A → B | PASS（hook-level／service） | A request pending 時切換 B；A 晚到結果不寫入 B；B list 與 B 的 trip_editor 權限正確。 |
| S2-03 stale Promise finally | PASS（hook-level） | A 的 finally 不會清除 B 的 in-flight Promise ownership；B 重複 reconcile 仍 dedupe。 |
| S2-04 登出期間 permission query | PASS（hook-level） | B 的 Trip Editor permission query 延遲期間 SIGNED_OUT；晚到權限不回寫，currentTrip／permission／expenseBookTripId 清空，loading 收斂。 |

Hook 測試共 10 項斷言全部 PASS。這是實際 hook 的動態測試，不是 source regex；但使用 mock Supabase 控制 Promise，不能替代 App-level UI click-through 或正式／TEST-1 資料庫端到端驗收。App 的 logout coordinator、Lease Release、已送出保存／submit 等待及 Modal heartbeat 仍須依 S2-05～14 分別驗證。

### 本輪額外品質檢查
- `node --check scripts/adr002-s2-local-fixture.mjs`：PASS。
- `npx eslint scripts/adr002-s2-local-fixture.mjs scripts/adr002-s2-hook-lifecycle-test.tsx`：PASS，0 errors／0 warnings。
- `npm run lint`：PASS，0 errors／0 warnings。
- `npm run verify:docs-links`：PASS，156 份 Markdown／378 個本地目標。
- `git diff --check`：PASS。
- 本輪未更動產品程式碼，未執行 commit／push／deploy，未連線正式 Supabase、未使用 TEST-1。測試 fixture 已完整清除；**本輪當時的下一步是接續 S2-05～07，此歷史待辦已由後續輪次完成，不是現行工作。**

## 2026-11-25：S2-05～07 App UI／Lease 動態驗證進度

### 執行邊界與測試環境
- 沿用 S2 專用 loopback Fixture，不使用使用者既有管理者／一般帳號，不操作任何原有旅程。使用 `http://127.0.0.1:5174/Travel-Companion/` 作為獨立 browser origin；`5173` 原有瀏覽器資料與登入狀態未更動。
- 本節 2026-11-25 初始 UI 測試 Fixture Trip：`adr002-s2-1d4de65f-9999-4e18-871c-6fdaf9c4a741`，private，日期 `2099-12-31`，A/B 均為專用 `trip_editor` Session。密碼僅存 OS temp manifest，未寫入 repository 或對外回報。
- 追加兩卡片測試使用另一個全新 Fixture Trip：`adr002-s2-f9369e22-9948-4041-b0dc-7e2b8ff898e7`，同為 private、日期 `2099-12-31`，兩張合成卡 A/B 僅供既有卡片編輯及排序草稿操作；沒有儲存任何卡片修改或順序。
- 追加測試結束已執行 fixture cleanup 並核對 Auth 6、Trips 2、admin_users 9、Lease 0、tombstones 118；Fixture Trip／Auth 帳號／manifest 均已不存在。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| S2-05 新增卡片草稿取消 | PASS（App UI） | 在 Fixture 管理模式新增活動表單輸入測試標題，未儲存，點表單最底部「取消」後表單及草稿欄位消失；雲端卡片數仍為 0。 |
| S2-05 新增卡片草稿登出清理 | PASS（App UI） | 保持管理模式，在未儲存草稿未送出時觸發 App 登出；Guest 狀態恢復、表單消失、Auth 與 local Trip cache 清空，DB `__trip__` Lease 歸零。 |
| S2-05 既有卡片編輯表單／共用 Trip Lease heartbeat | PASS（App UI／DB） | 在合成卡片 A 開啟既有編輯表單，表單欄位與原始資料一致；18 秒後共用 Trip Lease expiry 延長約 15 秒（121→136 秒），證實表單期間 heartbeat。點表單最底部「取消」後表單消失，DB 卡片資料／順序未變；管理模式仍持有同一筆 Trip Lease。 |
| S2-05 卡片編輯表單取消後整體登出 Release | PASS（App UI／DB，追加重測） | 前輪曾觀察到 Guest 恢復但 row 過期殘留一次，未能重現。本輪在兩張合成卡片 Fixture 分別執行「管理模式退出」及兩次「整體登出」；每次操作前均查到 A 所持有的一筆 `__trip__` row，操作後均立即查到 0 row。先前異常保留為未重現觀察，不列作目前可重現故障。 |
| S2-06 管理模式 Lease | PASS（App UI／DB） | A 登入管理模式成功建立 `itinerary_trip_edit_leases` 的 `__trip__` row，owner_user_id 與 Fixture A 一致；heartbeat 將 `expires_at - acquired_at` 由 45 秒延長至 91 秒。登出後 row 消失；本輪追加重測管理模式退出後亦立即 0 row。 |
| S2-06 時間調整草稿／模式清理 | PASS（App UI） | 管理模式進入「時間調整模式」；空白 Fixture 沒有時間起點／欄位可操作。保持此模式登出後回到 Guest，時間調整 UI 與管理模式退出，Auth／本機快取清除，DB Lease 歸零。 |
| S2-06 排序草稿／拖曳 | PASS（App UI／DB，追加測試） | 在僅含兩張隔離合成卡片的 Fixture 進入排序草稿；透過實際 DOM 事件將 A 下移至 B 之後，畫面順序改為 B、A，並出現時間先後衝突提示。按「取消」後離開排序模式；DB 仍為 A（08:00–08:30）、B（09:00–09:30），證明草稿被丟棄、沒有儲存順序。未執行正式儲存順序操作。 |
| S2-07 Trip Editor Modal 未提交登出 | PASS（App UI／DB） | 打開 Fixture 的「編輯旅程」Modal，未編輯／提交。DB Lease owner 為 Fixture A；到期剩餘長度由初始 45 秒延長至 76 秒，證明 App-level heartbeat。保持 Modal 開啟觸發登出後 Modal 消失、Guest 狀態恢復，DB Lease row 歸零。 |
| Fixture 雲端資料完整性 | PASS（DB） | 本輪結束查詢仍為原始 Trip title、`departure_date=2099-12-31`、`is_public=false`、卡片數 0；Lease row 0。 |

### 驗收結論與下一步
- S2-05 的新卡草稿取消／登出清理、S2-06 管理 Lease／時間調整模式登出清理、S2-07 Trip Editor Modal heartbeat／未提交登出清理已取得 App UI 與本機 DB 證據。
- S2-05 新卡草稿、既有卡片編輯表單共用 Trip Lease heartbeat／取消、管理模式退出及整體登出 Lease Release 均取得 App UI／DB 證據；前輪 Lease 過期殘留事件未能重現。服務層仍未檢查 release RPC 回傳的 boolean；本輪 Release 實際成功，該缺口屬靜態防護風險，尚未證明它造成前輪殘留，暫不改動產品程式。
- S2-06 管理 Lease、時間調整模式及排序草稿取消已驗證。排序只覆蓋 draft reorder + cancel，不包含儲存順序與重新預覽時間；未送出保存。
- S2-07 Trip Editor Modal heartbeat／未提交登出清理已取得 App UI／DB 證據。
- 本輪已驗證的 S2-01～07 不重跑；S2-08～14 仍依 phase table 原狀 PENDING。S2 仍非 Exit PASS。
- 本輪未變更產品程式碼、未執行 commit／push／deploy，未連線正式 Supabase、未使用 TEST-1。追加 Fixture 已清理，Auth／Trips／admin_users／Lease／tombstones 筆數回復基線，六張同步資料表 digest 與 local change clock 由 fixture cleanup 驗證還原。

## 2026-11-25：S2-08 已送出卡片保存／登出等待動態驗收

### 執行邊界與測試環境
- 使用全新 loopback Supabase Fixture Trip：`adr002-s2-15054e7d-d17a-43a4-b3c2-c4b491ba1e92`，private、日期 `2099-12-31`，`days=[1]`、`daysData["1"]`，原始兩張合成卡片 A/B。測試帳號為專用本機 Auth Session，不使用既有帳號或旅程。
- 使用獨立 browser origin `http://127.0.0.1:5175/Travel-Companion/`；未操作原有 `5173`／`5174` origin。Vite 只綁定 loopback。
- 使用瀏覽器 fetch gate 暫停實際 `/rest/v1/rpc/tc_save_itinerary_days`，讓 App 真正的卡片保存 Promise 維持 in-flight，再由 UI 觸發登出。非僅以 mock hook 模擬等待。
- 初次 S2-09 試跑發現舊 Fixture 將 `days`／`daysData` 錯誤設為日期字串索引，Trip Editor 更新後造成測試卡清空；該輪結果作廢且只影響隔離 Fixture。已修正測試腳本為 `days=[1]`、`daysData["1"]`，並以修正後 Fixture 重新執行 S2-08 成功／失敗分支與 S2-09；未修改產品程式碼。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| S2-08 保存成功時觸發登出 | PASS（App UI／DB） | 暫停 `tc_save_itinerary_days` 後點擊登出；1 秒後仍可見登入身份與登出按鈕，證明 logout coordinator 等待保存 Promise。放行 RPC 後，雲端卡片數由 2 增至 3、版本由 1 增至 2，新增測試卡標題存在；登出完成，`__trip__` Lease 歸零。 |
| S2-08 保存失敗時觸發登出 | PASS（App UI／DB／localStorage） | 在 loopback DB 暫時建立僅匹配唯一測試卡標題的失敗 trigger；暫停 RPC 並觸發登出，仍觀察到身份未提前清除。放行後 RPC 失敗，登出完成；雲端仍為 3 張卡、版本仍為 2，失敗測試卡不存在；本機 itinerary sync state 保留 `pending` 與該卡片資料，沒有誤報 cloud synced，Lease 歸零。 |
| 測試資料與環境清理 | PASS（DB／fixture cleanup） | 透過 App 正常刪除成功分支的測試卡，雲端恢復原始 2 張卡；失敗分支僅存在本機 Pending，未寫入雲端。移除臨時 DB trigger／function 後執行 fixture cleanup：Auth 6、Trips 2、admin_users 9、Lease 0、tombstones 118；六張同步資料表 digest、local change clock 均精確還原，fixture manifest／Trip／Auth／roles 均移除。測試 origin 的 localStorage／sessionStorage 已清空，Vite server 已停止。 |

### 驗收結論與下一步
- S2-08 的成功與失敗兩條 in-flight 分支均已取得 App UI、Promise 等待及 loopback DB 證據，判定 PASS。
- 成功分支確認登出不會早於已送出的卡片保存；失敗分支確認保存失敗後仍遵守既有 Pending 保留契約，登出可在 Promise 收斂後完成，沒有假成功。
- **本輪當時進度（歷史）：** S2-01～09 已有驗收證據，不重跑；當時下一步接續 S2-10「離線登出與 expiry fallback」，S2-10～14 當時仍待驗收。此狀態已由後續第四至第八輪完成／校正；現行狀態以第 9.4 節總表及文件末端最新紀錄為準。
- 本輪未修改產品程式碼／migration／正式資料庫，未連線正式 Supabase、未使用 TEST-1，未執行 commit／push／deploy；唯一臨時 DB trigger／function 已移除，fixture cleanup 與環境停止均已驗證。

## 2026-11-25：S2-09 Trip Editor submit in-flight 登出等待動態驗收

### 執行邊界與操作
- 使用修正後 loopback Fixture Trip：`adr002-s2-15054e7d-d17a-43a4-b3c2-c4b491ba1e92`，初始兩張卡片，`days=[1]`／`daysData["1"]`。App 使用專用本機 Auth Session，瀏覽器 origin 為 `http://127.0.0.1:5175/Travel-Companion/`。
- 在 Trip Editor Modal 將標題暫改為 `ADR-002 S2 isolated workspace fixture S2-09 submit in-flight`，以 fetch gate 暫停實際 `PATCH /rest/v1/trips`；待請求確實進入 in-flight 後，從 App UI 觸發登出。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| S2-09 submit in-flight 期間觸發登出 | PASS（App UI／DB） | PATCH 暫停期間，1 秒後仍可見登入身份、登出按鈕、Trip Editor Modal 與「儲存中」狀態；放行 PATCH 後，Modal 關閉、signOut 完成、登入身份與登出按鈕消失。雲端標題更新為測試值，Day 1 卡片數仍為 2，itinerary version 維持 1，Lease 歸零。 |
| 測試值復原 | PASS（App UI／DB） | 重新登入後透過 App Trip Editor 將標題恢復為 `ADR-002 S2 isolated workspace fixture`；再次查 DB 確認 Day 1 仍為 2 張卡、itinerary version 仍為 1、Lease 歸零。 |
| Fixture 與環境清理 | PASS（DB／fixture cleanup） | 登出後執行 fixture cleanup，回報 `CLEANUP_PASS`、Trip／Auth／roles／tombstone 移除、六張同步資料表 digest 與 local change clock 還原、baseline counts 還原。測試 origin 的 localStorage／sessionStorage 清空，Vite server 停止。 |

### 驗收結論與下一步
- S2-09 已證明 Trip Editor submit Promise 尚未收斂時，logout 不會先行 signOut 或釋放 Modal Lease；待 PATCH 完成後才完成 Modal 關閉與登出。測試值復原後，卡片數與 itinerary version 均保持不變，判定 PASS。
- 本輪 S2-08 成功／失敗分支與 S2-09 均使用修正後的 Day Number Fixture；測試腳本只調整本機 Fixture seed／cleanup schema，未修改產品程式碼。
- **本輪當時進度（歷史）：** S2-01～09 已有驗收證據，不重跑；當時下一步接續 S2-10「離線登出與 expiry fallback」，S2-10～14 當時仍待驗收。此狀態已由後續第四至第八輪完成／校正；現行狀態以第 9.4 節總表及文件末端最新紀錄為準。
- 未連線正式 Supabase、未使用 TEST-1、未修改 migration／正式資料，未執行 commit／push／deploy；臨時 trigger／function 已移除，Fixture cleanup 與環境停止均已驗證。

## 2026-11-25：S2-10 離線管理退出與 Lease expiry 動態驗收（部分完成，第二輪）

### 執行環境與隔離範圍
- 公司主機 `TPEPC-TM7503-01`，專案 Node `22.23.2`；獨立 Vite origin `http://127.0.0.1:5176/Travel-Companion/`，僅使用 loopback Supabase `127.0.0.1:54321`。
- 本輪 fixture Trip：`adr002-s2-69f78dcd-5a49-4627-9fe8-3089f975fadb`；兩個 UUID 合成 Auth 使用者均各有該 Trip 的 `trip_editor` 權限。初始基線 Auth 6／Trips 2／admin_users 9／Lease 0／tombstones 118。Fixture 憑證僅由測試腳本 OS temp manifest 取用，未寫入 repository；使用者另確認本機測試 DB 內有四個非正式環境測試帳號。
- 使用者於本機測試登入表單登入 B；Browser CDP 實際讀取到 `adr002-s2-b-69f78dcd-5a49-4627-9fe8-3089f975fadb@example.invalid`、本機 Auth token 存在、`navigator.onLine=true`，及 client id `4bdfe265-3b78-4bae-b052-491e6b164e96`。頁面載入 Fixture Trip 並顯示「本行程可編輯者」。
- B 的 App UI「管理」按鈕已成功點擊，頁面轉為管理模式並出現「退出／Day 1 行程管理」控制項；此為 UI 行為證據。但本輪未能取得資料庫 owner row 的即時查詢結果，因此不將其描述成已驗證 Lease owner。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| B 本機 Auth 登入及 Fixture Trip 載入 | PASS（App UI／browser） | 實際登入後畫面顯示 B email、「本行程可編輯者」及本輪 Fixture Trip；同一 origin 的 Auth token 存在。 |
| B 進入管理 UI | PASS（App UI） | 點擊 Fixture 卡片頁的「管理」按鈕後，UI 顯示「退出」及「Day 1 行程管理」。未取得本輪 DB owner row 證據，故不延伸宣稱 DB Lease claim 已驗證。 |
| 第二個獨立 Session 登入 A 並接管 Lease | BLOCKED | 新開 Chrome 分頁沿用相同 Chrome profile 的 B Auth Session；無法視為第二個獨立身份。現有 Browser Use 能力未提供獨立 browser context/profile。沒有使用同一 Session 假冒第二身份，也沒有以 SQL／直接 RPC 模擬 App UI claim。 |
| server Lease expiry 與 B 接管後 owner 變更 | NOT RE-RUN／PENDING | 因第二個獨立身份未建立，本輪未執行新的 A→B expiry takeover 判斷；前一輪 45 秒 TTL 到期 DB 證據仍保留，但不能取代第二身份接管驗收。 |
| 離線整體 Auth signOut | NOT COVERED | 本輪未測離線 Auth signOut；管理模式退出不等於 Auth signOut。 |

### 清理與結論
- `adr002-s2-local-fixture.mjs cleanup` 回報 `CLEANUP_PASS`：Trip、兩個合成 Auth users、roles、tombstone 已移除；六張同步資料表 digest、sync clock 與基線 counts 完整還原。
- 本輪測試分頁 5176 的兩個 tab 均導向 `about:blank`；獨立 Vite 5176 server 已停止。未修改產品程式碼／migration，未連線正式 Supabase、未使用 TEST-1、未 commit／push／deploy。
- S2-10 維持 PENDING：前輪已證實離線管理退出與 45 秒 Lease expiry；本輪證實 B UI 登入及進入管理介面，但未獲得獨立 A/B Session 或 DB owner 轉移證據。離線 Auth signOut 亦未覆蓋。
- **唯一下一步：** 使用真正獨立的瀏覽器 Profile／Context（或第二個可隔離的瀏覽器執行個體）建立第二個本機 Auth Session；以兩個不同 Auth userId 操作同一個新 Fixture Trip，先由 A 取得 Lease，令 Lease 於離線狀態自然逾期，再由 B 透過 App UI 進入管理模式，讀取 DB 確認 owner_user_id／owner_client_id 轉為 B。不得用同一 Chrome Profile 的分頁、SQL 或直接 RPC 假冒第二 Session。離線 Auth signOut 仍需獨立評估，不可用管理退出替代。

## 2026-11-25：S2-10 Chrome A／Edge B 獨立 Profile 驗證（部分完成，第三輪）

### 執行環境與身份確認
- 使用 loopback Vite `http://127.0.0.1:5176/Travel-Companion/` 與本機 Supabase `127.0.0.1:54321`；Chrome 使用既有 Profile 作 A，Edge 使用專用暫存 Profile（remote debugging port 9223）作 B，兩者不是同一瀏覽器 Session。
- 本輪 Fixture Trip：`adr002-s2-e7948600-7ebc-4343-ae1f-5f3c6152eaf3`。A userId `f4ccc259-99df-4501-a715-b1cb1770e4df`／clientId `55fae3e3-fafa-4cb4-910a-6da2a07bc9ca`；B userId `cbbb7024-bb85-49df-b26d-8282cc288410`／clientId `08ef3636-e73f-4adf-a4ef-bcefb735e104`。兩邊 Auth token 均存在，且 UI 最終均載入同一 Fixture Trip。
- Fixture baseline：Auth 6／Trips 2／admin_users 9／Lease 0／tombstones 118；A、B 各有 Fixture Trip 的 `trip_editor` role。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| A 取得管理 Lease | PASS（App UI／DB） | Chrome A 先透過 App UI 進入「Day 1 行程管理」。DB row owner_user_id=`f4ccc259-99df-4501-a715-b1cb1770e4df`、owner_client_id=`55fae3e3-fafa-4cb4-910a-6da2a07bc9ca`，expires_at 隨 heartbeat 更新。 |
| A 離線後管理模式退出 | PASS（App UI） | 在管理模式已開啟時切斷 Chrome A 網路，`navigator.onLine=false`；App 隨離線狀態自動離開管理模式，畫面回到一般行程頁，管理控制項由「退出」回復「管理」。本輪沒有在離線後再點擊「退出」，因 UI 已自動離開管理模式。 |
| A Lease expiry fallback | PASS（DB） | A 離線後不再續租；DB row expires_at=`2026-11-25 05:02:22.166182 UTC`，於 `2026-11-25 05:02:42.669092 UTC` 查詢 expired=true。Owner row 保留至過期，符合 TTL expiry fallback；此不代表 row 已被刪除。 |
| B 透過 App UI 接管管理 Lease | BLOCKED | Edge B 已載入同一 Fixture Trip，Auth email／token 與 clientId 均確認為 B；但「管理」按鈕在頁面上為 disabled，無法進入管理 UI。未呼叫 SQL／直接 RPC 模擬 claim，未修改 DOM 狀態繞過 disabled guard；DB owner 仍是已逾期的 A，未觀察到 B owner transfer。Disabled 原因尚未從 UI 證據確定，需下一輪針對 B 的權限／Lease readiness 狀態診斷。 |
| 離線 Auth signOut | NOT COVERED | 本輪只測管理模式在離線狀態的自動退出與 Lease expiry，不等同 Auth signOut。 |

### 清理與結論
- Fixture cleanup 回報 `CLEANUP_PASS`：Fixture Trip、兩個 Auth users、roles、tombstone 移除；六張同步資料表 digest、sync clock 與 baseline counts 完整還原。
- Chrome A 網路已恢復；獨立 Edge 暫存 Profile 專屬程序已停止並刪除 Profile；Vite 5176 已停止。未修改產品程式碼／migration／正式資料，未執行 commit／push／deploy；原有 worktree 變更完整保留。
- 本輪證實 Chrome／Edge 可建立兩個獨立 Auth Session，且 A 的管理 Lease expiry fallback 成立；但 B 無法通過 App UI 的管理按鈕 guard，故 **S2-10 維持 PENDING**，不得標示 A→B takeover PASS。
- **下一步：** S2-10 的 A→B takeover 已於後續獨立 Chrome／Edge Profile 測試完成；接續 S2-11～14。離線 Auth signOut 未覆蓋，另列為測試範圍限制。

## 2026-11-25：S2-10 A 離線管理退出／B 接管 Lease 驗收完成（第四輪）

### 執行環境與身份確認
- 使用 loopback Vite http://127.0.0.1:5176/Travel-Companion/ 與本機 Supabase http://127.0.0.1:54321；Chrome CDP 9223 作 A、Edge CDP 9224 作 B，兩個獨立 Profile。
- 本輪 Fixture Trip：adr002-s2-5b855e24-627c-4e57-83c5-de1d736bf610。A userId 350dcac7-208f-43d8-82e0-bcb244eb2456；B userId 69aaa681-5a8e-451c-bca2-adb33cec2ab7。兩個 Auth Session 均由 App UI 登入，且兩邊皆載入同一 private Fixture Trip、顯示「本行程可編輯者」。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| A 透過 App UI 取得管理 Lease | PASS（App UI／DB） | Chrome A 點擊「管理」後進入 Day 1 行程管理。DB row owner_user_id=350dcac7-208f-43d8-82e0-bcb244eb2456、owner_client_id=cb14bf31-4efd-4b12-b541-96c2628b8a89；heartbeat 延長 expires_at 至 2026-11-25T05:56:02.145001Z。 |
| A 離線後退出管理模式 | PASS（App UI） | 管理模式中將 Chrome A 設為 offline，透過 App「退出」操作；畫面回到一般行程頁，顯示「目前沒有網路連線」，「退出」控制項消失並恢復「管理」。 |
| A Lease expiry fallback | PASS（DB） | A 離線後不再續租；DB row expires_at=2026-11-25T05:56:02.145001Z，於 db_now=2026-11-25T05:56:15.767141Z 查詢 active=false。Owner row 保留至 expiry，沒有假稱 Release RPC 成功。 |
| B 初次進入管理 UI | EXPECTED STALE UI，已恢復 | Lease 到期後 B 初次點擊「管理」仍看到「本日有卡片正在其他裝置編輯」；DB 已確認 A row 過期。點擊 App「重新確認」刷新 Lease 清單後，遠端鎖定提示消失，「管理」按鈕恢復可用。 |
| B 透過 App UI 接管管理 Lease | PASS（App UI／DB） | B 點擊「管理」後進入 Day 1 行程管理。DB row owner_user_id=69aaa681-5a8e-451c-bca2-adb33cec2ab7、owner_client_id=4db8e0e7-11a2-4d02-9925-390882698b11，acquired_at=2026-11-25T05:56:49.079099Z。17 秒後 expires_at heartbeat 延長至 2026-11-25T05:58:05.199230Z，active=true。之後 Edge 被切至背景，App 離開管理模式且 heartbeat 停止；重新將 Edge 帶至前景後，B 再次透過 App「管理」進入管理模式，DB 新 Lease acquired_at=2026-11-25T05:59:32.013069Z，20 秒後 expires_at 延長至 2026-11-25T06:00:32.108968Z，active=true。 |
| A 不再持有 Lease／B 保持管理 | PASS（App UI／DB） | A 恢復網路後仍處於一般行程頁（非管理模式）；Edge B 回到前景並重新進入管理模式後，UI 顯示「退出／Day 1 行程管理」。最終 DB 僅有該 Fixture Trip 的一筆 Lease row，owner_user_id 為 B，active=true；沒有 A owner row。 |
| 離線 Auth signOut | NOT COVERED | 本輪只驗證離線狀態退出管理模式、停止本機持有及雲端 Lease expiry fallback；沒有執行離線 Auth signOut。 |

### 驗收結論與下一步
- **S2-10 離線管理退出、Lease expiry fallback、B 經 App UI 接管及 DB owner_user_id／owner_client_id 轉移均 PASS。**
- 本輪未以 SQL 寫入 Lease、未直接呼叫 claim RPC、未修改 DOM disabled 狀態；B 的接管完全透過 App UI「重新確認」及「管理」操作完成。
- B 初次點擊遇到過期 Lease 的 stale UI snapshot，使用既有「重新確認」刷新後可正常接管。測試期間 Edge 切至背景時 App 離開管理模式並停止 heartbeat；將 Edge 帶回前景後 B 可再次由 App UI 取得 Lease，且 heartbeat 持續延長。此為額外觀察，尚未判定為缺陷。
- 本輪 Fixture、兩個測試 Auth Session、兩個瀏覽器 Profile、Vite 5176 server 暫時保留，供 S2-11～14 後續驗收續用；未執行 fixture cleanup。
- 未修改產品程式碼／migration／正式資料，未連線正式 Supabase、未使用 TEST-1，未 commit／push／deploy；既有 worktree 變更保留。

## 2026-11-25：S2-11～14 接續驗收（第五輪）

### 執行環境與身份
- 沿用 localhost Vite 5176（HTTP 200），未另開測試瀏覽器。Chrome A 為 managed tab 278051929；Edge B 為獨立 Profile `TravelCompanion-S2-B-5b855e24`，CDP 9224。
- A userId `350dcac7-208f-43d8-82e0-bcb244eb2456`，B userId `69aaa681-5a8e-451c-bca2-adb33cec2ab7`；兩邊一度同時登入各自 Fixture user，均選取同一單日 Fixture Trip `adr002-s2-5b855e24-627c-4e57-83c5-de1d736bf610`。本輪後段 A 已登出，B 仍保持登入；未清除 Edge Profile 或 DB Fixture。

### 動態結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| S2-11 費用簿身份隔離 | PASS（App UI／Auth／實際 hook） | 原始 A 在 Chrome managed tab 透過 App UI 登出，Auth token=null、App 回 Guest、`travel_companion_custom_trips=[]`；B 的獨立 Edge Session 仍保持登入與原始 Fixture。另以獨立 loopback 測試頁掛載實際 `useExpenseBook` hook：登入狀態先以 `expenseBookTripId=s2-shared-expense-book-fixture` 執行一次 `expenses.eq(trip_id)` Load 並建立 `travel-companion-expenses-s2-shared-expense-book-fixture` Realtime channel；轉為 signed-out／空 ID 後，7 項斷言全部 PASS：舊 ID 查詢數未增加（初始 1 筆、登出後及 250ms settle 後仍 1 筆）、Realtime channel 已移除、hook state 持續為空 ID，且無延遲 Load 重用舊 ID。`npm run test:expense-realtime-lifecycle` 另 PASS，證明 Realtime service 的 pending timer／window+document listener／channel cleanup。測試使用 mock Supabase 與獨立 origin，不把 mock 證據描述成正式 DB Network log。 |
| S2-12 登出清理延遲／失敗 | PASS（App UI／Runtime） | Chrome A 確認 Fixture record 存在且 cloudUpdatedAt 非空；寫入合成 cover manifest URL，僅對 `travel-companion-itinerary-covers-v1` 注入一次性 900ms 延遲後 rejection；透過 App UI「登出」。之後觀察 probe.started=1、probe.failed=1、manifest key 移除、Auth token=null、auth_／cached_expenses_ key 清空、trip cache=[]，畫面顯示「使用 Google 登入／未登入瀏覽模式」，Loading indicators=0。延遲失敗未阻止 UI 完成登出。Console warning 本輪未直接擷取，故不列為已觀察證據。 |
| S2-13 登出後同／異帳號重新登入 | PENDING（部分證據） | A logout 後確認 Auth=null、未登入畫面；Edge B 的獨立 Session 同時仍保持 B userId、Fixture Trip 及「本行程可編輯者」，證明 A logout 未清除 B 瀏覽器 Session。A 登入表單已出現，但提交操作被平台安全檢查阻擋；未完成 A same-user re-login，也未執行不同使用者 UI 切換，不得判 PASS。 |
| S2-14 日期切換退出管理回歸 | BLOCKED（Fixture 前置條件不足） | 程式確認 `handleDayChange(day)` 在 activeDay 不同時呼叫 `closeManageMode()`，其後執行 `onActiveDayChange(day)`；`closeManageMode` 會呼叫 `cleanupManagementSession(true)`。但目前共享 Fixture 只有 days=[1]，UI 僅有 D1，沒有第二日期可真實切換。B 正在使用同一 Fixture，為避免改寫共享 Trip／影響 B session，本輪未新增第二天或以 DOM/state 注入繞過 UI。 |
| S2-12 測試殘留 | CLEANUP PARTIAL | A logout 已透過 App cleanup 刪除 Fixture 本機 Trip cache 與合成 cover manifest；Chrome A 保持 Guest。Edge B 保留有效 Session 與 Fixture Trip；未刪除 Fixture／Auth／Profile，以免中斷 B 工作階段。 |

### 驗收結論與下一步
- S2-12 的延遲封面快取失敗仍能完成登出及關閉 Loading，判定 PASS。
- **本輪當時狀態（歷史；已由第六輪後續驗收取代）：** S2-11 維持 PARTIAL PASS；S2-13 PENDING；S2-14 BLOCKED（當時需可安全使用的至少兩天隔離 Fixture）。
- **本輪當時下一步（歷史；已由第六輪後續驗收取代）：** 建立兩日隔離 Fixture 驗證 S2-14，並完成 S2-13 同帳號重新登入及不同身份切換；此待辦已在後續輪次取得 PASS 證據，不再是目前工作。
- 本輪未修改產品程式碼／migration／正式資料，未執行 fixture cleanup，未 commit／push／deploy；既有 worktree 未提交變更完整保留。
- 後續建立全新 UUID 的兩日隔離 Fixture（不要改動目前 B 使用中的單日 Fixture）驗證 S2-14；S2-13 需由正常 UI 操作重新登入 A，同帳號重登後核對 trip list、selected trip、permission、expenseBook 與 Lease，再測不同使用者切換。**此為本輪當時的待辦紀錄，已由第六輪後續驗收完成，不代表現行待辦。**

## 2026-11-25：S2-13／14 原始 A/B Fixture 接續驗收（第六輪）

### 正確驗收目標與前置狀態
- 本輪正式驗收目標是原始使用者 A/B 共用的 Trip：`adr002-s2-5b855e24-627c-4e57-83c5-de1d736bf610`，Title `ADR-002 S2 isolated workspace fixture`。A userId `350dcac7-208f-43d8-82e0-bcb244eb2456`；B userId `69aaa681-5a8e-451c-bca2-adb33cec2ab7`。Chrome A managed tab `278051929`、Edge B CDP `9224`，兩個不同瀏覽器 Profile／Auth Session 均選取同一原始 Trip。
- 使用者已將該 Trip 建成 `days=[1,2]`；D1 保留兩張合成卡片 A／B，D2 的 `daysData["2"]` 為空陣列。此空白 D2 是本輪指定驗收前置資料，未新增或修改 D2 卡片。
- 另有一筆先前建立的 `ADR-002 S2 Two-Day Isolated Fixture`（不同 Trip ID）曾用於工具／測試流程除錯；其結果不作為本節原始 A/B Fixture 的 S2-14 PASS 證據。本節所有 S2-14 結論均以本節第一項原始 Trip ID 的 App UI 與本機 DB 觀察為準。

### S2-14 原始 Fixture 動態結果
| 驗證 | 結果 | 證據 |
|---|---|---|
| A 在 D1 取得管理 Lease | PASS（App UI／DB） | Chrome A 由 D1「管理」進入 Day 1 行程管理。DB owner_user_id 為 A；owner_client_id `55fae3e3-fafa-4cb4-910a-6da2a07bc9ca`；Lease active=true。 |
| 管理中 D1 → D2 | PASS（App UI／DB） | A 在管理模式直接點 D2。App 顯示 D2 日期標題及「此行程今日尚無規劃活動景點」，管理 UI 退出、控制項恢復「管理」；DB 該 Trip Lease row 由 1 變為 0。這同時確認 D2 空白狀態與日期切換退出管理行為。 |
| D2 進入管理後 D2 → D1 | PASS（App UI／DB） | A 在空白 D2 點「管理」後進入 Day 2 行程管理；DB Lease owner 仍為 A 且 active=true。再點 D1 後 App 回一般 D1 行程 UI，管理模式退出，DB Lease row 變為 0。 |
| B 在同一原始 Trip 取得管理 Lease | PASS（App UI／DB） | Edge B 由 App UI 點「管理」進入 Day 1 行程管理；DB owner_user_id 為 B、owner_client_id `4db8e0e7-11a2-4d02-9925-390882698b11`，active=true。 |
| B 持有 Lease 時 A 嘗試進入管理 | PASS（App UI／DB） | Chrome A 點「管理」後未進入管理模式，顯示「本日有卡片正在其他裝置編輯」及「另一個裝置持有整趟行程編輯權；本端管理、新增、排序、時間調整、複製、修改及刪除均已停止」，並提供「重新確認」。DB Lease owner 仍為 B，沒有 A 覆寫或新增第二筆 row。 |
| B 退出、A 重新確認並接管 | PASS（App UI／DB） | B 透過 App「退出」後 DB Lease row 歸零。A 透過 App「重新確認」後，點「管理」成功進入管理模式；DB owner_user_id 轉為 A，owner_client_id 為 A 的原始 client id，active=true。 |
| 測試結束 Lease 清理 | PASS（App UI／DB） | A 透過 App「退出」結束管理；最後查詢原始 Trip 的 Lease row 數量為 0。A／B 原始登入 Session 均保留，沒有登出或重設密碼。 |

**S2-14 判定：PASS。** 原始指定 Trip 已證明 D1→D2 與 D2→D1 都會先退出管理並釋放 Lease；空白 D2 也能正常進入管理。相同 Trip 的 A/B 編輯互斥、B→A Lease 交接及退出清理均已由實際 App UI 與 local DB 驗證。

### S2-13 身份切換驗證與限制（依原始 Accepted 驗收邊界重新判定）
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| A 登出清理 | PASS（App UI／Auth／DB；隔離測試 Profile） | 在獨立兩日 Fixture 的 A Session 中，A 透過 App UI 登出；Auth token 清空、App 回 Guest、原 Fixture 本機 Trip cache 被清除；當時 A 持有的 Lease row 立即歸零。此項不涉及原始使用者 A 的密碼或 Session。 |
| A → B 不同帳號切換 | PASS（App UI／Auth／Workspace；隔離測試 Profile） | 同一隔離 App 分頁先登入兩日 Fixture A，登出後再透過本機測試登入 UI 登入 Fixture B。Auth userId 從 A 的 UUID 變為 B 的不同 UUID；App reconciliation 載入同一兩日 Fixture，行程權限顯示「本行程可編輯者」。B 的個人帳本代號初始化為 B2，未沿用 A2。 |
| 原始 A/B 兩個 Session 同時使用同一原始 Trip | PASS（App UI／Auth／DB） | Chrome A 與 Edge B 的 userId 不同，兩邊同時選取本節指定原始 Trip，均顯示「本行程可編輯者」；B 持有 Lease 時 A 被阻擋，B 退出後 A 能重新確認並取得 Lease。 |
| A 同帳號 logout → relogin | PASS（使用者正常 UI 操作／App UI／Auth） | 使用者於 2026-11-25 正常完成原始 A 帳號重新登入，並選取本節原始 Fixture。App 顯示 A 的測試 Email、「本行程可編輯者」及 D1 兩張合成卡片；CDP 讀取本機 Supabase access token claims，`sub` 為原始 A userId `350dcac7-208f-43d8-82e0-bcb244eb2456`，Email 與原始 A 一致。 |
| 登入後 Trip／permission／帳本可觀察行為／Lease 比對 | PASS（沿用 S2-11 專項證據） | App UI／localStorage 確認所選清單僅含原始 Fixture、該 Fixture cache 存在、A 的 personal expense alias 為 A，未見舊 B 帳本識別鍵被選取；local DB 核對原始 Trip 仍為 `is_public=false`、D1 兩卡、D2 零卡，且 `itinerary_trip_edit_leases` 無該 Trip row。費用簿 hook 登出後清空及不再使用舊 ID 的直接行為證據由 S2-11 七項實際 hook assertions 提供；此處不重複要求直接讀取另一個 `expenseBookTripId` hook state。 |

**S2-13 判定：PASS。** 同帳號 logout→relogin、不同帳號 A→B 切換、Auth 身份、Trip 清單／選取、App permission、個人帳本代號及 Lease 狀態均有既有動態證據；費用簿舊 ID load／Realtime 清理沿用 S2-11 的實際 `useExpenseBook` hook lifecycle 七項斷言。原驗收要求的是身份切換後行為正確，並未指定必須於 S2-13 當輪直接讀取 React hook 內部 state。故移除該額外證據形式門檻，不新增測試 seam、不重跑已通過的 hook 測試。

### 本輪範圍、環境及結論
- 本輪沒有修改產品程式碼、migration、正式資料或原始 D1／D2 卡片內容；未改寫原始 Fixture 的權限設定、未重設任何既有帳號密碼。
- 原始 A Session 已由使用者正常 UI 重新登入並保留；最後原始 Trip 的 Lease row 為 0。先前建立的另一筆兩日測試 Fixture（`adr002-s2-two-day-2a4cf411-da57-47d4-8a3e-58313355b3e5`）與獨立測試 Profile 是不同測試資源，不與本節原始 Trip 證據混用。該額外 Fixture 與兩個測試 Auth users 仍留在本機 DB；清理操作遭平台安全檢查阻擋，未執行刪除，亦未留下臨時清理腳本。其 manifest 暫存檔仍存在，後續需在允許的清理途徑中單獨處理。
- 依 2026-11-25 本次驗收邊界修正：S2-10 PASS（離線退出管理、Lease 停止續租／expiry fallback、B App UI 接管）；S2-13 PASS（同帳號重新登入、A／B 身份切換及費用簿清理沿用 S2-11 hook lifecycle 證據）；S2-11、S2-12、S2-14 均保留既有 PASS。歷史第七輪「離線 Auth signOut NOT COVERED」及 hook state NOT PROVEN 如實保留為當時測試記錄，但不再構成現行驗收缺項。
- **本輪當時下一步（歷史；後續第八輪完成驗收邊界校正）：** S2-10 與 S2-13 無待補測試；不得為了補做已移除的額外證據形式要求而重跑案例。當時 S2 整體 Exit 尚未 PASS；現行狀態及唯一下一步以文件末端最新校正為準。
- 未執行 commit／push／deploy；既有 dirty worktree 全部保留。

## 2026-11-25：S2 最終測試收斂（第七輪；後續驗收邊界校正見本節最末）

### 執行與環境保護
- 沿用原始 Chrome A 與 Edge B 工作階段；沒有登出、重設或修改 A/B 的登入狀態，也沒有再啟動另一個 Chrome process／Profile。
- 為避免覆用既有 fixture manifest，本輪使用獨立暫存 manifest 建立一次性 fixture。完成後執行 cleanup，回報 `CLEANUP_PASS`：Trip、兩個 Auth users、roles、tombstone 均移除；六張同步資料表、sync clock、baseline counts 全數恢復。原始 A/B Fixture 與先前保留的 two-day fixture 未被刪改。
- 同一 Chrome process 中曾開啟獨立 localhost:5177 測試 tab，以不同 origin 隔離 localStorage；該 tab 已導回 `about:blank`，Vite 5177 server 已停止。未使用新瀏覽器 Profile。

### 本輪驗證結果
| 驗證 | 結果 | 證據／限制 |
|---|---|---|
| S2-10 離線 Auth signOut | NOT COVERED | 本輪嘗試在獨立 localhost origin 建立測試 Session，但登入提交的自動化操作遭平台安全檢查阻擋，未成功建立 Session，也未執行 Auth signOut。Computer Use 前景仍指向原始 A tab，不能安全控制新 tab；因此不以離線管理退出代替 Auth signOut。 |
| S2-13 `expenseBookTripId` 直接 hook state | NOT PROVEN（非必要驗收項） | 歷史測試頁前五項 hook assertions PASS，之後等待 B Trip Editor permission 逾時，整頁 FAIL。此結果如實保留；直接讀取該內部 state 並非 Accepted 驗收條件，費用簿登出後不再使用舊 ID 的行為由 S2-11 七項實際 hook lifecycle assertions 覆蓋，不影響 S2-13 PASS 判定。 |
| ADR-002 S2 static regression | PASS | `npm run verify:adr002-s2-auth-workspace-lifecycle`。 |
| Expense Realtime lifecycle | PASS | `npm run test:expense-realtime-lifecycle`；驗證無 30 秒輪詢、事件／重連／恢復／focus／online／visibility refresh、offline guard 與 cleanup。 |
| Trip workspace recovery lifecycle | PASS | `npm run test:trip-workspace-recovery-lifecycle`；驗證 Session Ready gate、offline guard、事件觸發、in-flight dedupe、失敗保留、成功清除及 cleanup。 |
| 文件連結與 diff | PASS | `npm run verify:docs-links`：156 份 Markdown、371 個本地目標；`git diff --check` PASS。 |

### 最終判定（依 2026-11-25 校正後驗收邊界）
- S2-10：離線管理退出、45 秒 Lease expiry fallback、B 透過 App UI 接管及 DB owner 轉移已在第四輪 PASS；離線 Auth signOut 未執行，但不屬原始驗收條件，故不構成缺項。
- S2-13：同帳號 logout→relogin、不同帳號切換、Auth／Workspace／permission／Lease，以及費用簿清理行為均有既有證據；`expenseBookTripId` 直接 hook state 未取得，但屬額外證據形式要求，S2-11 已提供實際 hook lifecycle 行為證據，故 S2-13 判定 PASS。
- S2-14 PASS；S2-01～09、S2-11～12 保留既有 PASS 證據。本節歷史測試頁失敗與 NOT COVERED 紀錄照實保留，不回頭改寫為成功；僅校正其是否屬現行驗收必要項。S2-10、S2-13 均不再有待補測試。
- 本輪沒有修改產品程式碼、migration、正式資料，沒有 commit／push／deploy；只增加測試 fixture manifest path 的環境覆寫能力，所有既有 dirty／untracked 檔案均保留。
- **本次校正後的下一步：** S2-10、S2-13 均已依原始 Accepted 驗收範圍完成判定，不再列為待辦；第七輪所記 NOT COVERED／NOT PROVEN 保留作為歷史事實，但其額外項目不是目前驗收阻塞。不得重跑已通過案例或再為這兩項建立新測試 seam。

## 2026-11-25：S2-10／S2-13 驗收邊界校正（第八輪）

### 校正依據
- 唯讀核對正式產品 `src/components/layout/AppSidebar.tsx`：`!isOnline` 分支只顯示離線使用者、帳號及離線資料提示；「登出」按鈕只在 online 且 `isSessionReady` 且 `userEmail` 存在的分支顯示。正式離線 UI 沒有登出入口。
- 核對 `src/App.tsx` 的 `handleLogout()`：它等待保存及編輯 Lease 清理後呼叫 `supabase.auth.signOut()`；此為在線 App 登出流程，離線模式沒有對應 UI 操作入口。
- ADR-002-S2 第 2.2 節已明定：Release 因離線／RPC 失敗無法完成時，仍須停止本機 heartbeat、清除本機持有標記；不得宣稱雲端 Lease 已立即釋放，雲端依既有 expiry 回收。此決策沒有要求離線 Auth signOut。
- S2-13 原始驗收條件（本表）要求新 Session 的旅程清單、選取旅程、權限、帳本及 Lease 狀態正確，沒有指定必須直接讀取 React hook 內部 state。S2-11 已有實際 `useExpenseBook` hook lifecycle 七項斷言，驗證空 ID 後舊 Trip ID 查詢不增加、Realtime channel 移除、hook state 清空且沒有延遲 Load 重用舊 ID。

### 校正後判定
| 項目 | 原紀錄疑慮 | 校正後驗收標準 | 最終狀態／既有證據 |
|---|---|---|---|
| S2-10 | 把離線 Auth signOut 當成尚未完成的驗收項 | 離線管理退出；本機 heartbeat／marker 停止／清除；Lease 不能 Release 時依 TTL expiry 回收；第二個有效 Session 可透過 App UI 接管。不要求 Auth signOut | **PASS**。第四輪已透過 App UI／DB 證實：A 離線退出管理、停止續租、45 秒 TTL 過期；B 經 App UI 重新確認及管理操作接管，DB owner_user_id／owner_client_id 轉移至 B。 |
| S2-13 | 把 `expenseBookTripId` 直接 hook state 讀取當成 PASS 前提 | 同帳號重登及 A／B 身份切換後，Auth、Trip list／selection、permission、帳本可觀察行為及 Lease 均屬新 Session；費用簿舊 ID 行為可沿用 S2-11 專項證據，不要求 S2-13 再直接讀取內部 state | **PASS**。第六輪同帳號 logout→relogin、不同帳號 A→B、Auth 身份、Trip、permission、個人帳本代號及 Lease 均有證據；費用簿舊 ID／Realtime 行為由 S2-11 七項實際 hook lifecycle assertions 覆蓋。 |

### 範圍與工作量收斂
- S2-10 不再安排離線 Auth signOut 測試；離線 UI 沒有該入口，原 Accepted 決策亦未要求此操作。
- S2-13 不再安排 `expenseBookTripId` hook state 直接讀取，不建立新的測試 seam，不修復只為該額外讀取而使用的測試頁等待條件。
- 第七輪 `S2-10 NOT COVERED` 與 `S2-13 NOT PROVEN` 均保留為當輪實際測試紀錄；這些記錄沒有被改寫成測試成功。校正的是它們不是原始 Accepted 驗收的必要項，因此不再阻擋兩項驗收 PASS。
- 本輪只修正 ADR 與決策索引文件；未修改產品程式、測試程式、migration，未操作瀏覽器登入登出或資料庫，未 commit／push／deploy。

## 2026-11-25：S2 現行狀態與歷史紀錄矛盾整理

### 文件矛盾及處理
- 第 9.4 節原驗收總表將 S2-11、S2-12、S2-14 留在 PENDING，但第五輪已分別取得費用簿 hook lifecycle、附件清理延遲失敗、日期切換 App UI／DB PASS 證據。已將總表校正為 S2-01～14 全部逐項 PASS，並保留第五／第六輪原始證據。
- 第 9.4 節原「下一步」仍指向 S2-05～07；該工作已由後續輪次完成。已改為目前唯一下一步：核對 S2 整體 Exit 條件與必要工程驗證證據。
- 文件第 4 節「接續實作順序」及開頭交接說明原先仍引導新對話重新執行 S2-01～14。已明確標示 Step 1–4 第一輪實作及逐項驗收均已完成；新對話依第 9.4 現行總表及文件末端最新紀錄接續，不得重跑已 PASS 案例。
- 第 9.4 節前段的「下一步」與已完成輪次衝突，已標註為歷史輪次當時狀態，避免舊進度取代後續證據；逐輪日誌內的 PENDING／BLOCKED／NOT COVERED 保留原貌，因其是當時測試事實，不應回寫成當時已通過。
- ADR-002 主檔末端原句「2026-11-24 本輪尚未修改程式／測試」容易被誤讀為目前狀態，已限定為初始調查輪的歷史描述，並指向 S2 階段文件作為現行依據。
- `docs/decisions/README.md` 的 ADR-002 狀態、階段入口與下一步已同步：逐項 S2 PASS；目前僅待整體 Exit 總結。

### 現行狀態（截至 2026-11-25 Exit 核對後）
- S2 Step 1–4：第一輪程式實作完成。
- S2-01～14：全部逐項 PASS；S2-10 不要求離線 Auth signOut；S2-13 的費用簿舊 ID 行為沿用 S2-11 hook lifecycle 證據。
- S2 整體 Exit：**PASS**。階段規定的 targeted regression、前端／Node TypeScript、全專案 lint、完整 production build 及文件／diff 檢查均已取得本輪實際 PASS 證據；逐項動態驗收亦全數 PASS。
- 歷史第七輪 `NOT COVERED`／`NOT PROVEN`、第五輪 `PENDING`／`BLOCKED` 均保留其歷史事實；已依原始 Accepted 驗收邊界校正，不構成現行缺項。
- 本次完整 build 僅執行本機 production build 與其 postbuild checks；沒有 deploy、正式 DB 寫入或 Git commit／push。

### Exit 核對證據（2026-11-25）
| 檢查 | 結果 | 本輪證據 |
|---|---|---|
| `npm run verify:adr002-s2-auth-workspace-lifecycle` | PASS | S2 identity／workspace／logout 靜態 regression guard |
| `npm run test:expense-realtime-lifecycle` | PASS | Realtime 事件、重連／恢復、focus／online／visibility、offline guard、cleanup |
| `npm run test:trip-workspace-recovery-lifecycle` | PASS | Session Ready、offline guard、event trigger、in-flight dedupe、failure retention、success clearing、cleanup |
| `npm run test:p0-pending-autosync-idempotency` | PASS | Pending auto-sync idempotency regression |
| `npm exec tsc -- -p tsconfig.app.json --noEmit` | PASS | 前端 TypeScript |
| `npm exec tsc -- -p tsconfig.node.json --noEmit` | PASS | Node／scripts TypeScript |
| `npm run lint` | PASS | 全專案 ESLint，exit code 0 |
| `npm run build` | PASS | 完整 verify chain、前後端 TypeScript、Vite production build、PWA precache、browser security、weather bundle；job `job-1795600896607-hq671g` exit code 0 |
| `npm run verify:docs-links` | PASS | 156 份 Markdown、374 個本地目標 |
| `git diff --check` | PASS | 無 whitespace／patch 格式錯誤 |

- 執行環境：`TPEPC-TM7503-01`／`NICE-GREEN`；Node `C:\\nvm\\v22.23.2\\node.exe` v22.23.2；npm 10.9.8。
- S2-01～14 既有逐項動態驗收證據沿用，不重跑；本輪僅補齊整體 Exit 工程檢查。
- Git：`develop`，HEAD `59be5b137f3aea4161b1ea7a7629448ec2b2d551`，與 `origin/develop` ahead／behind 0／0；工作樹保留既有修改及新增檔案，未 stage／commit／push。

### 唯一下一步
S2 階段已 Exit PASS，無需再安排 S2-01～14 或工程驗證重跑。保留目前工作樹，等待使用者決定後續工作；Git commit／push 仍須明確指示。
