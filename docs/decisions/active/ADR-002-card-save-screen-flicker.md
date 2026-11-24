# ADR-002：移除已淘汰的每日行程預覽／同步衍生機制並修復保存更新行為

- **ID：** ADR-002
- **狀態：** Accepted／S1 原工作線持續進行；S2 登入身份切換與登出生命週期已核准直接實作（2026-11-24）
- **建立日期：** 2026-11-22
- **修訂日期：** 2026-11-24
- **標題：** 以現行 develop 為基礎，依實際依賴證據拆除不再需要的預覽／通知／變更摘要及同步衍生機制，恢復符合目前決策的同步與保存行為

## 工作目標
以現行 develop 程式為拆解基礎，透過程式呼叫鏈、資料流、Git 歷史及隔離測試證據，逐項移除／修正已不再符合目前決策的 Daily Itinerary preview／notice／change-summary 與相關衍生同步機制，降低不必要的同步狀態與更新流程，恢復簡潔且可靠的資料保存／更新行為。V3.9.16 僅作歷史同步行為參照，不作回退、reset或重建基礎。

## 範圍與限制
- 調查並實作移除已取消的每日行程預覽、通知確認、變更分類／計數／摘要、專用 snapshot／baseline副作用及其必要衍生流程；每項均須先證明實際依賴及移除邊界。
- 以 ADR-001 Accepted 決策為保留／驗收標準：保留必要 revision／更新訊號、Trip-level Lease、Save RPC、version/CAS、Pending／Recovery安全保護及其他明確保留機制；不以舊 Preview 流程替代或繞過它們。
- 保留 V3.9.16 後與本拆除範圍無關且仍有效的功能、修正及文件；不得整體回退或任意重構。
- 以現行 develop 為基礎，逐項追蹤、拆除、測試、記錄；未經證據支持不得批次刪除。
- **已核准本 ADR 範圍內的程式修改及必要隔離測試。2026-11-24 使用者另明確核准本次 V3.11.5 全專案提交／推送與標準發布流程；該授權不免除正式資料庫備份、還原驗證及其他安全停止條件。**
- 不使用 TEST-1 或正式資料庫進行測試；測試僅採安全隔離資料及本機／非正式環境。
- 保留既有工作樹修改，不覆蓋或混入。

