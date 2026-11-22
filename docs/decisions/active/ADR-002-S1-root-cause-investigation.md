# ADR-002-S1：卡片保存畫面閃動根因定位與歷史機制比較

> 工作狀態：ACTIVE／調查未完成。此文件是本案持續追查日誌唯一維護位置；尚未授權修改程式。

## 目標及工作邊界
定位卡片新增／保存期間畫面閃動，驗證保存流程、React state 更新、卡片 key／identity、元件 remount／conditional render及歷史程式差異。只追查與本現象直接相關的機制；不因請求數量較高就擴大至全量 API 整理。

## 2026-11-22 初始紀錄

### 已確認／觀察
- `useTripWorkspace.ts` 的卡片保存流程：先準備本機 record／Pending、寫入本機、刷新 sync state、更新 `currentTrip`；線上後取得 Lease、讀取 cloud version及單一 Trip、reconciliation、更新 pending/sync state、執行 Save RPC，保存成功後再更新 `currentTrip`；不同分支可能多次更新該 state。
- `ItineraryPage.tsx` list render採 `event.id` 或 legacy index fallback 作 identity，並用於 SortableCard。需追查 id 保持及 component lifetime。
- 請求／mutation計數已記錄於 ADR-002 主檔摘要，計數屬近似觀察，不是根因證明。
- `tc_read_trip_participant_email_map` N+1 pattern已被辨識，但尚無因果證據連結至閃動，暫不列為本案主要原因。

### 未確認／候選
1. 保存期間多次 `setCurrentTrip`／sync state update是否令卡片區域短暫重置或重新渲染，是否為實際閃動原因。
2. card IDs在本機保存、cloud reconciliation及同步後是否維持一致；legacy index fallback是否可使 key變動。
3. 保存期間是否由 loading／conditional rendering、資料替換、父層 key、sortable transition或 layout effect導致 remount／可見跳動。
4. 以前版本是否使用不同 state／保存／列表呈現方式，且差異直接解釋目前現象。

### 下一步（按順序）
1. **已完成（2026-11-22）：** 檢查列表／父層 key、條件式掛載及 SortableCard identity；一般有效 ID 的新增／編輯／刪除會保留既有 ID。
2. **已完成（2026-11-22）：** 比較 `ensureItineraryDaysDataIds`、一般保存／reconciliation與 Git 歷史；確認 `22af34a` 將 `trip.content.daysData` 加入 Lease effect dependencies，`2af4db9` 將 local Pending 後 `setCurrentTrip` 移至 online common path。
3. **目前 ACTIVE：** 取得 ADR-002 專用 loopback fixture 的明確授權，完成 CDP 動態量測 Lease effect setup／cleanup、`editLeaseStatus`、React commit、卡片 DOM identity及實際視覺變化。不得操作歷史 synthetic Trip、改動既有 Superadmin、使用 TEST-1 或正式 DB。
4. 動態證據確認後，彙整最小方案供核准；未核准前不修改程式。

### 狀態
- **PASS**：已識別需優先追查的保存 state更新序列與卡片 identity。
- **PENDING**：根因證明、歷史差異比較、可重現證據、改善方案審查。
- **禁止**：自行修改程式、commit/push/deploy、使用 TEST-1／正式 DB測試。

## 2026-11-22 第一輪調查：列表 identity、掛載條件與保存時序

### 已確認證據

1. **一般重新 render 不等於卡片 remount。** `App.tsx` 的 `ItineraryPage` 只有在 `isLoading`、screen 不再是 itinerary 或 `currentTrip` 為 null 時才離開 render tree；其 React key 固定由 `selectedTripId` 與 `userEmail` 組成，不依 `currentTrip` 物件參照。正常保存更新同一趟 `currentTrip` 不會因 key 改變而 remount 整個 `ItineraryPage`。
2. **卡片列表 key 以卡片 ID 為主。** `ItineraryPage.tsx` 的 `SortableContext.items`、列表 `Fragment key` 及 `SortableCard.id` 都採 `event.id`；只有缺少 ID 才使用 `legacy-${activeDay}-${originalIndex}`。`SortableCard.tsx` 僅以傳入 id 呼叫 `useSortable`，自身沒有額外會強制 remount 的 key。
3. **舊版本已採用相同列表 key 機制。** `git show b047d01:src/components/ItineraryPage.tsx` 與 `git show 2af4db9:src/components/ItineraryPage.tsx` 均可見上述 `event.id`／legacy index fallback；至少自 V3.10.12 時代已存在，不能把它當作 ADR-001 最近新增的機制。
4. **ID 正規化不是一般保存的共通步驟。** `ensureItineraryDaysDataIds()` 會對缺 ID、重複 ID（包含跨日重複）產生新 ID；目前在排序、複製、時間調整等明確操作流程呼叫。`saveItineraryTripDetail()` 本身直接保存呼叫端提供的 `daysData`，沒有全域呼叫此 helper。因此目前沒有證據支持「每次普通卡片保存都會自動重建所有 legacy IDs」。
5. **線上保存的 currentTrip 更新時序在 2026-11-19 改變。** commit `2af4db9` 將 `saveTripRecord(localRecord)`、寫入 Pending、`refreshItinerarySyncState()` 與 `setCurrentTrip(localRecord.detail)` 移到線上／離線共用的本機保存階段；舊版這組狀態更新只位於 `!navigator.onLine` 分支。線上流程完成雲端 reconciliation／Save RPC 後仍會再次 `setCurrentTrip`。故目前線上保存比該舊版多一次保存中途的 parent state commit／render 機會。
6. **本機 Trip Lease 已被現有未提交修改排除於 remote UI state。** 工作樹中 `ItineraryPage.tsx` 的既存修改會 filter 掉 owner 為本 client 的 lease，變更屬於使用者既有工作；本次未更動它。這與文件 116 的近期 Lease Realtime 閃動調查相關，但本次未重做該實測或將其效果視為已驗證。

### 判定與限制

