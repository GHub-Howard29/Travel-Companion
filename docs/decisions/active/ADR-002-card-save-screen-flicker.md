# ADR-002：移除已淘汰的每日行程預覽／同步衍生機制並修復保存更新行為

- **ID：** ADR-002
- **狀態：** Accepted（決策持續有效）／Implementation Completed（2026-11-25；歸檔整理 2026-11-26）。S1 的 Preview／Journal 衍生機制拆除、卡片穩定性修正與 ADR-001 管理權新增範圍均已完成並隨 V3.11.5 發布；S2 登入身份切換與登出生命週期 Step 1–4 已實作，S2-01～14 全部 PASS，整體 Exit PASS。S1／S2 執行紀錄已移至 `../history/`，本 ADR 保留 Accepted 決策，不代表決策退休。Participant RPC N+1 與 Weather APP 重複請求僅為未來性能候選，未授權實作；若有新證據，須重新取證並取得實作授權。
- **建立日期：** 2026-11-22
- **修訂日期：** 2026-11-27
- **新增 Accepted 決策（2026-11-27）：** BUG 3 後端相同 route cache key 的併發 cache miss，採用資料庫持久化、具期限的 keyed reservation。每個 cache key 僅允許一個有效處理者進入 provider 查詢；其他同 key 請求等待並重讀快取，不消耗額外額度；處理者成功／失敗均以持有者識別安全釋放，逾時 reservation 可由後續請求接手；快取寫入亦由 DB 在單一 RPC 內核對 owner 與期限後條件式 upsert，避免舊處理者覆蓋新結果。快取命中不經 reservation。保留既有 route cache key、30 天快取、每日 100 次 provider 查詢額度及 Google 路線參數／結果格式；不改路線計算、Trip 編輯鎖、天氣契約或前端 UI。初始授權僅限本地程式、migration、隔離測試及 ADR 文件；不含正式 Supabase migration 或 Edge Function 部署。2026-11-27 其後已完成本機 PostgreSQL 雙 backend concurrency／SQL regression，使用者再明確授權整理文件及 commit/push；仍不包含正式部署。
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
- **2026-11-22 調查當時的候選根因：Lease subscription lifecycle 與每日卡片資料參照綁定過緊**，可能暫停卡片管理權限／控制狀態；當時尚未證明這就是使用者觀察到的 2–3 次可見閃動，也未證明卡片 DOM remount。最小方案方向是分離 Lease subscription scope 與最新 active-day IDs。後續 S1／S2 進度及目前決策依本文件後續階段紀錄與決策索引，不以本段初始調查狀態作為現行判斷。
- **2026-11-22 初始調查時的動態 UI 驗證阻塞（歷史）：** 當時 CDP DOM 操作及 UI test account signup/login 已恢復成功（`adr002-test-20261122@example.invalid`，loopback-only），但該身份處於個人帳本模式，尚無可編輯的 ADR-002 專用 Trip／fixture；重用歷史 `v391-local-browser` 或修改既有 `v391-admin` 角色均不符合隔離要求。此阻塞僅描述初始 S1 調查輪；後續 S1／S2 階段另有其驗收紀錄，不可將此句解讀為目前 S2 動態驗收仍 BLOCKED。
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

## 歷史階段與證據紀錄
- [ADR-002-S1 根因定位與 Preview／通知機制拆除](../history/ADR-002-S1-root-cause-investigation.md)：已完成並歸檔。主要卡片穩定性與排序問題已修正，Preview／Journal 衍生機制拆除及 V3.11.5 發布驗收完成；無現行 S1 待續行項目。
- [ADR-002-S2 登入身份切換與登出生命週期](../history/ADR-002-S2-auth-workspace-lifecycle.md)：已完成並歸檔。Step 1–4 實作完成；S2-01～14 全部 PASS，整體 Exit PASS（2026-11-25）。
- [ADR-002 影片切片分析與動態證據](../history/ADR-002-video-analysis.md)：已歸檔的獨立證據附件，保留影片觀察、49.5 px 管理區位移與 Lease effect loading／ready 因果追蹤紀錄。