## 已知調查摘要（2026-11-22）
- 保存流程在本機保存／Pending更新後會多次呼叫 `setCurrentTrip`；線上流程再取得 Lease、讀取版本／單一 Trip、reconciliation、雲端 Save RPC、同步狀態更新及後續 `setCurrentTrip`。多次狀態更新是值得檢查的候選機制，尚未證明是閃動根因。
- 卡片列表已使用 `event.id` 作 sortable／React identity；缺少 ID 時採 `legacy-${activeDay}-${originalIndex}` fallback。Git 歷史確認此機制至少自 V3.10.12 時代已存在；`ensureItineraryDaysDataIds()` 只在排序、複製、時間調整等特定流程補 ID，普通保存函式不會共通正規化所有卡片 ID。一般保存若更新同一趟 `currentTrip`，App 的 `ItineraryPage` key（trip/user）不變，重新 render 不等於 remount。
- 保存時序的歷史差異已找到：`2af4db9`（2026-11-19）把本機 Pending 寫入後的 `setCurrentTrip(localRecord.detail)` 從僅離線分支移到線上／離線共用路徑；線上保存結束後仍會再次提交 `currentTrip`。這證實新增一次保存中途的父層 state 更新／render 機會，但尚未證明造成卡片 DOM 替換或肉眼閃動。
- 一般列表仍有條件式掛載：`displayedDayEvents.length > 0`；父層 `isLoading`、screen 或 `currentTrip` 條件也會卸載 `ItineraryPage`。同旅程保存時 `App` key 固定，普通 `currentTrip` 更新本身不等於 remount；目前 save 函式可見的 `setIsLoading(false)` 不會主動進入 loading spinner。
- **更具體的保存／Lease lifecycle 候選已確認：** Lease effect 原始於 `b047d01`（2026-11-01）建立，`22af34a` 為取得當日卡片 ID 集合並判斷遠端鎖定，新增 `activeDay` 及整份 `trip.content.daysData` 為 dependencies。這讓每次 `daysData` 物件參照更新都會 cleanup／重建 Lease service 與 Realtime channel，setup 期間把 `editLeaseStatus` 設為 `loading`，refresh 完成後才回 `ready`；`canModifyCard()` 在此期間暫時失效。
- 線上保存過程會多個階段更新 `currentTrip`：`2af4db9` 將 local Pending 後更新移至 online common path；一般 reconciliation 中途更新；最終從 localStorage 再 `JSON.parse` 取回 savedTrip，產生新的 `daysData` 物件參照。這些更新與 11/1 Lease dependency 疊加，存在多次 `loading → ready` lifecycle restart 的機會；分支及 React batching 決定實際次數，尚未量測。
- **目前最具體候選根因是 Lease subscription lifecycle 與每日卡片資料參照綁定過緊**，會暫停卡片管理權限／控制狀態，但尚未證明這就是使用者觀察到的 2–3 次可見閃動，也未證明卡片 DOM remount。最小方案方向是分離 Lease subscription scope 與最新 active-day IDs，但尚未授權程式修改。
- 動態 UI 驗證仍 BLOCKED：CDP DOM操作及 UI test account signup/login 已恢復成功（`adr002-test-20261122@example.invalid`，loopback-only）；但該身份目前處於個人帳本模式，既有 seed Trip 的管理按鈕 disabled，尚未建立／取得可編輯的 ADR-002專用 Trip／fixture。歷史 `v391-local-browser` 合成旅程明確排除重用，現成 bootstrap 亦會修改既有 `v391-admin` Superadmin 角色，不符合隔離要求。下一步須在 loopback環境建立專用 Trip ownership/access，不擴權既有身份或操作歷史旅程，再觀察 effect setup/cleanup、React commit、卡片 DOM identity與畫面。
- 約 2.2 秒的保存觀察窗（隔離合成旅程）曾記錄：`tc_save_itinerary_days` 1 次、`tc_release_itinerary_trip_edit_lease` 1 次、`tc_list_itinerary_trip_edit_leases` 4 次、`/rest/v1/trips` 14 次、`other_info_items` 20 次、`tc_read_trip_participant_email_map` 98 次。此為近似觀察窗的請求計數，不完全隔離，不能直接證明每筆請求由卡片保存引起或造成閃動。
- MutationObserver 累計 254 次 mutation，包含 DOM／屬性變化，並非純視覺閃動次數，不能作為閃動量化指標。
- **2026-11-22 新增操作後請求放大觀察（詳見 ADR-002-S1 第六輪）：** 操作前約 10 分鐘窗口主追蹤 endpoints 計數為 0；手動新增一筆卡片後，短窗口（15:36:41–15:37:08 台灣時間）觀察到 participant-map RPC密集重複呼叫（來源分組 Android 190、Windows 54 POST；秒級分組有不同統計結果，待下一輪原始查詢核對），並伴隨 Trips／Other Info／Lease及Weather endpoints。這是請求放大實測證據，但未定位程式觸發鏈，亦未證明與視覺閃動直接因果；下一輪優先調查此觸發鏈。
- `tc_read_trip_participant_email_map` 的大量呼叫與 `getCloudTripRecordsStrict()` 的逐 Trip hydration N+1 模式相符；此效率問題尚未證明與本案閃動有直接因果。
- **問題分流（2026-11-23）：** 既有 viewport／scrollbar reflow 是已單獨確認的桌面水平寬度／垂直 scroll 現象與 mitigation；本次使用者新回報「按下新增保存後仍有約兩至三次畫面／資料更新才完成」屬另一個待查現象，不得逕自視為同一根因或將 viewport mitigation 當成已解決本次回報。Lease dependency候選及保存生命週期 state transitions須另以單次操作 trace驗證。
- 已曾執行 ADR-001相關 regression（`test:adr001-cloud-save-service`、`verify:adr001-s3-app-integration`）、build及 `git diff --check` 並有PASS紀錄；這些結果並不驗證閃動根因或本案改善。
- 合成卡片／旅程清理曾因瀏覽器 session timeout 受阻；不得把清理宣稱完成，亦不列為本案根因驗證停止條件。

## 本輪補充結論與改善方向（2026-11-22）

### 調查過程