- **已確認的機制差異：** 2026-11-19 保存流程開始在雲端保存完成前先把本機 Pending 資料推入 `currentTrip`，隨後雲端完成時再更新一次。這能解釋保存期間同一列表接收多個資料版本／render 時點，是目前比「穩定 ID 本身」更具體的候選原因。
- **尚未證明因果：** React render 不代表 DOM node 被替換；若所有卡片 ID 穩定、列表非空且父層 key 未改，React 可保留既有卡片節點。現有靜態程式碼及 Git 差異不能證明肉眼看到的 2–3 次閃動由上述中途提交造成。
- **legacy key 風險仍成立但有條件：** 無 ID 卡片使用原始索引作 key，若其列表插入、刪除、重排或 ID 被補齊，後續 key 可能改變；但普通保存不會自動執行全域 ID 正規化，仍需找到實際保存操作會否觸發該變動的證據。
- **沒有找到普通保存必然卸載列表的條件：** 保存函式中 `setIsLoading(false)` 本身只會解除 loading，不會把頁面切為 loading spinner；本輪 `useTripWorkspace.ts` 未找到 `setIsLoading(true)` 呼叫。`displayedDayEvents.length > 0` 的條件會在列表由非空變空時卸載列表，但尚無證據顯示正常保存會令卡片數變成 0。

### 本輪證據位置

- `src/App.tsx`：`isLoading` 外層條件、`currentScreenType === "itinerary" && currentTrip`、`ItineraryPage` key。
- `src/components/ItineraryPage.tsx`：`currentDayEvents`／`displayedDayEvents`、`SortableContext.items`、`sortableId`／`Fragment key`、列表非空條件。
- `src/components/SortableCard.tsx`：`useSortable({ id })`。
- `src/utils/itineraryOrder.ts`：`ensureItineraryDaysDataIds()`。
- `src/hooks/useTripWorkspace.ts`：`saveItineraryTripDetail()` 本機 Pending／雲端 Save 前後狀態更新。
- Git：`2af4db9` 與其 parent 的 `saveItineraryTripDetail()` 差異；`b047d01`、`2af4db9` 的列表 identity 歷史。

### 下一步

1. 追查 `ItineraryPage` 一般新增／編輯／刪除操作的 `daysData` 組裝方式，確認它們是否保留既有 ID、是否有任何保存路徑改變卡片數量或 identity。
2. 對 `2af4db9` 之後的 commits 比對保存路徑，確認是否有後續改動再增加父層更新、loading 或 conditional render 轉換。
3. 在安全隔離環境建立精確觀察：同一次線上保存記錄 render commit、卡片 DOM node identity、列表容器存在狀態及視覺變化；不可使用 MutationObserver 總數代替。
4. 根因仍未證實前不修改程式；完成差異／觀察後提出最小修正方案供核准。

## 2026-11-22 第二輪調查：一般新增／編輯／刪除與後續保存提交

### 新增證據

1. **一般新增／編輯／刪除會先正規化 ID。** `saveItem()` 與 `deleteItem()` 都從 `ensureItineraryDaysDataIds(trip.content.daysData)` 產生穩定資料；新增卡片使用 `createItineraryItemId()`，編輯沿用 `currentEvents[editingIndex].id`，刪除只從陣列移除目標卡片。排序、複製及時間調整也先正規化，再保留既有 ID。故有效且唯一的 ID 不會在這些操作中無故重新產生；若歷史資料仍有缺 ID／重複 ID，首次執行上述操作會補正並可能令受影響卡片 identity 轉換一次。
2. **缺少 ID 的卡片本身不可進入一般編輯。** `startEditItem()` 在 claim 前檢查 `event.id`，缺失即拒絕編輯；刪除亦在 ID 正規化及 lease 檢查後才保存。這降低普通編輯期間由 legacy index key 改變引起全列表 remount 的可能，但首次正規化的 legacy 資料仍需留意。
3. **新增卡片可能改變其後無 ID 卡片的 index fallback。** 新增先補正整份資料 ID，再產生新卡片 UUID、依時間排序；若輸入資料本來有缺 ID／重複 ID，fallback key 會在該次操作切換成正式 ID。當所有卡片 ID 已有效且唯一，新增只新增一個新 key，其他卡片 key 保持。
4. **後續歷史提交的影響有分流。** `a4b665c` 增加 duplicate Pending save short-circuit，沒有改變普通列表 identity；`e9e85a9` 在「套用衝突選擇」路徑增加 Pending 寫入後的 `setCurrentTrip(record.detail)` 及後續同步，但該路徑不是一般卡片新增／編輯／刪除的直通保存。`93f7d56` 的相關 `setCurrentTrip(savedDetail)` 修改屬旅程基本資料 `saveCurrentTripDetail()`，不是每日卡片保存入口。
5. **lease 即時刷新不等於卡片必然 remount。** 正常卡片新增不先 claim 單卡 lease；保存進 `saveItineraryTripDetail()` 時 claim Trip lease。若 Realtime handler將本機 Trip lease納入 `currentEditLeases`／`editLeases` 並替換 state，ItineraryPage 會重新 render，但只在該 state參與列表條件／key或引起父層條件改變時才會卸載／替換卡片。工作樹已有本機 owner filter修改但尚未有精確 DOM證據證實其視覺效果。

### 本輪判定

- **一般新增／編輯／刪除（資料已有有效 ID）：** 程式碼路徑保留既有 ID；父層 `ItineraryPage` key 也穩定，因此目前沒有靜態證據顯示這三種操作會把整份卡片列表 key 全面改變或必然 remount。
- **含 legacy／重複 ID 的首次正規化：** 是可驗證的 identity 變更情境，需在隔離資料中量測影響範圍；目前不能說每次保存都會發生。
- **線上保存中途提交：** `2af4db9` 所引入的中途 `currentTrip` 更新仍是一般保存最具體的已確認歷史差異；它增加 render 時點，但因果仍待 DOM identity／畫面觀察。
- **其他歷史改動：** `a4b665c`／`e9e85a9`／`93f7d56` 不能不分路徑地當成一般卡片保存閃動根因。

### 下一步

1. 精確追查 `ItineraryPage` 的 Lease Realtime event/list refresh：本機 Trip Claim／Release 前後會觸發哪些 state更新；區分只刷新 remote lease map、編輯鎖提示，還是能改變列表資料／條件。
2. 檢查 `2af4db9` 前後線上保存時 `currentTrip` 兩次資料是否有實際差異（例如 reconciliation回傳順序／內容差異），確認第二次提交是否只變更 metadata或真的替換 `daysData`。
3. 以隔離瀏覽器對有效 ID 與 legacy ID 兩種資料分別量測卡片 DOM node identity、列表容器是否卸載、畫面截圖／視覺閃動；同時保留原始資料，不使用 TEST-1／正式 DB。
4. 根因未經精確觀察證實前，不修改程式；完成後提出最小方案供核准。