**歸檔不改變決策效力：** 本 ADR 仍為 Accepted。新出現可重現的相關問題時，依新證據建立最小調查；Participant RPC N+1／Weather APP 重複請求不得直接沿用舊觀察展開實作。

## 本案完成條件
1. 以可重現且可觀察的證據確認或排除主要候選根因：state 更新序列、卡片 identity/key、remount、列表／資料替換、loading／conditional rendering。
2. 比較目前實際機制與歷史版本，確認「以前沒有閃動」的差異有 Git／程式證據支援，不以記憶或假設代替。
3. 明確分離已確認因果、推論及仍未驗證項目。
4. S1 原卡片閃動／排序追查工作仍依其階段紀錄及各自核准狀態執行；不得把本次新增 S2 的授權套用到 S1 尚未核准的其他修改。
5. S2 登入身份切換與登出生命週期為 2026-11-24 新增 Accepted 範圍，已核准依 S2 階段文件直接實作及驗證；其具體邊界、步驟及驗收條件見 [ADR-002-S2](../history/ADR-002-S2-auth-workspace-lifecycle.md)。

## 2026-11-23：S1根因調查結果與修正提案

- **根因已確認（viewport／scroll reflow）**：inline卡片editor使document scrollHeight 901→1079，垂直scrollbar出現、clientWidth 1680→1665；editor關閉後document高度縮回901，scrollbar消失，clientWidth回擴。當scrollY=178時亦會因scroll range縮短而clamp至0。
- **因果對照**：Cancel在沒有 `tc_save_itinerary_days`、沒有Lease effect cleanup／setup的情況下仍重現相同scroll reset／scrollbar width reflow；卡片article node identity保持。保存時Lease effect確實多次重啟並loading→ready，但不是此scroll/viewport reflow的必要原因。
- **已核准並實作最小mitigation**：`src/index.css` 的 `html` base rule新增 `overflow-y: scroll`，固定root scrollbar以避免inline editor開／關造成clientWidth水平reflow。這不消除scrollY clamp，桌面可能常態顯示scrollbar。
- **驗證**：控制試驗已確認固定scrollbar可維持clientWidth一致；正式CSS修改後 `npm run build`（含完整既有驗證鏈）、`npm run verify:docs-links`（154份Markdown／363個目標）及 `git diff --check` PASS。尚未以修改後產品CSS完成Android實機或重新執行桌面實際UI操作驗收。
- S1 root-cause substage PASS，mitigation已核准並實作；ADR-002整體仍ACTIVE，其他Preview／通知衍生機制及請求放大調查／驗證依原範圍繼續。

## 2026-11-23：卡片上下閃動調查方法修訂

- 既有現象量測、viewport／scroll根因、Lease候選、歷史失敗與有效trace全部保留，不清除或覆寫。
- 本案新增／刪除卡片上下閃動調查已轉為程式事件因果追蹤：操作handler／state與資料更新／React render-commit／DOM identity／layout-scroll-focus／Paint及network時序整合成trace，再經原始碼核對與受控重複對照確認根因。
- 完整測試鏈及實作方案的細節、trace欄位與完成門檻以 [ADR-002-S1階段日誌](../history/ADR-002-S1-root-cause-investigation.md) 最新2026-11-23修訂為準。舊測試計劃與證據保持歷史記錄。
- **狀態（2026-11-23 更新）：** S1 Preview／通知衍生機制拆除 slice 已完成並通過專責 verifier；Lease effect dependency 最小修正已實作，Build PASS，專用 loopback Trip 兩次保存／復原成功。新增／刪除操作的直接事件 trace、Lease effect setup／cleanup、status transition、React commit及 DOM identity 仍待量測，故尚未完成整體閃動根因驗證與 UI 驗收。下一步及測試門檻以 S1 階段日誌最新紀錄為準。Browser Use claim_tab socket timeout 不再作為唯一測試路徑；可評估已授權 Computer Use／替代 DOM instrumentation。commit／push／deploy 本輪以外的後續操作仍須另行授權。

## 2026-11-23：新增時間排列跳動與已解決提示位移項目