1. 先以現行程式碼追查三條呼叫鏈：tc_read_trip_participant_email_map 的 Trip hydration、weather-forecast 的 APP 路徑，以及 pg_cron 的 scheduled path。
2. 再核對 migration／RPC 權限、Cron expression、快取 lease／冷卻條件，區分「固定排程」與「請求到達後才觸發」。
3. 以正式 Supabase 2026-11-19 UTC logs 做唯讀交叉統計：依 endpoint、HTTP method、authenticated／pg_net user-agent、UTC 小時分組；不讀取或保存使用者、行程、Place、token 或原始 provider 內容。
4. 對照文件 112、文件 116 與本 ADR 已有保存／Lease 調查，區分已確認事實、合理推論與尚未完成的瀏覽器因果證據。
5. 本輪未修改程式、migration、正式資料、Secrets、Cron、Edge Function 或 Git；ADR-002 維持 Proposed。

### 已確認結論

- tc_read_trip_participant_email_map 是授權編輯者讀取私人 Trip Email map 的安全 RPC。getCloudTripRecordsStrict() 先全量讀取 trips，再對每筆 Trip 呼叫一次 hydration RPC；目前沒有 session／Trip 層級快取或批次 RPC。
- 2026-11-19 UTC 正式 logs 中，participant-map RPC 約 585,179 次、trips GET 約 152,860 次，比例約 3.83 倍；主要流量集中於同一 authenticated APP session，與逐 Trip hydration 的 N+1 放大模式一致。
- weather_daily_forecasts 有固定每 6 小時 Cron（UTC 01／07／13／19）；weather_place_coordinates 有每小時過期清理 Cron。這些是正常背景排程，不是異常本身。
- 同日 weather-forecast 只有 4 次 pg_net Cron POST，另有約 13,210 次 authenticated APP POST；APP 呼叫主要集中於 03:00–05:00 UTC。因此天氣兩表的大量讀取主要是 APP 請求風暴在 Edge Function 內部造成，不能歸因為固定 Cron。
- ItineraryPage 的 Weather effect 依賴整份 daysData 物件參照；前端只合併仍在執行中的相同 fingerprint，完成後即移除去重鍵。資料參照反覆更新時，已完成的相同快照仍可能再次呼叫 weather-forecast。
- participant N+1、Weather 重複請求及 Other Info／Lease channel churn 是已確認的請求放大缺口，但目前仍是 ADR-002 的旁證／共同放大因素；尚未以 React commit、DOM node identity 與實際畫面證明其中任何一項單獨造成使用者觀察的 2–3 次視覺閃動。
- 目前最直接連結閃動的候選仍是 Lease subscription lifecycle 與 daysData 參照綁定過緊：保存過程多次產生新參照，會使 Lease effect cleanup／重建並造成 loading → ready 狀態變化；這可影響操作控制，但不等同已證明卡片 DOM remount。

### 改善方向（待核准，不代表已授權實作）

1. **第一階段：先止住前端放大。** 將 Lease subscription scope 收斂到 Trip／權限／連線等真正改變訂閱範圍的值；active-day 卡片 ID 改由最新 ref／callback 提供，不把整份 daysData 參照當作 channel lifecycle dependency。
2. **第二階段：穩定 Weather effect。** 以語意化 weather target fingerprint 取代整份資料參照；保留 in-flight dedupe，並新增短期 completed-result dedupe，只有地點、日期、時間、快取期限或使用者明確刷新時才重送。
3. **第三階段：降低 participant N+1。** 先加入 session／Trip cache 與 in-flight promise 合併；長期評估受權限逐 Trip 驗證的批次 Email-map RPC，將「每筆 Trip 一次」降為「每次全量載入一次」。
4. **第四階段：補足安全觀測。** 只記錄 app／cron、initial_load／foreground／data_change／retry 等安全分類與聚合數，不記錄 Trip 內容、Place ID、座標、token、Authorization 或 provider body。
5. **實作前驗證門檻：** 建立專用 loopback-only fixture，以 CDP／React Profiler／Network instrumentation 分別量測 Lease setup／cleanup、editLeaseStatus、React commit、列表容器存續、卡片 DOM identity、participant RPC 與 weather request；未完成前不修改程式。

### 建議驗收條件