## 2026-11-22 第三輪調查：Lease effect 生命週期

### 已確認證據

- `ItineraryPage` 的 Lease effect dependencies 包含 `trip.content.daysData`（及 `activeDay`、`canUseEditLeases`、`supabase`、`trip.id`）。一般卡片保存令 `currentTrip` 的 `daysData` 換成新物件後，React 會 cleanup 舊 effect，再建立新的 Lease effect、重新載入 service、建立 channel，並先呼叫 `setEditLeaseStatus("loading")`，初次 `refresh()` 完成後才回到 `ready`。
- 保存中途 `setCurrentTrip(localRecord.detail)` 會使上述 effect 重新執行；雲端保存完成後第二次 `setCurrentTrip(savedTrip)` 若 `daysData` 又是另一個新物件，也可能再次觸發 effect。此機制可造成每次保存過程重啟 Lease 查詢／訂閱及 `loading → ready` state變化。
- `canModifyCard()` 依賴 `hasCurrentEditLeaseList`，而其條件包含 `editLeaseStatus === "ready"`。因此 effect 重啟期間會暫時使卡片管理操作權限判定為 false；這與列表 UI狀態有直接關聯，並非純背景讀取。
- 本機修改已 filter 掉由此 client 所有的 Trip Lease rows，但未改變 effect 本身對 `trip.content.daysData` 的 dependencies；因此它能避免本機 Claim／Release結果被納入 remote lease map，卻不能避免保存造成 effect cleanup／重建及狀態回到 loading。
- Lease effect 的 `setEditLeases(next)` 只在 `refresh()` 完成時更新遠端租約 map；列表資料 `currentDayEvents` 直接來源 `trip.content.daysData`，並未使用 `editLeases` 組成或排序。普通情況下 Lease map 更新會令 `ItineraryPage` re-render，但不會直接改變卡片列表項目或 React key。只有偵測到真正 remote Trip lease 時，effect才會關閉排序／時間調整模式；它沒有直接刪除或重置 `daysData`。

### 本輪判定

- **新增的具體候選機制：** `daysData` 物件參照變動使 Lease effect 全量 teardown／resubscribe，並短暫清空「ready」狀態。這是普通保存會確定觸發的額外 UI state transition，可能造成管理介面重複刷新／操作狀態閃變。
- **與 DOM 閃動的因果仍未證實：** Lease effect重啟不會自己卸載 `ItineraryPage` 或重建卡片 DOM；是否可見的閃動，需由 React commit／DOM node identity及實際螢幕畫面觀察證實。
- **最小調查方向已收斂：** 應確認 Lease effect是否必須依賴整份 `daysData`，或只需依賴 trip scope／管理模式／active day；但這只是方案候選，ADR-002 尚未授權程式變更，不能先行修改 dependency。

### 證據位置

- `src/components/ItineraryPage.tsx`：Lease effect約 537–654 行；`canModifyCard()` 約 534 行；列表 `currentDayEvents`／`displayedDayEvents` 約 916 行及列表 render區。
- `src/hooks/useTripWorkspace.ts`：`saveItineraryTripDetail()` 本機保存及雲端保存後更新 `currentTrip`。
- 工作樹未提交差異：`ItineraryPage.tsx` 目前只額外排除本 client owner lease row，未移除 `trip.content.daysData` dependency；本輪保留該差異。

### 下一步

1. 對比 Lease effect 最初引入時的 dependencies 與現有程式，確認 `trip.content.daysData` 是否為歷史上為解決特定問題後新增的依賴。
2. 精確比較本機保存版本與雲端最終版本的 `daysData` 參照／內容如何流動；若內容相同但物件不同，確認每次保存必然重新觸發 effect的範圍。
3. 建立隔離瀏覽器觀察：在有效 ID 資料保存前後記錄 Lease effect setup／cleanup 次數、`editLeaseStatus` transition、React commit、卡片 DOM node identity及實際畫面；再用少量 legacy ID fixture覆蓋一次 ID normalization情境。
4. 未完成因果證明及最小方案審查前不修改程式。

## 2026-11-22 第四輪調查：Lease dependency 歷史目的與保存資料參照

### 歷史定位

1. `git blame HEAD -L 537,654 src/components/ItineraryPage.tsx` 與 `git show 22af34a^/22af34a` 確認：Lease effect 原始於 `b047d01`（2026-11-01 15:57）建立，當時 dependencies 為 `[canUseEditLeases, supabase, trip.id]`；`22af34a`（同日 18:34）為判斷「當日卡片是否被其他裝置編輯」才加入 `activeDay` 與 `trip.content.daysData`。
2. 新增該依賴的直接目的，是讓每次 Lease `refresh()` 以目前當日卡片 ID 集合對比回傳 Lease rows，並計算 `hasRemoteLeaseOnActiveDay`。這個比對可在 `refresh()` 執行時讀取最新 `daysData`，不必然要求對整份物件參照變動就 teardown／重建 channel；但現有寫法將資料變更與 effect lifecycle 綁在一起。
3. 本機未提交修改只排除 owner 為本 client 的 Lease rows，沒有變更上述 dependency；本次未觸碰此修改。

### 保存路徑資料參照分析

1. `saveItineraryTripDetail()` 在 local Pending 階段先 `setCurrentTrip(localRecord.detail)`；這是 `2af4db9` 從離線分支移至共用路徑的新行為。
2. 一般 reconciliation 會在中途再執行 `setCurrentTrip(current => ({...current, content: {...current.content, daysData: reconciledState.pendingDaysData}}))`；成功後亦會執行最終 `setCurrentTrip(current => savedTrip)`。`already-synced`、conflict、CAS recovery 等分支則另有其更新次數，故不能將整條保存路徑簡化成恆定兩次提交。
3. `saveTripRecord()` 經 `upsertStoredTripRecord()` 寫入 localStorage；稍後 `readStoredTripRecords()` 會 `JSON.parse` 成新物件。因而一般 online success 的 final `savedTrip` 取自重新解析的 storage，會是新的 `detail.content.daysData` 物件參照；初次 `localRecord.detail` 亦由呼叫端更新資料組成，通常與上一份 currentTrip.daysData 不是同一參照。中途 reconciliation 的更新也明確以新 `content` 及 `daysData` 參照建立物件。
4. React effect dependency 以參照比較，因此當這些 `daysData` 參照逐次變更時，Lease effect 會分別 cleanup／setup，而非只 re-render；setup 內 `setEditLeaseStatus("loading")`，refresh 成功後設為 `ready`。這使一次普通 online save 有多個可觸發 Lease lifecycle restart 的機會。實際觸發次數仍由 reconciliation branch、React batching、物件是否同參照等決定，本輪未執行 UI instrumentation，不能宣稱每次固定重啟幾次。