- **已解決（使用者回報）**：儲存／刪除期間管理欄位提示文案反覆出現所造成卡片上下移動已消失；卡片不再因該提示位移上下閃動。
- **新增追蹤（ACTIVE）**：卡片時間排序跳動，包含到達09:00、離開時間未填自動補值後跳動；到達／離開時間均填寫的另一測試曾正常，但相同標準再次輸入仍跳動。跨瀏覽器亦觀察到排列交替。
- 正式排序規則與目前 `sortItineraryItemsByTime()`／新增流程的比對及初步判斷，已記錄於 ADR-002-S1 日誌。未證實根因；下一步優先追查共享資料更新／陣列順序重新套用來源。此問題納入ADR-002後續，不另開ADR。

## 2026-11-25：ADR-002 S1 狀態校正與完成邊界

- 依 ADR-001 S4 2026-11-24 新增範圍結案紀錄，以及 V3.11.5 正式發布紀錄，校正本 ADR 及 S1 階段日誌。
- S1 Preview／通知衍生機制拆除已完成並正式發布；管理卡片／編輯旅程雙入口互斥及管理權鎖定新增範圍亦已完成程式、自動化及使用者人工 UI 驗收，ADR-001 新增範圍 Exit PASS。不得再列為 S1 待辦。
- 跨 Auth server-side Lease 拒絕已有 ADR-001 SR-11 雙 Auth session／JWT 自動化 API／DB 契約測試證據；不再提出額外跨 Auth 補測，不重開 ADR-001 Exit。
- 新增卡片提示位移、卡片新增／刪除上下閃動及時間排序跳動均已有修正後使用者驗收證據；不得因早期待驗紀錄將其重新列為未完成。
- Participant RPC N+1 及 Weather APP 重複請求只保存為歷史性能候選。未來處理時須重新取得最新正式 logs／指標及現行呼叫鏈，審查是否仍有改善必要，再提出明確範圍並取得使用者再次實作授權；本次不實作、不改 RPC／cache／Weather／Cron。
- S1 剩餘判斷只有一項：確認目前是否還有實際可重現的卡片閃動／保存異常。若沒有新的未解現象，不為補齊歷史 instrumentation 而重新建立 fixture 或重做已驗收行為；若有，再提出最小隔離動態調查方案並先取得必要測試授權。

## 2026-11-24：新增 Accepted 範圍 — 登入身份切換與登出生命週期

### 決策狀態與授權

- **Accepted，已核准直接實作及必要隔離驗證。** 新對話依 [ADR-002-S2](../history/ADR-002-S2-auth-workspace-lifecycle.md) 直接實作，不需重新調查已確認程式現況，也不需再次詢問本範圍是否授權。
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

- **唯一直接續行入口：** [ADR-002-S2 登入身份切換與登出生命週期](../history/ADR-002-S2-auth-workspace-lifecycle.md)。
- 依 S2 Step 1～4 實作，依 S2-01～S2-14 驗收，另完成 targeted regression tests、typecheck／lint／build、`npm run verify:docs-links` 及 `git diff --check`。
- 2026-11-24 本 ADR 初始調查輪僅完成唯讀調查及文件定案，當時尚未修改程式、執行測試或動態重現；此句只描述初始調查輪，不代表後續 S2 實作／驗收現況。S2 現行逐項狀態與整體 Exit 下一步，唯一以 [ADR-002-S2](../history/ADR-002-S2-auth-workspace-lifecycle.md) 及 [決策總索引](../README.md) 為準。

## 2026-11-27：V3.11.7 路線／天氣／日卡片清單跳動新事件（唯讀調查）

### 問題範圍與調查邊界

- 使用者於 V3.11.7 回報路線規劃與天氣預報區段不正常跳動。影片 2809.mp4、2810.mp4 的可見現象更具體為 D2／D3 日卡片清單在「單張卡片」與「當日沒有卡片」空狀態間反覆切換；不是單純天氣列重新 render。
- 另有 2811.mp4 所示天氣列／checkbox 因到達時間已過且沒有快取而隱藏，使用者已確認這是 BUG035 預期行為；該行為與本事件分開，不得修改或混為根因。
- 使用者表示操作發生於 Android 手機，當時沒有其他電腦正在編輯該 Trip；但可能有另一個瀏覽器頁面在背景開啟。正式服務 log 的相同 UA／IP／登入 Session 無法區分同一手機上的多個分頁或 PWA context。
- 本輪只允許唯讀程式／log 調查與文件紀錄；不得修改程式、正式 DB、Secrets、Edge Function、部署或 Git 發布。未執行正式資料表 SELECT／UPDATE／DELETE。