- 相同 Trip 快照重繪不新增 participant 或 Weather request。
- 一次全量 Trip 載入不再對每筆 Trip 各發一個 Email-map RPC。
- 相同 Weather target 在短期有效期間只發出一次 APP request。
- 無天氣卡片時 weather-forecast 為 0。
- focus／visibility change 不造成請求成倍增加。
- Cron 維持既定 4 次／日，且 logs 可清楚區分 APP 與 Cron。
- 只有在 DOM identity／React commit／實際畫面證據完成後，才能把某一候選提升為閃動根因。


## 2026-11-22 補充：三次正式 logs 操作觀察
- 無操作窗口（15:38:00–15:44:51）：Edge/API、PostgREST、Auth、Function均 0；2筆 PostgreSQL checkpoint為內部訊息。
- 手機新增卡片觀察（15:36:41–15:37:08）：participant-map RPC來源分組 Android 190、Windows 54 POST，共244；秒級統計待核對，另伴隨其他 API及 Weather內部呼叫。
- 手機刪除卡片觀察（15:44:51–15:47:22）：Edge/API共280 calls，Windows Chrome實際來源 IP 210.242.52.121、User-Agent Windows Chrome 157、authenticated User ID 6a824669-5032-44cb-8fd7-c8a740459c39；Windows participant-map 60 POST、Android 97 POST，共157。逐筆logs可核對 Windows trips／tombstones／participant-map／other_info及Auth等序列。
- 判定：Windows客戶端在使用者未手動操作電腦的手機刪除事件窗口內確有請求活動，時間關聯密切，但尚未證明手機操作直接觸發Windows或與閃動有直接因果。S1下一步追查 Windows RPC呼叫點及 refresh／revision／Realtime／hydration trigger；未授權程式修改。
- 第十輪程式核對已定位全量 RPC burst 入口：`getCloudTripRecordsStrict()` 只由 `reconcileTripWorkspaceWithResult()` 呼叫；觸發入口目前確認為 session ready後 initial workspace load、pending connectivity recovery（初始 retry／online／focus／visible）、以及 App Update／Restart。指定Trip的 `refreshTripOptionsAndSelect()` 走 `getCloudTripRecord()`，不是全量 hydration。src內未找到 app_data_revision／Trip Realtime直接觸發全量 reconciliation 的呼叫鏈。
- 尚未確認手機事件窗口的Windows reconciliation實際由哪個入口啟動；目前優先待核對 connectivity recovery pending／focus-visible retry，其次 App Update／Restart。

## 階段導航
- [ADR-002-S1 根因定位與歷史比較](ADR-002-S1-root-cause-investigation.md)：原 Preview／通知衍生機制與卡片畫面閃動工作線的持續追查／驗證日誌；保留其原有 ACTIVE 項目。
- [ADR-002-S2 登入身份切換與登出生命週期](ADR-002-S2-auth-workspace-lifecycle.md)：2026-11-24 新增 Accepted 範圍；登入清單 reconciliation、登出 Loading、卡片管理／編輯旅程 Lease 清理、已送出保存與身份資料隔離。已核准直接實作，詳細證據、步驟及 S2-01～S2-14 驗收條件以 S2 文件為準。

## 本案完成條件
1. 以可重現且可觀察的證據確認或排除主要候選根因：state 更新序列、卡片 identity/key、remount、列表／資料替換、loading／conditional rendering。
2. 比較目前實際機制與歷史版本，確認「以前沒有閃動」的差異有 Git／程式證據支援，不以記憶或假設代替。
3. 明確分離已確認因果、推論及仍未驗證項目。
4. S1 原卡片閃動／排序追查工作仍依其階段紀錄及各自核准狀態執行；不得把本次新增 S2 的授權套用到 S1 尚未核准的其他修改。
5. S2 登入身份切換與登出生命週期為 2026-11-24 新增 Accepted 範圍，已核准依 S2 階段文件直接實作及驗證；其具體邊界、步驟及驗收條件見 [ADR-002-S2](ADR-002-S2-auth-workspace-lifecycle.md)。

## 2026-11-23：S1根因調查結果與修正提案