### 本輪判定

- **歷史目的合理但 lifecycle coupling 過廣：** 需要的是最新當日卡片 IDs 參與遠端 Lease 判斷；目前實作把整份 `daysData` 物件參照納入訂閱 effect，讓行程內容更新也重啟 Lease service/channel。
- **保存過程會多次產生新資料參照：** 普通 online success 路徑存在本機 pending、reconciliation pending、final storage readback 多個更新點；與 11/1 dependency 疊加後，可導致同一保存流程多次 `loading → ready`。
- **最具體且可直接測試的候選根因：** Lease effect 的 subscription lifecycle 不應隨每日卡片內容每次更新而重啟；它目前造成的 ready/loading state flap 會暫停 `canModifyCard()`，足以影響卡片操作控制及相關 UI。仍須以瀏覽器證據確認是否與使用者看到的 2–3 次畫面閃動一致；不等同已證明卡片 DOM remount。
- **最小修正方向（尚未授權實作）：** 將 Lease channel/service setup 的 dependencies 收斂到 trip scope、permission/connectivity 等真正改變 subscription scope 的維度；對 active-day 卡片 ID 比對改由 ref／最新 callback state 提供，避免將整份 `daysData` 物件參照當作 subscription lifecycle dependency。此方向需要驗證 remote lease detection、active day 切換、trip switching 及 reconnect 後仍即時正確。

### 本機 UI 驗證安全邊界

- `npm run regression:local:status` PASS：Supabase loopback `http://localhost:54321` ready、Auth/Vite/Edge HTTP 200、fixture env存在。
- 唯讀查詢確認本機沒有 ADR-002／flicker 專用 Trip；存在歷史 `v391-local-browser-6240070a-86ce-4146-9908-6e2683a681f4`，但 `ADR-001-S4-tool-handoff.md` 明確要求不重用／不操作，`ADR-001-S4-acceptance.md` 亦記載交由使用者自行刪除，故本次排除。
- 現成 `regression:local:browser-bootstrap` 的 `prepareMode()` 會修改或建立 `.env.local`、管理員帳號／角色及 synthetic Trip；先前 S4 已判定其提升既有 `v391-admin@example.invalid` 為 Superadmin 不符合身份隔離要求。即使服務為 loopback，本次亦未執行該 bootstrap，避免未授權的環境／角色副作用。
- 本機開啟的 DEV 瀏覽器只有未登入瀏覽模式及既有 static SEED 九州旅程，不是 ADR-002 隔離測試 session；未執行點擊、保存或其他資料變更。
- **動態驗證 BLOCKED（授權／fixture）：** 目前沒有可合法使用的 ADR-002 專用登入 fixture；要驗證 DOM identity、effect setup/cleanup 次數與畫面閃動，需另行授權建立專用 loopback-only fixture，且不得更改既有 Superadmin 帳號／角色、不得操作歷史 synthetic Trip、不得使用 TEST-1／正式 DB。

## 2026-11-22 第五輪調查：正式請求放大、天氣排程與閃動候選分流

### 調查過程

1. 沿程式呼叫鏈核對 `tc_read_trip_participant_email_map`、`weather-forecast` APP 路徑及 `pg_cron` 路徑，確認觸發條件與是否存在固定時間排程。
2. 對照 migration、RPC、天氣座標／預報 cache 的 lease／cooldown，以及前端 effect dependency 與 in-flight dedupe 行為。
3. 以唯讀方式分組正式 Supabase logs，按 endpoint、method、auth／user-agent、user 及 UTC 小時交叉核對；未寫入資料、未改動 Secrets、Cron、Edge Function 或資料庫。
4. 將本輪結果回填並交叉核對文件 112、文件 116、ADR-002 主檔及既有 S1 證據；未以單一請求數量直接宣稱畫面根因。

### 已確認證據

- `tc_read_trip_participant_email_map` 的功能是為已授權的 Trip editor 讀取私有參與者 email map；`getCloudTripRecordsStrict()` 先讀完整 `trips`，再對每筆 Trip 呼叫 hydration，形成每 Trip 一次 RPC 的 N+1 模式。2026-11-19 UTC 正式 logs 約有 585,179 次 participant RPC、152,860 次 `GET /rest/v1/trips`，約 3.83 倍；主要集中於同一已驗證桌面 APP session。這已確認請求放大，但尚未證明直接造成卡片 DOM 閃動。
- 天氣固定排程本身是正常模式：`weather-forecast` Cron 為每日 UTC 01:00、07:00、13:00、19:00（臺灣時間 09:00、15:00、21:00、03:00）；座標失敗 cache cleanup 為每小時第 5 分鐘。2026-11-19 UTC logs 只看到 4 次 `pg_net` Cron POST，均成功。
- 同日另有約 13,210 次已驗證 APP `weather-forecast` POST，主要集中 UTC 03:00–05:00，故天氣表的大量內部讀取主要由 APP 請求風暴觸發，不是固定 Cron 自身造成。前端 Weather effect 依賴 `trip.content.daysData` 物件參照，現有 dedupe 只涵蓋同一請求尚未完成期間，沒有完成後的短期結果去重。
- 因此目前應分成兩條問題：**請求放大／效能與費用問題已確認**；**畫面閃動的直接 DOM／React 因果仍未確認**。最具體的直接候選仍是 Lease effect 將整份 `daysData` 參照綁入 subscription lifecycle，保存期間多次新參照可能反覆 `cleanup/setup`，使 `editLeaseStatus` 出現 `loading → ready`；這是 UI state flap 證據，不等同卡片 DOM remount 證明。

### 改善方向（待核准，不代表已授權實作）