### 已確認的程式機制

1. `src/hooks/useTripDataRevision.ts` 接受外部 revision／revision gap 後可觸發 `inspectAccess()` → `onReconcileTrips()` → Workspace reconciliation。該 revision→reconcile 機制早於 V3.11.5 已存在；V3.11.5 移除約 400ms debounce，會使已接受 revision 更即時觸發 reconciliation，屬放大因素而非新引入機制。
2. `src/hooks/useTripWorkspace.ts` 的 `reconcileTripWorkspaceWithResult()` 重新取得 cloud trips／tombstones、寫入 local records、建立 `nextTrips`，並呼叫 `setTripOptions(nextTrips)`。新的 selected-trip metadata reference 可能使 selected-trip load effect 重跑 `getTripDetail()`。
3. 同一 hook 的 Pending auto-sync effect 觀察 `currentTrip`、`selectedTripMeta` 與保存 callback；重新載入 currentTrip 後，若同步狀態仍為 pending 且沒有既存 in-flight save，`shouldSkipDuplicateItinerarySave()` 不會阻止再次保存。
4. `src/components/ItineraryPage.tsx` 的 Weather effect 依賴 trip/day data 參照；重新 hydration 可再次觸發天氣請求。Weather `ineligible` 且沒有 cache 的分支只會將 `showWeather:false` 回寫，不會直接刪除卡片，故不足以單獨解釋整日清單消失。
5. `src/services/itineraryCloudSaveService.ts` 將完整 `p_days_data` 傳給 `tc_save_itinerary_days`；migration `20261120120000_adr001_stage1_trip_itinerary_edit_enforcement.sql` 使用 `jsonb_set(..., '{daysData}', p_days_data, true)` 替換整份 `content.daysData`。不同 page context 若提交不同／過期快照，具備覆寫其他日卡片陣列的條件。
6. `APP_SOURCE_CLIENT_ID` 為 page instance 級識別；Lease client ID 使用 `sessionStorage`，不同分頁／PWA context 可具有不同 ID。外部 revision 可被視為 foreign source。這支持多 context 競態假設，但目前沒有 log 能直接映射每筆 RPC 到 page instance。
7. `src/utils/itinerarySaveGate.ts` 的 `saveItineraryWithRevisionNotice()` 先呼叫 `checkForRemoteTripChange()`，但 revision 僅作通知、不阻擋保存；若 `acceptRevision()` 判定有變更，會以 `void inspectAccess()` 非同步啟動 reconciliation，之後保存仍繼續。故同一 page context 內也存在「revision reconciliation 與 save 同時進行」的重疊窗口，不必然要求第二個頁面同時寫入。
8. `saveItineraryTripDetail()` 在取得 Trip Lease 之前，先把呼叫端傳入的 `nextTrip.content.daysData` 寫入共享 local Trip record 並建立 Pending state；Lease claim、讀取 cloud version／Trip、revision 檢查及 RPC 都在其後。Lease 可序列化雲端寫入，但不能阻止不同 page context 在 claim 前先以各自 snapshot 更新共享本機狀態。這是目前比「兩個 context 同時持有雲端 Lease」更精確的競態候選；雲端 Lease 本身仍應阻止不同 client 同時成功持有。
9. `useTripWorkspace.ts` 的 `storage` event listener 只在 `travel_companion_custom_trips` key 改變且選取 Trip 已從 cache 消失時清除畫面；若 Trip 仍存在但 `daysData` 被另一個 page context 更新，該 listener 不會同步更新本頁 `currentTrip`。`tripStorage.ts` 的 `saveTripRecord()` 透過 `upsertStoredTripRecord()` 對整個 localStorage trip array 執行 read-modify-write；不同 context 的寫入可彼此覆蓋。這讓各頁面記憶體中的 currentTrip 與共享 local cache 更容易分歧，需納入雙 context 驗證。