- **根因已確認（viewport／scroll reflow）**：inline卡片editor使document scrollHeight 901→1079，垂直scrollbar出現、clientWidth 1680→1665；editor關閉後document高度縮回901，scrollbar消失，clientWidth回擴。當scrollY=178時亦會因scroll range縮短而clamp至0。
- **因果對照**：Cancel在沒有 `tc_save_itinerary_days`、沒有Lease effect cleanup／setup的情況下仍重現相同scroll reset／scrollbar width reflow；卡片article node identity保持。保存時Lease effect確實多次重啟並loading→ready，但不是此scroll/viewport reflow的必要原因。
- **已核准並實作最小mitigation**：`src/index.css` 的 `html` base rule新增 `overflow-y: scroll`，固定root scrollbar以避免inline editor開／關造成clientWidth水平reflow。這不消除scrollY clamp，桌面可能常態顯示scrollbar。
- **驗證**：控制試驗已確認固定scrollbar可維持clientWidth一致；正式CSS修改後 `npm run build`（含完整既有驗證鏈）、`npm run verify:docs-links`（154份Markdown／363個目標）及 `git diff --check` PASS。尚未以修改後產品CSS完成Android實機或重新執行桌面實際UI操作驗收。
- S1 root-cause substage PASS，mitigation已核准並實作；ADR-002整體仍ACTIVE，其他Preview／通知衍生機制及請求放大調查／驗證依原範圍繼續。

## 2026-11-23：卡片上下閃動調查方法修訂

- 既有現象量測、viewport／scroll根因、Lease候選、歷史失敗與有效trace全部保留，不清除或覆寫。
- 本案新增／刪除卡片上下閃動調查已轉為程式事件因果追蹤：操作handler／state與資料更新／React render-commit／DOM identity／layout-scroll-focus／Paint及network時序整合成trace，再經原始碼核對與受控重複對照確認根因。
- 完整測試鏈及實作方案的細節、trace欄位與完成門檻以 [ADR-002-S1階段日誌](ADR-002-S1-root-cause-investigation.md) 最新2026-11-23修訂為準。舊測試計劃與證據保持歷史記錄。
- **狀態（2026-11-23 更新）：** S1 Preview／通知衍生機制拆除 slice 已完成並通過專責 verifier；Lease effect dependency 最小修正已實作，Build PASS，專用 loopback Trip 兩次保存／復原成功。新增／刪除操作的直接事件 trace、Lease effect setup／cleanup、status transition、React commit及 DOM identity 仍待量測，故尚未完成整體閃動根因驗證與 UI 驗收。下一步及測試門檻以 S1 階段日誌最新紀錄為準。Browser Use claim_tab socket timeout 不再作為唯一測試路徑；可評估已授權 Computer Use／替代 DOM instrumentation。commit／push／deploy 本輪以外的後續操作仍須另行授權。

## 2026-11-23：新增時間排列跳動與已解決提示位移項目

- **已解決（使用者回報）**：儲存／刪除期間管理欄位提示文案反覆出現所造成卡片上下移動已消失；卡片不再因該提示位移上下閃動。
- **新增追蹤（ACTIVE）**：卡片時間排序跳動，包含到達09:00、離開時間未填自動補值後跳動；到達／離開時間均填寫的另一測試曾正常，但相同標準再次輸入仍跳動。跨瀏覽器亦觀察到排列交替。
- 正式排序規則與目前 `sortItineraryItemsByTime()`／新增流程的比對及初步判斷，已記錄於 ADR-002-S1 日誌。未證實根因；下一步優先追查共享資料更新／陣列順序重新套用來源。此問題納入ADR-002後續，不另開ADR。

## 2026-11-24：新增 Accepted 範圍 — 登入身份切換與登出生命週期

### 決策狀態與授權

- **Accepted，已核准直接實作及必要隔離驗證。** 新對話依 [ADR-002-S2](ADR-002-S2-auth-workspace-lifecycle.md) 直接實作，不需重新調查已確認程式現況，也不需再次詢問本範圍是否授權。
- 本新增範圍獨立於 S1 原卡片畫面閃動／排序調查；不改寫 S1 原有狀態及未核准工作。
- 詳細證據、實作順序、草稿／已送出保存界線及 S2-01～S2-14 驗收條件，以 S2 階段文件為唯一詳細規格。

### 最新調查結論