1. **P0／先驗證 Lease lifecycle：** 將 subscription scope 與每日卡片內容更新解耦；active-day IDs 改由 ref／最新 callback 提供，保留 trip switching、active day、權限及 reconnect 的正確性。
2. **P1／抑制 Weather APP 放大：** 以 weather target 的語意 fingerprint（地點、座標、日期、timezone 等）作為請求鍵，加入完成結果的短期 dedupe／cache；保留 in-flight dedupe、cache lease 與 Cron refresh 的邊界。
3. **P1／抑制 participant N+1：** 先加 session／Trip 層級短期 cache，長期評估一次批次 RPC；確認私有 email 不會跨 user、跨 Trip 或跨權限洩漏。
4. **P1／補足可歸因觀測：** 分開記錄 APP／Cron、request fingerprint、cache hit／miss、lease restart、React commit 與 DOM identity；避免只用總 mutation 或總 API 次數判斷根因。
5. **驗收前置：** 取得全新 loopback-only fixture，對 valid IDs、legacy／duplicate ID 正規化、Weather 無卡片及 focus／visibility 變化分開量測；確認相同 snapshot 不新增 participant／weather request，並以 React／DOM／畫面證據才能將候選升級為根因。

### 本輪狀態

- **PASS：** 程式呼叫鏈、排程／cache 邊界、正式 logs 及既有 ADR 證據已完成交叉核對；已把請求放大與畫面根因分流。
- **PENDING／BLOCKED：** 尚缺 ADR-002 專用 loopback fixture／瀏覽器授權，無法完成 CDP／React Profiler／DOM identity 的直接因果驗證。
- **維持限制：** ADR-002 仍為 Proposed，S1 仍為 ACTIVE；本輪沒有修改程式、資料庫、migration、Secrets、Cron、Edge Function，也沒有 commit／push。

### S1 下一步

1. 取得 ADR-002 專用 loopback fixture／瀏覽器 session 的明確測試授權；準備流程須建立全新隔離身份及全新 fixture ID，不能重用歷史 `v391-admin`／`v391-local-browser`。
2. 以 CDP／React Profiler 或同等觀察紀錄一次新增卡片保存期間：Lease effect setup/cleanup 次數、`editLeaseStatus` 變化、React commit、列表容器存續及每個卡片 DOM node identity。
3. 以同樣 fixture 再測編輯與刪除；valid IDs 與缺 ID／duplicate ID 一次性正規化情境分開量測。不要把新增、編輯、刪除所有流程合併成同一測試。
4. 確認瀏覽器證據後，將本節最小修正方向整理成 ADR-002 決策變更提案，待使用者明確核准後才能修改程式。

## 2026-11-22 第六輪：卡片新增操作後正式 API/RPC 呼叫量實測（暫存，待下一輪調查）

### 測量方式／時間
- Supabase Edge logs 唯讀統計，Project `omnnmpcbcicpltkkobae`；本次以使用者手動新增一筆卡片為操作事件，並比較操作前後短時間呼叫量。
- 操作前基準窗口：台灣時間 2026-11-22 15:26–15:36（UTC 07:26–07:36）；主追蹤 RPC／Weather endpoints 查詢結果為 0（窗口查詢基準）。
- 操作後觀察窗口：台灣時間 15:36:41–15:37:08（UTC 07:36:41–07:37:08），在此窄窗口核對 endpoint、秒級序列、IP／User-Agent。

### 操作後觀察
- `tc_read_trip_participant_email_map`：Android Chrome Mobile來源 IP `116.59.58.233` 190 POST（07:36:43.107–07:37:06.387 UTC）；Windows Chrome來源 IP `210.242.52.121` 54 POST（07:37:06.930–07:37:07.916 UTC）；合計 244 POST。另兩來源各有 6 OPTIONS。
- 秒級分布（RPC POST）：07:36:43 24、07:36:44 31、07:36:48 7、07:36:49 43、07:36:50 12、07:37:04 12、07:37:05 43、07:37:06 24、07:37:07 48。秒級分組與來源分組統計可能因查詢窗口／欄位分組差異而不完全一致，後續需原始查詢核對，不強行視為同一精確總數。
- Android 同窗口：`other_info_items` GET 44、`trips` GET 35、`tc_list_itinerary_trip_edit_leases` POST 11、`app_data_revision` GET 4，及其他一般端點。
- Windows 同窗口：`other_info_items` GET 12、`trips` GET 11、`tc_list_itinerary_card_edit_leases` POST 2，及其他一般端點。
- Weather endpoint：`weather_daily_forecasts` 42、`weather_place_coordinates` 33，log來源 IP `3.113.2.225`；並有 `tc_weather_claim_lease` 8、`tc_weather_release_lease` 8。此為服務端／內部呼叫觀察，不等同用戶端請求數。

### 判定與限制
- **已確認請求放大：** 手動新增卡片後的短窗口內 participant-map RPC 密集重複呼叫，Android／Windows兩端均有呼叫；秒級集中模式需追查觸發鏈。
- **尚未證實因果：** 尚未證明全部呼叫均由新增卡片直接引起，也未定位確切程式碼、重複刷新／subscription／state-loop來源。
- **下一輪：** 依原始時間戳／endpoint sequence，對照 3.11.4 呼叫點與刷新依賴，查明新增卡片操作如何引發 participant-map、Trips／Other Info、Weather及Lease連鎖請求。先取得呼叫鏈證據，避免無目的大量測試。
- 本輪只查 logs；未修改程式、正式DB、migration、Secrets、Cron、Edge Function；未 commit／push。此請求放大觀察不取代 ADR-002 原本 Lease lifecycle／DOM閃動因果驗證。

## 2026-11-22 第七輪：無操作觀察
- 台灣時間 15:38:00–15:44:51（UTC 07:38:00–07:44:51），約 6 分 51 秒。唯讀查詢 Edge/API、PostgREST、Auth、Function及 PostgreSQL logs。
- Edge/API、PostgREST、Auth、Function均為 0；PostgreSQL有 2 筆 checkpoint start/completion內部訊息，不是 APP API呼叫。
- 此窗口未見 APP API／Edge呼叫；只代表指定窗口，不推論其他時段。Checkpoint是DB內部活動。

## 2026-11-22 第八輪：手機新增卡片後呼叫放大（第二次操作觀察）
- 操作前基準台灣時間 15:26–15:36主追蹤 endpoints為 0；操作後 15:36:41–15:37:08（UTC 07:36:41–07:37:08），Android手機新增卡片，電腦未手動操作。
- tc_read_trip_participant_email_map：Android IP 116.59.58.233 190 POST；Windows IP 210.242.52.121 54 POST；合計 244 POST，兩來源各 6 OPTIONS。秒級統計與來源統計不完全一致，未強行 reconciliation。
- 同窗口另有 Trips／Other Info／Lease；Weather endpoints weather_daily_forecasts 42、weather_place_coordinates 33、weather claim/release各 8（內部／服務端觀察，不等同 client calls）。
- 判定：確認新增操作附近短窗口 participant-map放大且Android、Windows皆有呼叫；尚未證明全由新增卡片引起、未定位 trigger或與閃動直接因果。