### 正式服務 log 觀察（唯讀）

- 影片時間與正式服務 log 對齊：2809.mp4 約 `2026-11-26T13:20:29Z`、2810.mp4 約 `2026-11-26T13:20:48Z`；檢查窗口為 `2026-11-26T13:19:30Z` 至 `13:22:00Z`。
- 該窗口約 88 秒觀察到：1,310 次完整 `trips` list GET、7,954 次 `tc_read_trip_participant_email_map`、149 次 `tc_save_itinerary_days` POST（全部 HTTP 200）、150 次 `tc_read_itinerary_version`、151 次 Lease claim POST、67 次 Lease release POST（另有 1 次 OPTIONS preflight）、2 次 Lease renew POST、3 次 Lease list POST、197 次 `weather-forecast` 呼叫，以及 34 次 Realtime `SocketJoinRateLimitReached`。
- 同窗口亦有 PostgREST `Thread killed by timeout manager` 記錄；這顯示服務負載／請求放大，但不能單獨作為清單覆寫的因果證據。
- 149 次 Save RPC request body size 分布：880／881 bytes 共 56 次、1,168／1,169 bytes 共 75 次、3,742／3,743 bytes 共 18 次。13:20:09.114 前後三組 body length 各增加 1 byte，與 Lease release 開始時間重合；這只證明多組不同 payload 大小，不代表已還原實際 `daysData`。
- 149 次 Save 全部來自同一 auth user、同一 authenticated session、同一 source IP 與同一 Android Chrome Mobile User-Agent；無法排除同一手機的第二個 Chrome tab、PWA standalone 或背景頁面。
- Lease renew 發生於 13:19:43.307 與 13:19:58.297，正好相隔 15 秒；第一筆 release 在 13:20:09.114。程式的 `ITINERARY_EDIT_LEASE_HEARTBEAT_MS` 為 15,000 ms，但 App Trip editor 與 ItineraryPage manage mode 都使用同一 heartbeat，因此只能確認有 managed Trip Lease 生命週期轉換，不能辨認是哪個 UI／page context。
- Gateway logs 有 request_id／trace_id、content_length、user-agent、auth session 等欄位，但沒有 RPC request body 的實際 `p_days_data`、`p_client_id` 或 page/tab identity。postgres_logs 僅 3 筆，沒有 `tc_save_itinerary_days` 或 Lease function 記錄；因此尚不能確認哪筆 Save 寫入空 D2／D3，也不能定位是哪個 context 發出該請求。

### 目前判斷（證據層級）

- **已確認：** 使用者影片顯示整日卡片列表與空狀態交替；正式服務在同一時間窗口出現極高的 workspace list hydration、Save RPC、Lease、Weather 呼叫；Save RPC request body 尺寸不同；Save RPC 寫入的是整份 `daysData`。
- **強力支持的機制假設：** 不同 page context 可持有不同 full `daysData` snapshot；保存流程在 Lease claim 前先寫 local Trip／Pending，故 Lease 失敗仍可能覆寫共享本機資料。foreign revision 會以 `void inspectAccess()` 啟動 workspace reconciliation；其 `decideTripReconciliation()` 會讀取並可能重寫 shared local／Pending，但 selected Trip 仍存在時不會直接更新 `currentTrip`。後續若 `currentTrip` 因 reload／hydration 改變，Pending auto-sync 可再次保存 stale snapshot。V3.11.5 debounce 移除可能加速此循環，但正式事件時序仍未證實。
- **尚未證實：** 實際送出空 D2／D3 的 request、該 request 的發送 context，以及正式事件中是否確有第二個背景頁面參與。自動保存 caller 已於 2026-11-27 追完，詳見下方 caller 與跨 context 追查。
- **排除單因：** Weather ineligible 分支只改 `showWeather`，無法單獨造成卡片刪除；BUG035 到達時間過期隱藏天氣列屬預期行為，不是本事件修正目標。