1. **登入後清單不更新：** `useTripWorkspace.ts` 初始 Workspace effect 依賴 `isSessionReady`，未依賴 `userId`／身份變更；訪客載入完成後登入不會觸發完整清單 reconciliation。選取旅程 effect 雖依賴 `userEmail` 更新權限，但不等於更新整份旅程清單。
2. **身份競態：** `reconciliationPromiseRef` 是單一共用 Promise，沒有綁定啟動身份／Workspace epoch；guest → signed-in 亦未明確使舊 Workspace 失效。舊 Promise 可能被新身份重用，或由舊 finally 清除新 Promise。此為程式結構可確認的競態風險，尚未動態重現。
3. **登出 Loading：** `App.tsx` 的 `handleLogout()` 未重設 `isLoading=false`；Trip load 在 epoch 不符時會提前 return，跳過後續解除 Loading，兩者可共同造成登出後持續 Loading。
4. **卡片管理 Lease：** `ItineraryPage` 已有 `closeManageMode()`、`releaseEditingLease()`、`resetForm()`、`releaseManagedTripLease()` 及卸載清理；但 `closeManageMode()` 保存中會拒絕退出，卸載時 Release 也可能因 Session 已失效而失敗。登出應重用其底層清理核心，不只依賴 unmount。
5. **編輯旅程 Lease：** heartbeat 位於 `App.tsx`；既有 `closeTripEditor()` 可停止 heartbeat、清除本機 marker 並 Release `__trip__`，但 `handleLogout()` 未呼叫它。Modal 卸載不會停止 App 層 heartbeat。
6. **保存生命週期：** 卡片保存已有 `itinerarySavePromisesRef`；已送出的保存必須與未送出草稿分開處理。未送出的草稿直接丟棄；已送出保存等待既有 Promise 收斂；已確認本機保存成功但雲端待同步的正式資料／Pending 必須保留。
7. **費用簿識別：** `expenseBookTripId` 是獨立 state；登出清空 selectedTripId 後，selected Trip effect 會提前 return，可能未清除此 ID。登出須清空它，避免費用簿 hook 以舊 ID 啟動載入。
8. **隱私清理：** 既有 `clearSharedTripDataAfterAccessLoss()` 仍必須執行；其同步 localStorage 清理與附件／封面非同步清理不可因 UI reset 重排而跳過。

### 已核准修正邊界

- 以 Supabase `user.id`／identity generation 作身份隔離；身份變更時使舊 Workspace 請求失效，初始清單 reconciliation 隨身份變更觸發。
- reconciliation Promise 按身份／epoch 隔離；舊 Promise 不可污染新身份或清除新 Promise。
- 登出沿用既有卡片及編輯旅程 Lease service／RPC／scope；先停止 heartbeat、清除本機 marker，舊 Session 有效時嘗試 Release。
- 日期切換與登出共用卡片管理底層清理核心；不因一般 UI saving guard 阻止登出清理，但須先等待已送出的保存。
- 未送出草稿直接丟棄；已送出的卡片／Trip Editor 保存等待結果；已確認保存成功資料及 Pending 保留。
- 登出同步清除舊身份畫面狀態、`expenseBookTripId` 及 Loading；非同步附件／封面清理不得讓 UI 永久停在 Loading。
- Release 離線／失敗時停止本機 heartbeat 並清 marker；雲端 Lease 依既有 expiry 回收，不宣稱立即釋放。

### 不得擴大的範圍

- 不修改 Trip seed／cloud／local merge 演算法。
- 不改卡片 Save RPC、CAS、version、Pending／Recovery、Checklist、Other Info、費用簿及其他同步協定。
- 不新增草稿保護／持久化、Lease RPC、lease key、TTL 或新鎖定模型。
- 不修改 ADR-001 Accepted 契約。
- 不執行正式 Supabase、Secrets、Edge Function、部署操作。
- 程式修改及隔離測試已核准；Git commit／push／merge／tag／deploy 不在本次授權內。

### 實作與驗收入口

- **唯一直接續行入口：** [ADR-002-S2 登入身份切換與登出生命週期](ADR-002-S2-auth-workspace-lifecycle.md)。
- 依 S2 Step 1～4 實作，依 S2-01～S2-14 驗收，另完成 targeted regression tests、typecheck／lint／build、`npm run verify:docs-links` 及 `git diff --check`。
- 2026-11-24 本輪僅完成唯讀調查及文件定案，尚未修改程式、執行測試或動態重現；任何測試項目在取得實際證據前均不得標示 PASS。