## 2026-11-22 第九輪：手機刪除卡片、未操作電腦時 Windows呼叫來源核對（第三次操作觀察）
- 窗口台灣時間 15:44:51–15:47:22（UTC 07:44:51–07:47:22），約 2分31秒；使用者手機刪除一筆卡片，表示電腦未手動操作。
- Edge/API logs共 280 calls。主要分布：15:46:57 38（Android）；15:46:58 71（Android 57、Windows 14）；15:46:59 141（Android 55、Windows 85及另有 Edge Runtime分組項）；15:47:00 24（Edge Runtime）。
### Windows來源直接證據
- IP 210.242.52.121；User-Agent Windows NT 10.0／Win64／Chrome 157；Authenticated User ID 6a824669-5032-44cb-8fd7-c8a740459c39。
- participant-map RPC：Windows 60 POST、Android 97 POST，合計 157 POST。
- UTC 07:46:58.709–07:46:59.207逐筆log序列包括 trip_deletion_tombstones GET、trips GET、重複 tc_read_trip_participant_email_map POST、other_info_items GET、/auth/v1/user GET、admin_users GET等；可由 request IDs、來源 IP及 UA交叉核對。多筆RPC連續成功 HTTP 200。
### 判定與下一步
- 已確認 Windows Chrome在手機刪除操作窗口內實際發出網路請求；來源IP、UA、authenticated user由逐筆 Edge/API log取得，不是累積 DB統計推測。
- 時間相關高度密切，但不能認定手機刪除直接觸發 Windows refresh/sync。需追查 revision／Realtime／refresh／hydration／生命週期或其他trigger；尚未證明閃動因果。
- 下一步從 Windows端 participant-map RPC callsite與trigger追查，對照此序列。僅調查，未授權程式修改。

## 2026-11-22 第十輪：Windows 全量 reconciliation 呼叫入口核對

### 程式碼已確認
- `getCloudTripRecordsStrict()` 先 SELECT 全量 `trips`，再以 `Promise.all` 對每筆 record 呼叫 `hydratePrivateParticipantEmails()`；該 hydration 在有 Auth session 時會各呼叫一次 `tc_read_trip_participant_email_map`。故一次全量 reconciliation 的 RPC 數量約等於載入 Trip record 數量（逐 Trip N+1）。
- 目前程式內全量 `getCloudTripRecordsStrict()` 的直接呼叫入口是 `reconcileTripWorkspaceWithResult()`；該 reconciliation 同時讀 tombstones、決定／更新 local records與 trip options。
- `reconcileTripWorkspaceWithResult()` 的已定位觸發入口：
  1. `useTripWorkspace` 在 session ready 後的 initial workspace load（線上時直接 reconciliation）。
  2. `startTripWorkspaceRecoveryLifecycle()`：只有 recovery pending 時，於 lifecycle啟動初次嘗試、online event、focus event或 visibilitychange（visible）時 retry。pending由初始 offline狀態及 online／offline事件維持。
  3. App Update／Restart handler：`runAppUpdate()` 在更新流程執行時，會呼叫 reconciliation，再 reload current Trip。
- `refreshTripOptionsAndSelect()` 使用單一 Trip 的 `getCloudTripRecord()`（對指定 Trip hydration一次）與 Trip metadata，不是上述全量 `getCloudTripRecordsStrict()` 的入口。
- 目前在 `src` 未定位到以 `app_data_revision` 或 Trip Realtime event直接觸發上述全量 reconciliation 的呼叫鏈；已搜尋相關詞與入口引用，仍未證明有此跨端即時觸發機制。

### 判定
- **已確認** Windows participant-map burst屬全量 Trip reconciliation／hydration模式，且其呼叫入口已收斂至初始 workspace load、pending connectivity recovery lifecycle及 App Update／Restart流程。
- **尚未確認** 2026-11-22手機操作窗口內 Windows reconciliation究竟由上述哪一個入口啟動。時間關聯本身不能證明手機操作引發 Windows端刷新；沒有找到直接 revision／Realtime觸發證據。
- 目前最值得核對的是 Windows端是否曾進入 connectivity recovery pending（例如 offline／online狀態或初始 offline），並於 focus／visible時執行 retry；其次是當時是否正在執行更新接管／重啟。這仍是待驗證候選，不是結論。
- 本輪僅唯讀程式碼核對；未修改程式、DB、migration、Secrets、Cron、Edge Function，未commit／push。

## 2026-11-22 第十一輪：補全測試調查結果

### 靜態／既有回歸測試
- **PASS** `test:adr001-cloud-save-service`：Cloud Save 與非行程 Repository contract tests。
- **PASS** `verify:adr001-s3-app-integration`：S3 caller closure、Pending／Conflict UI、Trip-level Lease、trusted version、Save RPC 及 generic `daysData` bypass。
- **PASS** `test:trip-workspace-recovery-lifecycle`：Session Ready、offline guard、event triggers、in-flight dedupe、失敗保留、成功清除及 cleanup。
- **PASS** `test:p0-pending-autosync-idempotency`：pending auto-sync idempotency。
- **PASS** `verify:v3923-state-resilience`：狀態保留、離線啟動、共享帳本同步及無常態 Health polling。
- **PASS** `verify:trip-lifecycle`：Trip UUID、永久墓碑、種子保護及本機校正。

上述測試證明既有保存／復原／狀態韌性契約未因目前工作樹而失敗；不能代替 ADR-002 的瀏覽器 DOM identity 或 React effect setup／cleanup 證據。

### 乾淨 loopback 動態測試結果
- 已建立本輪專用 local Auth identity 與新 fixture ID，並在 `http://localhost:5173/Travel-Companion/` 開啟全新瀏覽器來源；未使用正式 DB、歷史 synthetic Trip、TEST-1 或既有 Superadmin。
- 登入測試成功；但新 fixture 沒有出現在 App 的旅程清單。唯讀查詢確認該 row 的 `created_by` 為 `null`，而非目前登入測試 identity；這是 fixture 可見性／準備契約缺口，不是應用程式保存或閃動結果。
- 依本輪「不得修改 database」限制，未補寫 `created_by`、未改動既有資料、未繞用歷史 Trip。因此未執行新增／編輯／刪除卡片的乾淨 DOM identity、React commit、Lease setup／cleanup 量測。
- 前一個非乾淨瀏覽器嘗試曾看到保存後既有 `article` 節點全部替換及 conflict 狀態，但其背景 reconciliation／cache 已污染測試窗口，故明確 **不採納為閃動根因證據**。