### 自動保存 caller 與跨 context 寫入順序追查（2026-11-27）

- 本階段詳細執行紀錄與瀏覽器測試結果：[`ADR-002 V3.11.7 regression investigation`](ADR-002-V3.11.7-regression-investigation.md)。
- `saveItineraryTripDetail()` 的自動保存 caller 已完整定位：一是 `ItineraryPage.tsx` Weather effect，在結果為 `ineligible` 且無可用 cache 時，只將符合條件卡片的 `showWeather` 設為 `false`，再以 `weatherTripRef.current` 建立並保存完整 `daysData`；二是 `useTripWorkspace.ts` Pending auto-sync effect，在 Session ready、online、已選取可寫 Trip 且 sync state 為 `pending` 時，以 `currentTrip` 加上 `pendingDaysData` 呼叫同一保存函式。其餘 `ItineraryPage` 呼叫點均屬使用者操作（排序、複製日期、時間調整、封面、路線估算、卡片新增／刪除），目前未發現第三條自動保存入口。
- Pending auto-sync 的同頁重入保護已存在：`itinerarySavePromisesRef` 讓同一 Trip 的重入先等待既有 Promise；`shouldSkipDuplicateItinerarySave()` 只在 pending 快照相同且 `hasPriorSaveInFlight=true` 時略過。既有 `test:p0-pending-autosync-idempotency` 只驗證此 helper 的狀態組合與靜態掛載，未涵蓋跨 context 的共享 localStorage 寫入順序。
- **新增的直接競態證據：** `saveItineraryTripDetail()` 在取得 `__trip__` Lease 前，先依呼叫端快照執行 `saveTripRecord()` 與 `writeItinerarySyncState()`（約 L1073–1077）；Lease claim 才在後續約 L1097 執行。故另一 page context 即使稍後因 Lease 未取得而不能寫雲端，仍可能先把自己的舊 `daysData` 與 Pending revision 寫入共享 localStorage。已持有 Lease 的保存流程隨後會在約 L1105–1107 讀取 Pending revision；若已被另一 context 改寫，便中止本次雲端保存。這證明「Lease 可序列化雲端寫入」不等於「Lease 前的本機快照／Pending 寫入已被序列化」。
- `itinerarySyncStorage.ts` 的 `writeItinerarySyncState()` 直接寫入 origin-shared localStorage；`useTripWorkspace` 的 `itinerarySyncSnapshot` 僅由本 hook 的 `refreshItinerarySyncState()` 更新，未見跨 context 的 storage subscription。既有 Trip storage listener 在 Trip 仍存在時不會將其他 context 更新的 `daysData` 套回目前 `currentTrip`。因此不同 context 可同時保留彼此不一致的 React state，而共享 localStorage 已被另一 context 改寫。
- **瀏覽器雙 context harness（2026-11-27）：** 兩個真實 Chrome page context 在獨立 origin、synthetic localStorage、stub Lease／RPC 下，使用實際 tripStorage、itinerarySyncStorage 與 itinerarySync helper 重播 A 先寫 local／Pending 並取得 Lease，B 以 stale empty D2／D3 snapshot 在 Lease claim 前覆寫後遭拒的順序。A 收到 storage event；測試 listener 按實際 source 條件判斷 selected Trip 仍存在而不刷新 currentTrip；A 因 Pending revision 改變而 abort，cloud 未寫入。詳細結果見本 ADR 階段文件。
- **Workspace reconciliation 驗證：** 使用實際 `decideTripReconciliation()` 與 `reconcilePendingItinerarySyncState()`，確認 stale B Pending 可在 cloud baseline 未變時被 rebase 為 pending empty D2／D3，改變 revision 並重寫 local Trip；selected Trip 仍存在時，原始碼核對 reconcileTripWorkspaceWithResult 只更新 tripOptions，不會直接更新 currentTrip。
- **Hydration 觸發鏈已定位：** 初始 workspace load 先執行 reconcileTripWorkspace；selected Trip 載入 effect 再讀取 Pending／Conflict，直接以 pendingDaysData 覆蓋 tripData.daysData 並 setCurrentTrip，觸發 Pending auto-sync。App update/restart 也會 reconcile 後 reloadCurrentTrip；openEditTrip 則持有同頁 Trip Lease 後 reloadCurrentTrip(true)。Pending effect 未檢查 locally-held Trip editor Lease；同頁 sessionStorage client ID 可被 SQL claim 視為同一 owner/client 重新 claim。這些是可觸發路徑，尚未證明正式事件當時發生。
- **Pending auto-sync 重試驗證：** 模擬後續 currentTrip hydration，按實際 effect 條件讀取 pending；在 A release Lease 後，B retry 取得 Lease，實際 merge helper 將 stale deletion 合併到原 cloud baseline，stub RPC 可將空 D2／D3 寫入 cloud version 2。實際 shouldSkipDuplicateItinerarySave() 只在 prior save in-flight 時略過相同 Pending snapshot；prior save settled 後不再略過，因此後續 hydration 可重試 stale Pending。這證明後續 hydration 若發生，stale Pending 可能成為雲端最終資料；React hook mount 與真實 Lease／RPC 未啟動。
- **其他分支驗證：** Weather ineligible mapping 只切換 `showWeather`，卡片 ID／總數不變；實際 `saveItineraryWithRevisionNotice()` helper 在 deferred `inspectAccess` 尚未完成時已啟動 save，確認 revision notice gate 不等待 access reconciliation。
- **證據結論：** Lease 前 shared local／Pending overwrite 已由瀏覽器雙 context harness 重現；workspace reconciliation 與後續 Pending auto-sync 的條件式 stale writeback 亦已驗證。正式事件的實際 request body、發送 page／client ID，以及後續 hydration 是否發生仍未證實；根因仍為強力支持的候選，不提升為正式事件已完全定位。

