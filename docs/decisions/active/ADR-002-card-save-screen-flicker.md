# ADR-002：行程卡片新增／保存畫面閃動追查與改善評估

- **ID：** ADR-002
- **狀態：** Proposed／持續追查（尚未核准程式修改）
- **建立日期：** 2026-11-22
- **標題：** 行程卡片新增／保存期間畫面閃動根因定位及最小改善評估

## 工作目標
定位在每日行程卡片新增或保存過程中，使用者觀察到畫面閃動／反覆更新的根因，核對是否由保存協調流程中的多次 state 更新、卡片 identity／key、元件 remount 或其他資料／UI 更新造成，並比較既有歷史版本的機制。確認最小且安全的改善方式及必要驗證，避免無關重構。

## 範圍與限制
- 僅限每日行程卡片新增／保存期間畫面閃動問題及其必要保存／呈現機制。
- 不以其他既有問題（例如全量 Trips 讀取或 RPC N+1）代替本案根因；除非證據直接連結至閃動，否則只旁註。
- 目前只授權調查、證據整理、方案評估及追蹤紀錄維護；**未授權程式修改、commit、push、部署或正式資料操作**。
- 不使用 TEST-1 或正式資料庫進行測試；測試僅可採安全隔離資料及本機／非正式環境。
- 保留既有工作樹修改，不覆蓋或混入。

## 已知調查摘要（2026-11-22）
- 保存流程在本機保存／Pending更新後會多次呼叫 `setCurrentTrip`；線上流程再取得 Lease、讀取版本／單一 Trip、reconciliation、雲端 Save RPC、同步狀態更新及後續 `setCurrentTrip`。多次狀態更新是值得檢查的候選機制，尚未證明是閃動根因。
- 卡片列表已使用 `event.id` 作 sortable／React identity；缺少 ID 時採 `legacy-${activeDay}-${originalIndex}` fallback。Git 歷史確認此機制至少自 V3.10.12 時代已存在；`ensureItineraryDaysDataIds()` 只在排序、複製、時間調整等特定流程補 ID，普通保存函式不會共通正規化所有卡片 ID。一般保存若更新同一趟 `currentTrip`，App 的 `ItineraryPage` key（trip/user）不變，重新 render 不等於 remount。
- 保存時序的歷史差異已找到：`2af4db9`（2026-11-19）把本機 Pending 寫入後的 `setCurrentTrip(localRecord.detail)` 從僅離線分支移到線上／離線共用路徑；線上保存結束後仍會再次提交 `currentTrip`。這證實新增一次保存中途的父層 state 更新／render 機會，但尚未證明造成卡片 DOM 替換或肉眼閃動。
- 一般列表仍有條件式掛載：`displayedDayEvents.length > 0`；父層 `isLoading`、screen 或 `currentTrip` 條件也會卸載 `ItineraryPage`。同旅程保存時 `App` key 固定，普通 `currentTrip` 更新本身不等於 remount；目前 save 函式可見的 `setIsLoading(false)` 不會主動進入 loading spinner。
- **更具體的保存／Lease lifecycle 候選已確認：** Lease effect 原始於 `b047d01`（2026-11-01）建立，`22af34a` 為取得當日卡片 ID 集合並判斷遠端鎖定，新增 `activeDay` 及整份 `trip.content.daysData` 為 dependencies。這讓每次 `daysData` 物件參照更新都會 cleanup／重建 Lease service 與 Realtime channel，setup 期間把 `editLeaseStatus` 設為 `loading`，refresh 完成後才回 `ready`；`canModifyCard()` 在此期間暫時失效。
- 線上保存過程會多個階段更新 `currentTrip`：`2af4db9` 將 local Pending 後更新移至 online common path；一般 reconciliation 中途更新；最終從 localStorage 再 `JSON.parse` 取回 savedTrip，產生新的 `daysData` 物件參照。這些更新與 11/1 Lease dependency 疊加，存在多次 `loading → ready` lifecycle restart 的機會；分支及 React batching 決定實際次數，尚未量測。
- **目前最具體候選根因是 Lease subscription lifecycle 與每日卡片資料參照綁定過緊**，會暫停卡片管理權限／控制狀態，但尚未證明這就是使用者觀察到的 2–3 次可見閃動，也未證明卡片 DOM remount。最小方案方向是分離 Lease subscription scope 與最新 active-day IDs，但尚未授權程式修改。
- 動態 UI 驗證仍 BLOCKED：本機沒有 ADR-002 專用 fixture；歷史 `v391-local-browser` 合成旅程明確排除重用，現成 bootstrap 亦會修改既有 `v391-admin` Superadmin 角色，不符合隔離要求。需取得另建專用 loopback-only 身分／fixture 的授權後，才能觀察 effect setup/cleanup、React commit、卡片 DOM identity 與實際畫面。
- 約 2.2 秒的保存觀察窗（隔離合成旅程）曾記錄：`tc_save_itinerary_days` 1 次、`tc_release_itinerary_trip_edit_lease` 1 次、`tc_list_itinerary_trip_edit_leases` 4 次、`/rest/v1/trips` 14 次、`other_info_items` 20 次、`tc_read_trip_participant_email_map` 98 次。此為近似觀察窗的請求計數，不完全隔離，不能直接證明每筆請求由卡片保存引起或造成閃動。
- MutationObserver 累計 254 次 mutation，包含 DOM／屬性變化，並非純視覺閃動次數，不能作為閃動量化指標。
- **2026-11-22 新增操作後請求放大觀察（詳見 ADR-002-S1 第六輪）：** 操作前約 10 分鐘窗口主追蹤 endpoints 計數為 0；手動新增一筆卡片後，短窗口（15:36:41–15:37:08 台灣時間）觀察到 participant-map RPC密集重複呼叫（來源分組 Android 190、Windows 54 POST；秒級分組有不同統計結果，待下一輪原始查詢核對），並伴隨 Trips／Other Info／Lease及Weather endpoints。這是請求放大實測證據，但未定位程式觸發鏈，亦未證明與視覺閃動直接因果；下一輪優先調查此觸發鏈。
- `tc_read_trip_participant_email_map` 的大量呼叫與 `getCloudTripRecordsStrict()` 的逐 Trip hydration N+1 模式相符；此效率問題尚未證明與本案閃動有直接因果。
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
- [ADR-002-S1 根因定位與歷史比較](ADR-002-S1-root-cause-investigation.md)：唯一持續追查工作日誌。

## 本案完成條件
1. 以可重現且可觀察的證據確認或排除主要候選根因：state 更新序列、卡片 identity/key、remount、列表／資料替換、loading／conditional rendering。
2. 比較目前實際機制與歷史版本，確認「以前沒有閃動」的差異有 Git／程式證據支援，不以記憶或假設代替。
3. 明確分離已確認因果、推論及仍未驗證項目。
4. 提出範圍最小的修改方案及驗證方法；方案仍需使用者核准後才可實作。
5. 若核准並實作，完成相應 regression／實際隔離測試並記錄證據。ADR-002 在核准方案／實作之前維持 Proposed。