### 本輪判定
- **PASS：** 既有靜態／生命週期／保存契約測試。
- **BLOCKED：** ADR-002 專用 fixture 的應用程式可見性與瀏覽器動態量測；阻塞點已從「沒有專用 fixture」縮小為「fixture 未符合 App 的 ownership／visibility contract」。
- **不能下結論：** 目前仍不能把 Lease dependency 候選升級為卡片 DOM remount 根因；也不能以 participant／Weather 請求 burst 單獨證明畫面閃動。
- **仍可開始的工作：** 可以規劃最小程式修改與測試設計，但在完成正確 ownership fixture 且取得一次乾淨 DOM／React 量測前，不應直接合併 P0 修正或宣稱已解決。

### 下一步（仍為調查，不授權程式實作）
1. 由既有 local fixture 建立流程補足 ownership 欄位契約，或由專案維護者提供符合可見性規則的全新 fixture；不得操作正式 DB／歷史 Trip。
2. 重跑新增、編輯、刪除三個獨立案例；每案量測 React commit、Lease setup／cleanup、`editLeaseStatus`、列表容器及卡片 node identity。
3. 將 participant／Weather 請求數與 DOM 量測分開記錄，確認是否為同一 reconciliation 入口造成的連鎖，而非僅時間相近。
4. 只有在上述證據完成後，才把 P0 Lease scope 解耦整理成正式 implementation proposal；目前 ADR-002 維持 Proposed、S1 維持 ACTIVE。

- 本輪未修改程式、正式 DB、migration、Secrets、Cron 或 Edge Function，未commit／push。

## 2026-11-22 第十二輪：影片重現序列與保存／焦點／Lease lifecycle 對照

### 新增證據
- 使用者提供本次手機錄影／畫面抽格：重複新增卡片 1、2，畫面出現跳動，隨後刪除 2、1 均成功；前次刪除失敗現象在這組操作後未再重現。影片尾端可見刪除確認流程，但影片本身不能取代 DB readback。
- 正式 logs 在相應窗口（UTC 10:33:30–10:35:30／臺灣時間 18:33:30–18:35:30）直接查得 7 次 `tc_save_itinerary_days` HTTP 200，並有多組 Lease claim／release及version read；本窗口不能將所有 RPC 精確對應到每個手動操作，故不以7次保存當成四個操作的精確計數。
- **雲端 readback PASS：** 直接唯讀核對 Trip `trip-b6856b9d-aae0-4219-9cbe-3536ff311a99`（測試w），updated_at為 UTC 10:34:33.725115；D1只剩原始卡片「測試卡片」，本輪新增的卡片1、2及其後刪除的卡片均不再存在。這證實本次刪除結果已持久化至雲端（與前次未持久化樣本相反）。
- `saveItem()` 與 `deleteItem()` 成功後皆呼叫 `resetForm()`；`resetForm()` 在清除表單 state 前會 `await releaseEditingLease()`，接著呼叫 `releaseFocusedControl()`，其實作為對目前 activeElement 執行 `.blur()`。Android Chrome在輸入表單時使用軟鍵盤，blur／鍵盤收合會引發 viewport 尺寸／scroll reposition；此鏈是畫面跳動的另一個強候選，與 Lease loading flap需分開判定。
- Lease effect 已由原始碼確認 dependencies包含 `trip.content.daysData`；保存時 `useTripWorkspace.saveItineraryTripDetail()`至少在本機 Pending提交、reconciliation後及雲端確認後分支更新 `currentTrip`／daysData。依賴變更會cleanup並重建subscription；初始化將 status切成 loading，refresh後ready。這足以確認存在控制狀態短暫 flap機制，並可能使卡片操作按鈕 disabled／文案改變，但不等於證明整個列表DOM remount。
- `App.tsx` 的 `ItineraryPage` key固定為 trip/user；一般保存不因 `currentTrip`物件本身變更而換key。列表卡片Fragment key為 stable event ID（legacy fallback例外）。因此未取得DOM node identity前，不支持「一般保存必然remount整個頁面／卡片列表」的說法。

### 暫時根因判定（需動態驗證）
- **已確認的兩個程式機制：** (A) `daysData`依賴耦合造成 Lease effect teardown/setup與 `loading→ready`；(B) 表單保存／刪除結束時 `resetForm()` blur目前焦點，可能觸發 Android軟鍵盤收合與viewport／scroll jump。
- **最符合手機錄影的候選：** 軟鍵盤收合後viewport/scroll reposition可能直接造成畫面跳動；Lease lifecycle flap則能解釋保存窗口多次Lease/read/version/save/release及操作控制短暫失效。兩者可能同時發生，現有影片與logs尚未將它們分離。
- **仍未達根因定案：** 未量測跳動frame前後 `visualViewport`、scrollY、activeElement、Lease effect setup/cleanup、React commit及卡片DOM identity；不能排除其它layout/focus來源。

### 測試安排與初始環境核對（第十三輪）
- 使用者已同意開始安排測試；範圍限定 ADR-002，不包含產品程式修正、正式環境、TEST-1或既有旅程資料。
- 環境核對：公司端 `TPEPC-TM7503-01`，專案 Node `v22.23.2`／npm `10.9.8` 已確認；本機 Supabase loopback `127.0.0.1:54321`／DB `127.0.0.1:54322` 運行。分支 develop。
- 工作樹原已有未提交修改（包括 `src/components/ItineraryPage.tsx`、文件116、ADR索引/文件及 ADR001 SR05結果）；本次保留，不覆蓋、不重置、不提交。
- 已claim現有 Chrome 使用者tab（5173），但 Open Browser Use CDP socket連續兩次 timeout；未操作tab、未改任何行程。故尚無可用乾淨CDP量測session。
- 測試設計採獨立 loopback session／專用合成身分及Trip，不使用歷史 fixture；紀錄 focus/blur事件及activeElement、visualViewport尺寸/scale/offset、scrollY、Lease effect setup/cleanup與status、React Profiler commit、列表容器及每張卡片DOM node identity、Network save/Lease endpoints。矩陣：基線無操作、開啟表單/輸入後取消、成功新增、編輯保存、刪除；逐案隔離，先單次、必要時重複。
- **BLOCKED：** CDP工具連線逾時，無法完成瀏覽器 instrumentation／DOM identity量測；尚未建立新Auth identity或fixture，避免在無可觀測環境下寫入本機資料。