### 已執行驗證與未完成項目

- `npm run verify:trip-lifecycle`：PASS。
- `npm run test:p0-pending-autosync-idempotency`：PASS；此 repository test 覆蓋 helper 狀態組合與靜態掛載。多 page context、foreign revision、不同完整快照、workspace reconciliation 與 hydration 後 pending retry 已另以瀏覽器隔離 harness 驗證；修正後 Lease reuse／Claim 順序／conditional release 亦完成四項雙 Chrome Context 回歸，完整結果見階段文件。
- `npm run verify:v364-trip-data-revision` 曾出現靜態 verifier 的 source-format／regex expectation failure；這不是 app runtime failure，尚未進一步修正或重新執行，與本次修正範圍無直接關聯。
- 本機 Supabase stack 可用，但本機 DB 沒有手機上的該 Trip，不能以本機現有資料重現正式事件。未對正式 DB 資料表執行查詢。
- 天氣／地圖快取與 Trip Lease 邊界已完成 source／tag diff 核對：一般天氣與路線快取／顯示不使用 Trip Edit Lease；僅天氣 ineligible 自動停用設定會進入 Trip 保存流程，並由中央保存函式取得暫時 Lease。該分支已結案，不追加雙 Context 測試，詳見階段文件。

### 下一步與保留未知

1. 本次程式修正及本機驗證已完成；天氣／地圖快取分支不再追加測試。
2. 正式事件的 page／client ID、實際 request body 與後續 hydration 時序仍未知；Gateway log 缺少必要欄位，現有證據無法定位正式事件的實際發送 context。除非取得新的可用證據及明確授權，不新增 instrumentation、不查詢正式資料表、不部署。
3. 詳細修正內容、回歸條件、天氣／地圖邊界結論及驗證結果見 `ADR-002-V3.11.7-regression-investigation.md`。

**本輪狀態：** 已在既有 ADR-001／ADR-002 契約內修正 Lease reuse、temporary Claim 順序及 conditional release，未擴大 Accepted 決策。修正後雙 Chrome Context 四項隔離回歸、本機 Pending／Recovery／S3 integration／TypeScript／ESLint／完整 build 均 PASS。天氣／地圖快取邊界已以原始碼證據確認並結案，不需額外整合測試。正式事件的實際發送 page／client、request body 與 hydration 時序仍未定位；這是正式事件歸因缺口，不影響本次修正及本機驗證結案。