### 下一步
1. 修復／確認Open Browser Use session連線，或採另一個已驗證 loopback-only瀏覽器控制方式；不改用既有使用者旅程。
2. 建立專用本機Auth identity及fixture，確認僅loopback；執行矩陣與量測。
3. 完成直接證據後判定單一／複合根因並提出最小修正；目前不修改產品程式。

- 本輪唯讀調查與測試安排；未修改產品程式、正式 DB、migration、Secrets、Cron或 Edge Function，未commit／push。

## 2026-11-22 第十四輪：跨裝置遠端更新後刪除失敗的操作順序補充

### 使用者補充的實際操作觀察（尚未由獨立重測驗證）
1. Windows端新增卡片「1」並保存。
2. Android APP收到「遠端資料有變更」提示；使用者按「確定」或「查看預覽」進入行程。
3. 手動刷新／重新載入後，手機進入管理模式並刪除卡片「1」，觀察到刪除失敗／無法完成。
4. 隨後手機新增卡片「2」並保存，之後卡片「1」又能刪除。

### 判定與假設
- 此操作順序把追查焦點從單純畫面跳動進一步指向 **遠端更新接受／預覽後，local Trip、Pending／revision／cloud version、Lease或管理操作狀態是否同步一致**。
- 新卡片「2」保存後「1」恢復可刪除，可能表示第二次保存／reconciliation刷新了某個過期或未對齊的狀態；這是推論，尚未證實具體是哪一層。
- 先前同一調查已存在一次手機刪除未持久化樣本，以及另一輪刪除成功的雲端 readback；此補充提供較具體的前置條件及恢復操作，應用於下一次隔離重現。
- 不把「遠端資料有變更」提示、確定／預覽、刷新及管理刪除視為同一事件；測試應逐步核對每步 local/cloud data、version、pending、Lease與RPC結果，避免以最後畫面推論保存狀態。

### 下一步（測試優先順序更新）
1. 先恢復 loopback-only browser control，建立隔離身份及fixture；保持不觸碰既有旅程或正式DB。
2. 優先重現此補充序列：Windows端新增卡片→Android接受遠端變更／查看預覽→Android reload→管理刪除原卡片→readback→Android新增另一卡片並保存→再刪除原卡片→readback。逐步留存雲端 `daysData`、revision/version、Pending、Lease與保存RPC證據。
3. 若序列重現，分離判斷「第一次刪除未持久化」是保存拒絕／version mismatch／Lease或local reconciliation未更新，還是畫面/UI狀態造成；第二次新增保存後何種 state被刷新。
4. 此同步序列測試與原先焦點／viewport、Lease lifecycle／DOM identity閃動量測分開記錄，避免混合不同問題。

- 本輪為使用者觀察補充及測試優先順序調整；未修改產品程式或資料庫，未commit／push。

## 2026-11-22 第十五輪：ADR-001 P3 已定案取消通知／預覽 UI，但舊機制仍殘留核對

### 使用者指出的架構矛盾
- ADR-001（Accepted）規定 Daily Itinerary 不需在一般瀏覽中主動提示變更；即使 revision event 未察覺，進入管理／主動更新時取得可信最新資料即可。
- ADR-001／文件116 P3 已定案移除 Daily Itinerary 的變更預覽、分類／計數及其專用呈現／計算；保留必要輕量更新訊號及進入管理／使用者主動更新時補讀。這不是保留舊的「遠端資料有變更」通知＋確認／預覽流程。

### 目前源碼核對（直接證據）
- `src/App.tsx` 仍 import／呼叫 `useTripDataRevision`，並仍 render `TripDataRevisionNotice`（帶 `onPreviewChanges`／`onConfirm`／`onReload`）及 `TripChangePreviewModal`。
- `src/components/TripDataRevisionNotice.tsx` 仍有「預覽變更」及「確認」按鈕；其一般通知UI仍可呈現「行程資料已有更新」。
- `src/hooks/useTripDataRevision.ts` 仍保留 `isChangePreviewOpen`、summary/error/loading state、baseline/window refs、preview refresh、open/close preview、confirmNotice流程，並在 revision接受時 schedule notice／preview refresh。
- 因此 **舊通知／預覽流程並未從目前工作樹的程式碼完全移除**。這是直接證實的 ADR-001 P3 implementation closure gap，不能僅視為文件落差或推測。

### 對本次同步問題的可能影響（尚未證實因果）
- 舊 `confirmNotice` 路徑會讀 revision→Cloud Trip→revision，並將 `cloudRecord.detail.content.daysData` 寫入 `writeConfirmedItinerarySnapshot()`，更新監測 baseline／known revision，清除 preview refs/state及 notice。舊確認流程因此不只 UI；它也承擔更新 snapshot/baseline 的資料狀態副作用。
- 使用者描述在遠端通知／確認或預覽後 reload，接著刪除失敗，新增第二張卡片保存後又恢復。這使「未移除的舊 preview/confirm flow，是否仍影響 snapshot baseline、revision tracking或刷新／保存狀態」成為具體待驗證假設。
- **不能直接判定殘留 preview flow 就是刪除失敗根因**：尚須追查 `confirmNotice`／`reloadForTripDataChange`／workspace reconciliation／confirmed snapshot與新版 Trip Lease／itinerary version Save RPC的相互作用；目前源碼中舊 UI及hook存在，足以確認不符合 ADR-001 P3 的定案範圍，但因果仍待測試。

### 調查優先順序
1. 優先查明 ADR-001 P3 實作為何未完整移除（commit／branch／dirty-worktree歷史及依賴closure），確認現有未提交修改與版本歷史，不覆蓋既存工作。
2. 追查舊 `confirmNotice`、`reloadForTripDataChange`、`writeConfirmedItinerarySnapshot`、`getTripChangePreview`與 `useTripWorkspace`／ADR-001 Save RPC／Pending／version baseline的相互作用，明確區分必要 revision publisher與已定案取消的 Daily Itinerary preview flow。
3. 將「舊通知/預覽殘留」與第十四輪跨裝置刪除重現序列組合驗證；如可重現，保留前後 snapshot、version、Pending、Lease及RPC/readback證據。
4. 僅調查與提出方案；未獲使用者授權前不修改程式或刪除機制。
