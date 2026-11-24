# ADR-002-S1：淘汰 Preview／通知衍生同步機制的依賴追蹤與逐項拆除

> 工作狀態：ACTIVE／主要使用者可見卡片穩定性問題及管理權／鎖定新增範圍均已修正、驗收並正式發布 V3.11.5。S1 目前只保留確認是否仍存在新可重現異常的存在性判斷；若無新現象，不需補做歷史動態量測。Participant RPC N+1 與 Weather APP 重複請求僅為未來重新取證的性能改善候選，未授權實作。本文件為持續工作日誌唯一維護位置。

## 目標及工作邊界
以現行 develop 為基礎，追查已淘汰的每日行程 Preview／notice／change-summary／snapshot-baseline及衍生同步機制的完整依賴、呼叫鏈、資料流與歷史演變，逐項拆除或修正，恢復符合ADR-001的保存／更新行為。V3.9.16只作歷史參照。保留必要revision signal、Lease、Save RPC、version/CAS、Pending／Recovery及無關有效功能；不整體回退、不猜測、不做無關重構。

## 2026-11-22 初始紀錄

### 已確認／觀察
- `useTripWorkspace.ts` 的卡片保存流程：先準備本機 record／Pending、寫入本機、刷新 sync state、更新 `currentTrip`；線上後取得 Lease、讀取 cloud version及單一 Trip、reconciliation、更新 pending/sync state、執行 Save RPC，保存成功後再更新 `currentTrip`；不同分支可能多次更新該 state。
- `ItineraryPage.tsx` list render採 `event.id` 或 legacy index fallback 作 identity，並用於 SortableCard。需追查 id 保持及 component lifetime。
- 請求／mutation計數已記錄於 ADR-002 主檔摘要，計數屬近似觀察，不是根因證明。
- `tc_read_trip_participant_email_map` N+1 pattern已被辨識，但尚無因果證據連結至閃動，暫不列為本案主要原因。

### 初始未確認／候選（2026-11-22 歷史紀錄；不代表目前現象仍存在）
1. 當時推測保存期間多次 `setCurrentTrip`／sync state update 是否令卡片區域短暫重置或重新渲染。
2. 當時待查 card IDs 在本機保存、cloud reconciliation 及同步後是否維持一致；legacy index fallback 是否可能使 key 變動。
3. 當時待查保存期間是否由 loading／conditional rendering、資料替換、父層 key、sortable transition 或 layout effect 導致 remount／可見跳動。
4. 當時待比較以前版本是否使用不同 state／保存／列表呈現方式，且差異是否直接解釋當時現象。後續已知使用者可見問題的修正驗收與目前剩餘工作，以本文件 2026-11-25 狀態校正為準。

### 初始調查下一步（2026-11-22 歷史紀錄；目前狀態以本文件末段 2026-11-25「S1 尚餘工作」為準）
1. **已完成（2026-11-22）：** 檢查列表／父層 key、條件式掛載及 SortableCard identity；一般有效 ID 的新增／編輯／刪除會保留既有 ID。
2. **已完成（2026-11-22）：** 比較 `ensureItineraryDaysDataIds`、一般保存／reconciliation與 Git 歷史；確認 `22af34a` 將 `trip.content.daysData` 加入 Lease effect dependencies，`2af4db9` 將 local Pending 後 `setCurrentTrip` 移至 online common path。
3. **歷史候選（未確認仍有產品問題）：** 當時曾規劃取得 ADR-002 專用 loopback fixture，量測 Lease effect setup／cleanup、`editLeaseStatus`、React commit、卡片 DOM identity及實際視覺變化。主要可見異常其後已修正並由使用者驗收；不得把此舊測試計畫當成目前 ACTIVE 任務。
4. 只有確認目前仍有可重現異常，且使用者同意進一步量測時，才提出最小隔離方案；未獲必要測試授權前不建立 fixture、不操作資料。

### 初始狀態（2026-11-22 歷史紀錄）
- **當時 PASS：** 已識別需優先追查的保存 state 更新序列與卡片 identity。
- **當時 PENDING：** 根因證明、歷史差異比較、可重現證據、改善方案審查。之後主要使用者可見閃動／排序問題已修正並有使用者驗收；目前狀態請以本文件 2026-11-25「S1 尚餘工作」為準。
- **持續安全限制：** 不使用 TEST-1／正式 DB 測試；新建 loopback fixture／identity 前須有明確測試授權；未取得實作授權不得修改程式。

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

### 歷史改善候選（未授權實作；目前不構成 S1 待辦）

上述五點均為當時的改善構想，不是目前實作計畫。現階段不得依此直接建立快取、批次 RPC、改動 Lease／Weather effect 或新增觀測機制；未來如要處理，須依 2026-11-25 校正規則重新取得最新數據、審查必要性並再次取得使用者授權。

### 本輪狀態（歷史紀錄；依後續驗收與發布紀錄更新）

- 本節原始 PASS／PENDING／BLOCKED 僅反映 2026-11-22 當時狀態，不代表目前工作狀態；後續完成項目以本文件 2026-11-24 之紀錄及 ADR-001 S4 結案紀錄為準。
- Participant RPC N+1 與 Weather APP 重複請求：當時正式 logs／程式呼叫鏈已確認存在請求放大現象，但數據來自 2026-11-19／22，不能代表目前流量或目前仍具改善必要性；不作為卡片閃動根因，也不列入本輪 S1 必做修正。
- 這兩項只保留為未來性能改善候選。未來真正排程處理時，必須重新取得最新正式數據、重新檢視現行程式呼叫鏈及影響、審查修正必要性，再向使用者提出具體範圍並取得再次明確實作授權；取得授權前不得修改程式、RPC、快取、Weather 請求或排程。

### S1 尚餘工作（截至 2026-11-25）

1. **動態因果證據／是否仍有改善必要：** 歷史調查曾將 Lease effect lifecycle 與 `daysData` 參照綁定過緊列為候選，當時缺少完整 React commit／卡片 DOM identity 的直接量測。主要使用者可見問題（提示位移、新增／刪除閃動、時間排序跳動）其後已經修正且使用者驗收通過；因此不得再假定原閃動仍存在。若仍要完成 ADR-002 原「畫面閃動根因」調查，先確認目前是否仍有可觀察的未解現象；只有仍存在且值得調查時，才提出最小的隔離動態量測方案。建立新 loopback identity／fixture 或啟動相關操作前，仍須取得明確測試授權；不得使用 TEST-1、正式 DB、歷史 synthetic Trip 或變更既有 Superadmin。
2. **歷史 Preview／保存失敗敘述的狀態對齊：** 舊紀錄保留為歷史證據，不將早期「刪除失敗／Preview 交互作用」假設當成目前未修復故障；若未來有新的實際回報，依當時證據另行定位。
3. **不在 S1 待辦的項目：** 管理卡片／編輯旅程雙入口互斥、管理權及鎖定、編輯旅程 metadata Lease 保護已由 ADR-001 新增範圍完成程式、自動化及使用者人工 UI 驗收，並於 V3.11.5 正式發布；跨 Auth server-side Lease 拒絕不另列測試或重開 ADR-001 Exit。Participant RPC N+1 與 Weather APP 重複請求僅依上段規則作為未來候選。

### S1 下一步

先不新增程式工作。若要結束 S1 原畫面根因調查，唯一前置判斷是確認目前是否仍有實際可重現的閃動／保存異常；沒有新的現象，就不必為了補齊歷史 instrumentation 而建立 fixture 或再做一次已無產品問題的測試。Participant／Weather 兩候選不阻塞 S1 完成，不自動啟動。

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
4. 本段為 2026-11-23 當時的歷史規劃；後續主要可見異常已修正並由使用者驗收，Participant／Weather 亦已改列未來候選。現行狀態及授權邊界以本文件 2026-11-25「S1 尚餘工作」及 ADR-002 主檔校正紀錄為準。

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

### 現行執行順序（ADR-002修訂後）
1. 核對 Git/worktree既存修改及相關歷史，將 P3已取消的每日行程 Preview／notice／change-summary流程與必須保留的 revision signal分界清楚。
2. 追查 `confirmNotice`、`reloadForTripDataChange`、`writeConfirmedItinerarySnapshot`、`getTripChangePreview`、notice/modal元件及所有 caller、state、storage、RPC與reconciliation依賴；形成可拆除的實際依賴閉包，並由原始碼/Git證據核對。
3. 依依賴閉包逐項移除／修正已淘汰機制及其必要呈現、計算、snapshot/baseline副作用；每一切片更新本日誌與索引並跑對應測試，避免一次性大拆。
4. 對同步保存、遠端更新後管理操作／新增修改刪除及 ADR-001 Lease／CAS／Save RPC保護做隔離驗證；若測試環境阻塞，先修復安全隔離測試條件，不使用正式DB、TEST-1或既有旅程。
5. 對每個移除項目確認不再有 caller／引用／資料副作用，測試與文件一致；保留無關有效功能及既有工作樹修改。

## 2026-11-22：範圍修訂及首輪依賴盤點
- **PASS（文件修訂）**：ADR-002已改為 Accepted／實作中，授權現行develop上的逐項拆除與隔離驗證；README索引同步更新。
- **直接程式證據**：`App.tsx`仍掛載 `TripDataRevisionNotice`／`TripChangePreviewModal`並使用 `useTripDataRevision`；hook仍含 preview refresh、notice、confirmNotice與 confirmed snapshot/baseline副作用；`tripChangePreviewService.ts`仍計算摘要並查詢 `trip_change_journal`。
- **依賴邊界已辨識**：`useTripDataRevision`也承擔 trip master權限撤銷處理、remote revision check及Trip editor／delete／itinerary-save conflict入口；不得以整個hook／revision publisher一併刪除方式處理。需將必要 revision/access/conflict訊號與取消的預覽／摘要功能分離。
- **DB依賴證據**：V3.9.17 migration `20260927180500_v3917_change_preview_journal.sql`建立 journal及摘要trigger/function，並在 revision broadcast trigger內呼叫摘要紀錄；RC2 migration `20260927193000_v3917_rc2_sync_boundaries.sql`曾縮減 journal分類。必要 revision broadcast publisher與 journal摘要副作用目前耦合，後續拆除須以新 migration安全分離，不能修改既有歷史migration或直接丟棄revision publisher。
- **目前未修改產品程式或SQL**；本輪僅修訂決策文件及唯讀盤點，未commit／push。
- **下一步**：追查 revision broadcast trigger/function、其他 journal callers、測試及文件依賴閉包，界定必要publisher／conflict/access guard與journal/preview專用部分後，開始第一個可驗證拆除切片。

- 已核准 ADR-002範圍內實作與隔離驗證。commit／push／deploy及正式資料操作仍需另外明確授權。

## 2026-11-22：實作前依賴閉包核對
- Git核對：`develop`／`origin/develop`一致（HEAD `c77dfefe04c72bca0b9005e14f65abbe5219eea1`）；工作樹僅包含既有ADR文件修改，已保留。fetch未帶來遠端差異。
- **前端拆除依賴：** `App.tsx`掛載Preview Notice／Modal，並呼叫 `useTripDataRevision`。Hook目前混合Preview state／summary／confirm snapshot-baseline副作用與必要revision check、Trip master access revoked清除及Save／Delete conflict入口；因此不可整體刪除Hook。
- **UI依賴：** `TripDataRevisionNotice`的critical `revoked`／`conflict` dialog可保留，但一般 `available` notice及Preview操作是已淘汰UI。App的編輯／刪除入口仍呼叫 `checkForRemoteTripChange()`，其變更後的阻止／提示行為須在移除一般notice時保持明確，不能變成靜默中止。
- **Service依賴：** `tripChangePreviewService.ts`僅由 `useTripDataRevision`及 `TripChangePreviewModal`依賴，內容包含Net-change分類、journal query及localStorage snapshot專用鍵。搜尋未找到其專責測試。
- **DB依賴：** V3.9.17 migration建立 `trip_change_journal`、摘要計算helper／trigger及writer；`tc_broadcast_trip_data_revision()`目前內嵌呼叫summary writer。必要publisher需保留，但須在新migration移除summary side effect與journal物件，不能修改歷史migration。
- **本輪未修改產品程式或SQL，未執行DB操作。** 嘗試委派實作的subagent工具回傳內部錯誤，能力健康檢查正常；尚未由此工具完成任何修改。下一步主Agent需直接進行前端切片，保留critical conflict/access功能，完成 targeted tests/build後，再進入DB migration切片。

## 2026-11-22：前端 Preview slice 拆除／驗證
- **完成切片：** 移除 `TripChangePreviewModal`、`tripChangePreviewService`、前端 Preview／summary／journal query／確認baseline／snapshot state與 UI，並清除其專用 verifier。
- `useTripDataRevision`已精簡為 revision monitoring／remote access revalidation／Trip editor access revoked清除／必要 revision conflict check與critical alert；不再以一般變更notice／摘要UI介入保存流程。
- `App.tsx`移除 Preview modal及確認流程；critical access revoked/conflict dialog保留。
- Regression verifier `verify-v31012-itinerary-sync`調整為聚焦ADR-001三方合併、Pending、Conflict及 Lease RPC；`verify-v3913-update-race`及`verify-v3916-offline-revision-personal-book`改核對現存critical/access contract，移除 Preview assertions。
- `npm run build`：**PASS**，全套 build scripts、TypeScript checks、production Vite/PWA build及postbuild browser-security／weather bundle checks皆通過。
- `git diff --check`待最後整理再次確認。尚未修改migration／資料庫；journal與摘要trigger／function的移除分離屬下一切片。尚未commit／push／deploy。
- 下一步：追完整migration function／trigger依賴閉包，建立新migration分離revision broadcast publisher並拆除 journal side effects/objects，配合隔離資料庫驗證。
## 2026-11-22：Journal資料庫切片／local isolated PASS
- 新 migration `20261122140000_adr002_remove_trip_change_preview_journal.sql`：改寫 `tc_broadcast_trip_data_revision()`，保留 revision increment、private broadcast、Trip DELETE tombstone與移除 editor通知；去除journal summary side effects。
- Migration拆除 `public.trip_change_journal`、`tc_record_trip_change`、master summary writer、itinerary extraction及JSON array summary helpers。RC2已拆除 checklist/expense summary triggers/functions，migration按既有狀態處理。
- 已在 **Supabase local DB (127.0.0.1:54322)** 套用 migration，未連線linked remote project。Catalog核對：journal table／journal writer／master-summary writer皆NULL；revision publisher存在，6個Trip/admin_users revision triggers仍掛載。
- Local smoke test以synthetic Trip insert／update／delete驗證revision持續增加及永久 deletion tombstone建立，並清理測試tombstone；PASS。
- Static verifier `verify-adr002-preview-removal.mjs`新增至 build chain；驗證migration與必要access/conflict契約。
- 尚需最後完整build、diff／docs-links核對及migration依賴closure確認。未commit／push／deploy。
## 2026-11-22：S1／前端與Journal拆除切片收尾
- 全套 `npm run build`再次PASS（ADR-002 verifier、完整 regression chain、TypeScript、production Vite/PWA、postbuild security/bundle checks）。
- `npm run verify:docs-links` PASS：154份Markdown／363個local targets。
- `git diff --check` PASS；產品原始碼及 migration搜尋確認已無journal/preview service/UI/confirmed-snapshot runtime references。歷史 migrations仍保留原始migration紀錄，不修改歷史。
- Local migration list確認migration已套用；local catalog核對 journal table/writer/master-summary writer不存在，revision publisher及6個 triggers存在。
- **此拆除切片完成。** ADR-002其餘保存更新行為改善／必要回歸若仍有具體觀察，下一步以現行develop及隔離測試調查；目前未commit／push／deploy。

## 2026-11-22：續行——Lease lifecycle動態量測環境復查
- 重讀ADR-002索引／主檔及本階段紀錄，確認目前切片完成後的下一個具體未完成事項仍是保存更新動態量測；此前紀錄的最直接候選為 `ItineraryPage` Lease effect依賴 `trip.content.daysData`，但不得在測量門檻未完成前把候選當成已證實根因或直接改程式。
- 最新原始碼核對再次確認 effect dependencies為 `[activeDay, canUseEditLeases, supabase, trip.content.daysData, trip.id]`；effect實際負責Trip-level Lease list／Realtime subscription及foreground refresh，不直接使用 `daysData` 內容。保存流程會多次替換daysData參照，具備造成cleanup/setup的機制證據。
- 本次瀏覽器控制復查：Open Browser Use backend ping成功、managed tab可列出（`http://127.0.0.1:5173/Travel-Companion/`），但CDP `Runtime.evaluate`再次unix socket timeout；改用Computer Use取得Chrome accessibility state可用，但該次畫面包含Chrome選單／偵錯提示，無法取得可靠的App DOM／React／viewport／Lease instrumentation。未操作旅程、未建立Auth identity／fixture、未寫入任何Trip資料。
- **目前仍BLOCKED：** 動態量測的browser-control/CDP可觀測性，且未達原先實作前驗證門檻。不能宣稱Lease lifecycle已被動態證明造成畫面閃動，也不直接套用候選修改。
- **下一步：** 修復／確認獨立loopback測試tab的CDP或可可靠取得頁面DOM／instrumentation的替代控制方式；建立專用loopback identity／fixture後，先量測保存前後Lease effect setup/cleanup、status flap及卡片DOM identity，然後再依證據判定最小修正。未commit／push／deploy.
## 2026-11-22：續行——CDP恢復與隔離fixture建立嘗試
- 使用獨立 Chromium debugging endpoint `127.0.0.1:9222`繞過 Open Browser Use socket timeout，成功取得 loopback App DOM及button/viewport資料；Chrome tab先前因休眠，透過Computer Use選取tab後恢復。
- App確認本機 Supabase URL為 `http://localhost:54321`，`.env.local`使用loopback API；DEV test login UI已顯示且限 `@example.invalid`帳號。測試環境未使用正式 Supabase。
- 本輪仍未成功建立隔離Auth identity／Trip fixture：shell signup操作受工具安全檢查阻擋，尚未透過 UI完成 signup。未直接操作Auth DB或既有旅程以繞過此阻礙。
- 對已保留工作樹執行全套 `npm run build`：**PASS**，包含 ADR-002 preview/journal contract verifier、完整 regression scripts、TypeScript及production Vite/PWA build chain（工具回傳 exit code 0）。`git diff --check`亦在同一指令完成並回傳 exit code 0。
- 動態保存／Lease setup-cleanup／React commit／DOM identity觀察仍未開始；本輪成果是 browser observability路徑恢復及 build regression PASS，並非根因動態證明。
- **阻塞狀態**：需使用 Computer Use直接操作本機測試登入UI完成隔離identity，或另採經批准且工具允許的本機fixture建立方式。無權或未成功建立fixture時，不擅自寫Auth DB／既有Trip。
- 未修改產品程式、SQL或Trip資料；未commit／push／deploy。

### 2026-11-22 續行補充：登入 UI / browser bridge 再確認

- Open Browser Use managed tabs 列出本機 Vite App (`http://127.0.0.1:5173/Travel-Companion/`) 為唯一 managed tab；其 `page_info` 再次無有效回傳。
- Computer Use 可辨識 Chrome 視窗與網址列，但其 accessibility tree 無法提供 App DOM/登入表單控件，互動結果未取得有效頁面內容。
- 重新核對 App 原始碼：本機測試登入 / 建立帳號功能在 `App.tsx` 與 `LoginSafetyModal.tsx` 存在，並限定 localhost Supabase、`@example.invalid`；但本輪無法完成 UI 操作。
- 本輪不使用 Shell REST signup、直接 DB/Auth manipulation 或其他繞過 UI/安全限制的途徑。尚未建立登入 session，故動態測量仍未執行。
- 狀態維持：動態驗證阻塞，根因未證實；前輪 build、靜態 verifier、diff-check PASS 的結果不受此補充影響。

### 2026-11-22 續行補充：CDP恢復與本機測試登入成功

- 本輪透過 Open Browser Use CDP `Runtime.evaluate` 成功讀取 managed tab DOM、按鈕、表單與頁面文字，前述 Browser Use bridge／CDP timeout 阻塞已排除。
- App 的登入安全 Modal 明確提供「本機測試登入」，限定 loopback Supabase 且 `@example.invalid`；透過 UI建立並登入新的隔離測試身份 `adr002-test-20261122@example.invalid`，未使用 Shell REST signup、Auth DB直接寫入或正式 Supabase。
- 登入成功後 App 顯示個人帳本模式。現有 seed 九州旅程的「管理」按鈕為 disabled；該測試身份尚未取得可編輯的 ADR-002專用 Trip／fixture，故未點擊保存、編輯、刪除或操作其他既有旅程。
- 本輪證明：**CDP／頁面 DOM讀取與 UI test-account signup/login 已恢復並實測成功**；尚未證明 Lease setup／cleanup、React commits、DOM identity或畫面閃動的直接因果。
- **目前阻塞縮小為 fixture／Trip ownership-access**：需在 loopback環境建立／取得一趟由該測試身份可編輯、專供 ADR-002的隔離旅程。不得將其權限擴增至既有旅程、改變既有 Superadmin／角色或操作歷史 synthetic Trip。
- 未修改產品程式、migration、SQL或Trip資料；未commit／push／deploy。

### 2026-11-22 續行補充：測試身份的 Trip 建立權限確認

- 以已登入的 `adr002-test-20261122@example.invalid` 重新讀取 App DOM／畫面；登入身份確定為個人帳本模式，Cloud Trips 顯示九州與沖繩選項，但未提供可編輯管理權。畫面上 Trip master「管理」按鈕先前已確認 disabled。
- 原始碼核對 `openCreateTrip()` 受 `canEditTripMaster` 與 `isTripMasterLocked` 控制；`handleTripEditorSubmit()` 也先檢查 `canEditTripMaster`。目前帳號無此權限，因此無法透過正常 App UI建立 ADR-002專用Trip。
- 不採用既有 `v391-local-browser`／`v391-admin` helper（會改既有 Superadmin角色且前述歷史Trip已排除），不直接寫 Auth／`admin_users`／Trip DB，不重設既有測試帳號。
- **現階段無安全且已授權的 fixture provisioning UI路徑**；需要授權使用一個專用、loopback-only fixture provisioning／短生命週期測試角色流程，精確限定新帳號及新Trip ID，並具清理與驗證機制。此權限未取得，故停止於此，不以程式／DB繞過。
- 本輪續行（2026-11-23）：確認本機 Supabase loopback與Node/npm環境正常；ADR-001 SR-10隔離整合測試重新執行 **PASS**（JSON literal null rejection、grow/shrink版本更新與3筆history assertions），其測試finally cleanup已執行。只讀本機資料庫計數：8 trips、4 superadmins、1筆 `adr002-test-%@example.invalid` Auth user、0筆該email pattern角色；未使用既有Superadmin或旅程。
- 另嘗試建立新的ADR-002專用Auth／trip_editor／Trip fixture provisioning腳本，該工具呼叫被OpenAI安全檢查阻擋；未確認腳本執行或fixture建立，亦未透過替代方式繞過。先前已存在的ADR-002測試Auth identity仍存在，未能在本輪確認安全清理方式；目前未發現專用Trip或角色。此為未清除的測試身份，需在受允許的安全途徑核對及清理。
- **人工 UI 測試已續行（2026-11-23）**：改用已建立的專用旅程 `ADR-002-人工測試 (2026-11-23)`及現有登入／編輯權，不再以fixture provisioning阻塞操作型測試。CDP恢復可用，observer記錄 focus、blur、scroll、visualViewport與DOM mutation。
- **PASS**：進入D1管理、開啟新增表單、標題欄取得focus、輸入、取消；取消未留下卡片，scrollY保持0。
- **PASS**：新增卡片（09:00–10:00）保存、修改標題後保存；UI確認保存結果。使用者已完成二次確認後的卡片刪除，重新讀取UI確認卡片列表為空。
- **PASS**：另建立測試卡片（11:00–12:00），編輯後保存標題變更；再次開啟編輯，改為未保存內容後取消，UI仍保留原標題，未保存變更丟棄。
- **直接觀測**：保存／取消會使active INPUT focusout、activeElement回BODY；在該測試桌面viewport height=901且scrollY=178的編輯狀態，保存或取消後scrollY重置至0，伴隨viewport width 1665→1680及scroll事件。焦點／輸入時亦觀察到scrollY=178。此現象在本環境可重現，不能直接推論Android鍵盤或Lease effect因果。
- **未測／限制**：目前是桌面browser；未取得Lease effect setup/cleanup、loading→ready、React commit或card node identity直接訊號，故根因仍未證實。尚未進行產品修改。
- **後續自動UI測試（2026-11-23）**：在scrollY=178時聚焦活動標題，無變更保存，直接觀測 `focusout`，其後DOM mutation、viewport width 1665→1680及scrollY 178→0；卡片 `article` node identity仍相同（true）。另實際改標題保存（`ADR002-identity-change`），UI確認新值，node identity仍相同；再保存回復原標題 `ADR002保存後焦點觀測-二次編輯`，確認專用測試卡片資料已復原。變更保存期間多次DOM mutation，scrollY在mutation群組前段保持178，末段歸0；node未替換。
- **源碼直接核對**：`ItineraryPage.tsx` Lease subscription effect依賴 `[activeDay, canUseEditLeases, supabase, trip.content.daysData, trip.id]`，會在daysData參照變動時重跑；其流程載入時設定 `editLeaseStatus=loading`，取得list後設定 `ready`，並建立trip-filter Realtime channel。此為source-based lifecycle可能性，未取得runtime setup/cleanup及status transition的直接時間證據，不能認定保存一定觸發flap。`resetForm()`會先release lease再呼叫`releaseFocusedControl()`；`releaseFocusedControl()`實作為active HTMLElement.blur()，但本次保存觀測到focusout與scroll reset，並非已證明直接由resetForm造成。
- **已證實**：操作後卡片DOM node identity保持不變；scroll reset可重現。透過唯讀React Fiber hook state讀取，保存後穩定狀態 `editLeaseStatus=ready`；未捕捉瞬態loading或effect cleanup/setup。
- **下一步**：已能唯讀讀取React Fiber state，但目前尚未完成保存前後逐frame sampling，未取得Lease status瞬態及effect lifecycle直接證據。再依證據判定最小修正。未修改產品程式、正式DB或歷史旅程，未commit／push／deploy。


## 2026-11-23：下一階段測試計劃—事件因果追蹤（依此順序執行）

### 測試目標與判定原則
- 目標不是肉眼確認閃動，而是捕捉一次操作期間的事件序列，定位最先與畫面變化建立因果關聯的程式事件，之後再以受控測試驗證。
- 不預設 Lease、blur、scroll、React render、Realtime或DOM mutation任何一項是根因。時間相近僅是關聯，不足以成立因果。
- 限用專用ADR-002測試Trip及隔離非正式環境；不使用正式DB、TEST-1或歷史旅程。不在取得證據前修改產品程式。
- 每次案例單獨trace，使用trace ID、毫秒timestamp與事件來源，避免混合不同操作或其他背景事件。

### S1-A：建置一次操作的事件時間線（先做，未完成不得跳到根因判定）
1. 建立可啟停、可清除且僅限測試頁面的診斷觀測；不改產品功能或保存邏輯。
2. 每個操作前記錄baseline，操作後持續捕捉至UI與相關狀態穩定；至少涵蓋無變更保存、內容變更保存、取消，必要時再分別測新增與刪除。
3. 同一trace中捕捉以下資料，統一時間戳：
   - 操作流程：Save/Cancel handler進入與退出、各保存/取消階段、resetForm及releaseEditingLease呼叫。
   - React：ItineraryPage render及commit時間/次數；可可靠取得時記錄Profiler/commit與元件mount/unmount。
   - Lease：effect setup/cleanup直接訊號、lease request/channel建立與移除、editLeaseStatus每次轉換（含loading/ready/其他狀態與時間），不得只讀穩定的最後值。
   - Realtime：channel subscribe、unsubscribe、status及相關事件。
   - Focus：focus、focusout、blur、activeElement變化與來源。
   - Viewport/scroll：scrollY、scroll事件、visualViewport width/height/offset/scale及resize時間。
   - DOM：主要列表容器、編輯表單、卡片article的node identity及mount/remove/replace；MutationObserver只作DOM變化佐證，不把mutation數量當作閃動數。
   - Rendering：可取得的Performance trace中Layout、Paint、Composite/frame時間；記錄實際能力限制，若無可靠訊號不得推稱已捕捉。
   - Network：保存RPC、Lease RPC與相關Reconciliation/Realtime request時間及結果；避免記錄個資、token、Authorization或Trip內容。
4. 先捕捉單次操作的完整序列；若有背景干擾或trace不完整，標記無效並隔離重測，不靠肉眼補判。

### S1-B：事件順序分析與候選定位
- 依trace時間線找出最早與畫面異常一致的事件及其前後直接變化，列出證據、反證、未知與候選來源。
- 分別檢查：React commit/state分支、DOM容器/card replacement、Lease setup/cleanup與status flap、Realtime、resetForm/blur/focus、viewport/scroll、Layout/Paint。
- 判定需區分「render但DOM未重建」、「DOM replacement」、「Lease控制狀態變化」、「focus/viewport reposition」及「layout/rendering變化」；不可將它們合併成單一閃動原因。
- 若trace只證明伴隨事件，仍列為候選；不得宣稱根因已定位。

### S1-C：候選根因受控驗證
1. 對候選事件及其呼叫鏈直接讀取原始碼，核對trace中的事件來源與執行順序。
2. 選擇最小、可逆且隔離的控制測試，單獨驗證候選因素；不得在此階段擅自修改產品程式。
3. 相同條件重複trace，確認候選事件及視覺／DOM/viewport變化的序列可重現。
4. 以受控隔離或診斷方式對照候選因素存在／不存在時的差異；若無法安全隔離，記錄限制並維持未證實。
5. 若多因素共同作用，分別驗證並記錄複合因果，不將其中一項過度定為唯一根因。

### S1-D：完成門檻
- **S1-A PASS：** 一次有效操作有完整且可排序事件時間線，核心事件來源可識別；所有無法捕捉項目明確列出。
- **S1-B PASS：** 候選事件定位有trace、原始碼與反證／未知核對，不以肉眼或單一mutation數量判定。
- **S1-C PASS：** 受控、可重複驗證建立候選事件與畫面變化的因果關係，或有證據排除該候選。
- 完成前不得宣稱根因已確認或開始未經核准的修正；結果、PASS/FAIL/BLOCKED、下一步同步更新本階段日誌與決策索引。
- 本計劃是ADR-002既有調查／測試範圍的具體化，不另授權commit、push、deploy或正式環境操作.
## 2026-11-23：S1-A～S1-D事件因果追蹤結果

### S1-A｜事件時間線 PASS

- **環境**：Travel-Companion develop工作樹的本機Vite App、loopback Supabase、專用旅程 `ADR-002-人工測試`；桌面Chrome viewport 1680×901。未使用正式DB、TEST-1或歷史旅程。
- 建立並短暫使用測試頁 observer及源碼診斷訊號，捕捉focus／focusout／blur、scroll、viewport、DOM mutation、Performance layout-shift、fetch RPC、Lease effect setup／cleanup、Realtime status及 `editLeaseStatus` loading／ready。診斷程式修改已全部撤除；未保留產品診斷程式。
- **編輯表單開啟**：document scrollHeight由901增加至1079；在scrollY=0時，innerWidth維持1680，但clientWidth由1680降至1665，垂直scrollbar出現。此變化在未手動捲動時已可重現。
- **編輯表單關閉**：document scrollHeight回到901；scrollbar消失，clientWidth回到1680。當操作前scrollY=178時，focusout發生於scrollY=178，關閉表單後scrollY被瀏覽器clamp至0，並觀察到layout-shift entry。
- **DOM identity**：重複取消測試中卡片article node identity維持相同（同一node ID），未發生卡片article replacement/remount。
- **Lease直接訊號**：保存操作中直接捕捉多次effect cleanup／setup、Realtime `CLOSED`／`SUBSCRIBED`、`editLeaseStatus` loading→ready及Lease RPC結果。保存期間 `daysData` identity變更並引發effect重啟；`supabase` identity保持穩定。

### S1-B｜候選定位 PASS

- **已確認根因（針對本次viewport／scroll閃動）**：卡片inline editor使document高度增加，造成垂直scrollbar出現及viewport可用寬度縮減；editor關閉後document高度縮短，scrollbar消失，viewport width回擴。scrollY=178→0是document縮短後的scroll range clamp，不是卡片DOM替換。
- **Lease effect不是scroll reset的必要原因**：取消測試未呼叫 `tc_save_itinerary_days`，未觀察到Lease effect cleanup／setup，但仍重現scrollY 178→0、scrollbar消失、clientWidth 1665→1680及layout-shift。保存時Lease effect重啟屬伴隨的次級UI state transition，不能定為本次viewport reflow根因。
- `focusout`與scroll reset有時間關聯，但證據指向editor DOM高度收縮／scroll range變化；不把 `resetForm()`、blur、Lease或Realtime單獨定為根因。

### S1-C｜受控、重複驗證 PASS

- **Cancel重複測試**：至少兩輪在scrollY=178的編輯狀態實際點擊取消，均重現scrollY 178→0、document height 1079→901及clientWidth 1665→1680；article node identity不變，取消未保存卡片內容。
- **Save測試**：隔離卡片標題修改保存及復原保存均成功；保存RPC回傳200，保存期間Lease effect lifecycle／loading→ready可直接捕捉。保存前後卡片資料已復原為 `ADR002保存後焦點觀測-二次編輯`。
- **Mitigation控制試驗（僅頁面臨時CSS，未保存至產品檔案）**：`html { overflow-y: scroll; }`可讓clientWidth在editor開／關及scrollY 178→0後維持1665，證明固定scrollbar可抑制水平viewport reflow；但scrollY clamp仍存在且桌面頁會常態顯示scrollbar。`scrollbar-gutter: stable`在本次Chromium／頁面配置下未能預留gutter。兩者均未留下產品程式修改。
- **限制**：桌面Chrome測試；未進行Android實機、完整React Profiler／commit trace或逐frame paint/composite追蹤。這些限制不影響已確認的scrollbar width因果，但不將其他可能的保存閃動泛化為同一根因。

### S1-D｜完成判定

- **PASS**：S1-A有效時間線、S1-B根因定位、S1-C受控重複驗證均完成；scroll／viewport reflow根因已證實，Lease lifecycle已分離為次級候選。
- **未修改產品程式**：臨時observer/source instrumentation及CSS試驗均已清除／撤除；本輪未修改正式DB、未commit／push／deploy。
- **已核准最小修正並實作**：`src/index.css` 的 `html` base rule新增 `overflow-y: scroll`，固定root scrollbar以抑制editor開／關的水平viewport width reflow。此修正不消除scrollY clamp，且桌面可能常態顯示scrollbar。
- **實作後驗證**：正式build及完整既有驗證鏈PASS；文件連結驗證（154份Markdown／363個目標）PASS；`git diff --check` PASS。實際產品CSS的桌面操作回歸與Android實機驗收仍待執行。
- **Next Move**：完成修改後的桌面操作回歸及Android實機驗收；ADR-002其他已淘汰Preview／通知衍生機制拆除與請求放大追查仍依原範圍進行，不因本次root-cause與mitigation完成而宣告整體ADR-002結案。

## 2026-11-23：使用者修正目標後續查——新增卡片實測與目前阻塞

- **目標澄清**：本次核心問題是新增／刪除卡片操作時畫面上下閃動；scrollbar width／左右位移不是本案完成目標，前述scrollbar mitigation不能作為本問題結案證據。
- **隔離環境**：本機 Vite／loopback App，專用Trip `ADR-002-人工測試 (2026-11-23)`；Chrome tab 278050344，viewport 1680×901。原有卡片「景點 2」保留。
- **新增測試 PASS（資料保存）**：新增 synthetic card `ADR002-垂直閃動追查-新增`（12:00–13:00），UI readback確認其已保存。初次trace中scrollY維持0，document scrollHeight／clientWidth在操作前後為901／1680；編輯表單展開階段高度增至1133。LayoutShift source曾捕捉卡片／說明區元素位置變化，但該trace包含多筆背景Mutation及非操作窗口的累積 entries，尚不足以將其歸因於新增卡片上下閃動。
- **測試資料清理未完成**：嘗試刪除該synthetic card，但瀏覽器控制連線後續timeout；reload後確認該卡片仍存在。未確認刪除成功，原卡片「景點 2」未修改。
- **目前BLOCKED**：CDP／Open Browser Use socket timeout，無法繼續可靠捕捉刪除操作及完成synthetic card清理。當前無有效證據可確認新增／刪除卡片的上下閃動根因或直接實作修正。
- **下一步**：恢復可靠的loopback tab控制，先清理上述synthetic card，再以一次操作為窗口重新捕捉新增與刪除事件、CLS source／卡片位置／scrollY／React與DOM identity，並排除observer背景噪訊；只有因果確認後才修改。
- 本輪未修改產品程式／CSS、未操作正式DB／歷史旅程、未commit／push／deploy。

## 2026-11-23：調查方向修訂—程式因果追蹤鏈及歷史證據保留

### 修訂決策
- 既有 S1-A～S1-D 計劃、已取得量測、歷史調查紀錄及失敗／阻塞紀錄均保留，不刪除、不覆寫，也不要求重新取得已經有效的證據。
- **調查方法正式轉向：從畫面現象量測，改為程式執行事件與畫面呈現的因果追蹤。** 既有高度、scroll、Mutation、LayoutShift、DOM identity、Lease及焦點量測作為 baseline／比較證據，並非新測試起點。
- 新增／刪除卡片上下閃動為本輪唯一核心驗收目標；scrollbar width／水平位移不作此項根因或完成判定。先前scrollbar mitigation與其歷史證據仍保留，但不套用為本項解決證明。

### 新測試鏈（必須依序完成，保存證據後再往下）
1. **T0—既有證據盤點與trace基線**：將既有量測、有效／無效trace、測試資料狀態及尚存synthetic card清理狀態整理為基線；不重做已有充分證據的測量。先確認專用Trip及卡片資料，操作前保存必要的唯讀資料快照／記錄。
2. **T1—定位操作入口與呼叫鏈（源碼追蹤）**：新增、刪除 handler、表單 reset、保存入口、保存／reconciliation／local pending／cloud Save RPC及最後資料更新的責任函式，記錄實際檔案、function、分支及呼叫順序。將每個 trace event 綁定可識別來源（function／source location），不得只記抽象事件名稱。
3. **T2—暫時性程式instrumentation**：以診斷限定的短期 instrumentation／測試頁掛接方式，統一 trace ID與毫秒時間戳，捕捉 handler enter/exit、資料/state更新前後、相關setState／store更新、React render及commit、元件mount/unmount、列表及卡片node identity、Lease effect setup/cleanup/status、Realtime、focus/blur、scroll／visualViewport、ResizeObserver、DOM mutation、Performance LayoutShift及可取得的Layout／Paint／frame訊號、保存相關network request/result。每筆事件須標明source；不得記錄敏感資料、token、Authorization或行程內容。若某訊號無法可靠捕捉，明確列為coverage gap，不假稱已取得。
4. **T3—一次操作單一trace**：分開執行新增及刪除案例，每次操作前取得baseline，操作後直到穩定；排除trace窗口外及背景事件。初次trace不完整／受到背景污染即判無效，不以其推論根因。
5. **T4—事件時間軸分析**：從操作入口、資料更新、React commit、DOM／layout、scroll／focus、Paint依時間順序分析；找出第一個與上下位置／畫面呈現異常直接對應的事件及程式來源。區分資料變化、render、commit、DOM replacement、布局變化、scroll reposition與Paint，時間相關不得當因果。
6. **T5—原始程式核對及受控對照**：對定位候選閱讀完整直接呼叫鏈與分支；設計最小、可逆、隔離的對照，單獨排除／確認候選因素。若是複合因果，逐因素驗證。至少以同一操作條件取得可重複trace；不在此階段改產品程式。
7. **T6—完整測試鏈及證據封存**：新增與刪除各完成有效trace、候選對照、重複驗證，整理既有歷史證據與新trace的差異、已排除項、coverage gap及根因結論。全鏈完成前不得提出未有證據支持的修正或宣稱根因成立。
8. **T7—實作方案**：只有T0–T6完整且可核對後，才提出最小實作方案，包含根因及直接證據、對照／反證、修改檔案／function及預期行為、風險與範圍、修正後回歸及實際UI驗收。方案與調查結果先記錄文件，待核准後才實作。

### Trace資料欄位／證據形式
- Trace ID、操作案例（新增／刪除）、開始／結束時間、測試環境與基準狀態。
- 時間戳、事件序號、事件類型、source function／source location、事件前後狀態摘要及對應DOM／元件識別。
- 畫面／layout相關量測、位置／高度、scroll／viewport、node identity及Performance entries；不以mutation count或單一CLS數字代替因果分析。
- 同一時間軸的Network request結果與關聯資訊（僅必要安全摘要）。
- Trace有效性、背景干擾、coverage gap、原始資料位置及分析結果。

### 完成／停止標準
- 新增、刪除兩案例均有有效完整trace，源碼執行鏈可識別且有可核對的事件時間軸。
- 根因候選經原始碼核對及受控重複對照成立或被排除；若證據仍不足，明確保持未確認並指出缺失，不提出猜測性fix。
- 新舊證據互相比對，保留歷史觀察及已證實的獨立viewport問題，不將其誤混入上下閃動根因。
- 完成根因與實作方案文件後才進入修正；本修訂不授權commit／push／deploy或正式環境操作。

## 2026-11-23：Browser Use 跨對話連線故障與成功路徑保存調查

### 本輪實測
- OpenChatX `start_here` 成功，沿用 Agent UUID `c7489ed6-4558-4da9-8c22-ea932352001f`；Project 為 `Travel-Companion`。Runtime health 回報 healthy，Secure MCP Tunnel control plane connected；Browser Use backend `info` 成功，Chrome extension version `1.1.0`、extensionInstanceId `e2310209-f5bd-40f4-8956-e0e0e3130deb`、nativeHostName `com.ifuryst.open_browser_use.extension`。
- Browser Use `ping` 回傳 `pong`；`tabs` 可列出 managed tab `278050344`（`http://127.0.0.1:5173/Travel-Companion/`）；`user_tabs` 可列出 Chrome 現存分頁。
- 對同一 managed tab `278050344` 呼叫 `claim_tab` 多次，均回傳相同錯誤：`read unix @->C:\Users\ahow_ho\AppData\Local\Temp\open-browser-use\8bd9c2a3-ec6b-45b2-99f5-9577fe3c2624.sock: i/o timeout`。因此故障點不是 OpenChatX runtime 整體離線，也不是 Browser Use backend 完全無回應；目前高度集中於接管分頁所依賴的本機 socket／native host request path，但尚未取得 native host process/log 證據，不能確定是程序退出、卡死、請求路由或逾時。
- Computer Use `get_app_state` 可成功取得 Chrome 畫面及 accessibility tree，但當時 key window 顯示另一分頁；它證明桌面控制替代路徑可用，不能視為 CDP/DOM 控制已恢復。

### 對「換對話就重新測」的判定
- **已確認的連線問題：** 新對話中 Browser Use 基本 ping/list 可用，但 `claim_tab` 仍在同一 socket timeout。對話更換不是唯一根因，也沒有證據證明每次都因 tunnel session expiry 而關閉。
- **已確認的交接紀錄缺口：** 專案 `AGENTS.md` 雖允許 Browser Use／Computer Use按可用性切換，但未保存特定成功案例的可重用操作路徑（成功工具、呼叫順序、tab/session識別、成功證據、失效特徵與fallback）。新對話因此只能從通用能力目錄重新查找，無法根據權威紀錄直接復用上次成功路徑。
- **尚未確認：** socket/native host為何逾時、是否有 idle timeout／程序生命週期限制、是否要重啟特定程序或擴充功能。未取得對應 process/log與成功/失敗時點對照前，不作定論，不進行破壞性重啟。

### 可重用路徑（截至本輪）
1. Browser Use：先查 `info`、`ping`、`tabs`、`user_tabs`；確認 tab ID、URL與目標後 `claim_tab`；接管成功後使用 `page_info`／CDP。`ping`成功不代表 `claim_tab`成功，兩者需分開記錄。
2. 若 Browser Use claim/page_info/CDP 因上述 socket error 失敗，不得反覆重試同一呼叫或重新走一遍功能測試；改用 Computer Use取得 Chrome狀態／畫面，先確認 key window與分頁，再執行必要桌面操作。Computer Use不提供等價DOM/CDP保證；需DOM時必須另找已授權且可驗證的路徑。
3. 新對話若 backend extensionInstanceId、nativeHostName、managed tab及socket path未變，應先比對此紀錄；若識別值改變，記錄為環境／連線實例變更，不沿用舊結論。
4. 只有在取得 native host／程序狀態與log，且確認安全影響後，才決定是否重啟服務；禁止未診斷即重啟整個Chrome、清除使用者profile或更改全域設定。

### 下一個診斷切片
- 取得 Open Browser Use native host／extension bridge的程序狀態及日誌位置，確認socket server是否仍存活、最後活動時間與錯誤原因；對照 extensionInstanceId與socket path。
- 定位上一輪成功的 Browser Use session／Computer Use操作紀錄，補回其成功工具、具體呼叫順序與前置條件；成功結果必須寫回本文件，讓下一對話直接沿用。
- 在不重啟、不清理Chrome profile的前提下，先驗證原生 CLI／Computer Use或另一已授權DOM入口是否可提供所需控制；只在明確安全且有證據時修復native host。
- 本輪尚未恢復 `claim_tab`／CDP，未清理 synthetic card，未修改瀏覽器設定、程序或擴充功能。
## 2026-11-23：手動新增仍出現多次更新；臨時追蹤程式清理

### 使用者手動測試回報
- 使用者在本機手動新增卡片，按下保存後仍觀察到畫面／資料重複更新約兩至三次才完成保存。這是最新使用者觀察；本輪未對該次操作取得同步瀏覽器事件與 Network trace，故不能直接將其等同於兩至三次 `saveItem()` 或雲端 Save RPC。

### 本機程式落地狀態
- 前一輪臨時 ADR-002 instrumentation 曾寫入 `src/App.tsx`、`src/components/ItineraryPage.tsx`、`src/hooks/useTripWorkspace.ts`，但只供診斷，並非正式修正，也未 commit／push／deploy。
- 發現一段未完成的 `cardSaveInFlightRef` 防重入 guard：設為 true 後沒有對應解除；本輪已移除該 guard，恢復原本 `isItemSaving` 條件，避免留下可能阻擋後續保存的永久鎖定。
- 本輪已清除三個 source files 中的臨時 trace helper／call sites、DOM observer、卡片 ref registry 與 trace 狀態引用；原本既存的 P3 preview-removal 變更及既存 card ref 行為均保留。原始碼搜尋確認不再有 `adr002Trace`／`adr002SaveTrace`／`adr002AppTrace`／`__ADR002_TRACE__` 參照。

### 保存鏈與 Lease effect 程式證據
- `saveItineraryTripDetail()` 單一呼叫內會先寫本機 Trip／Pending、更新 sync snapshot與 `currentTrip`；接著取得 Trip Lease、讀取雲端 version／Trip、reconcile Pending，再依結果更新 `currentTrip`，最後執行 Save RPC／更新 Synced state／最終 Trip。這些 state transition 本身可能引發多次 React render；render 次數不能直接視為重複保存或重複 RPC。
- `ItineraryPage` 的 Lease effect dependency 包含 `trip.content.daysData` 物件參照；effect 初始化會切到 `loading`，完成 lease list refresh 後切到 `ready`，cleanup 會移除舊 subscription。上述保存鏈數次替換 `daysData` 物件時，會重新觸發此 effect setup／cleanup。
- 前一輪受控程度不足的新增 trace 曾觀察到 Lease loading 提示插入／移除；Day panel高度由約 660.5px 變至約 710.0px，再回到 660.5px（約 49.5px變化；提示自身高度約37.5px）。該筆 trace 有測試操作重複新增造成的資料污染，不能用來證明完整閃動因果或每次 render數量；只支持 Lease lifecycle／狀態提示是候選位移來源。

### 驗證結果及界線
- **PASS** `npx tsc --noEmit`。
- **PASS** `npm run build`：完整既有 regression／契約驗證鏈及 Vite production build通過（Vite v8.0.16，1943 modules，built in 1.16s）。
- **PASS** `git diff --check`。
- 本輪只清除臨時診斷程式及補記進度，未修改正式資料庫、migration、Secrets、Edge Function；未 commit／push／deploy。
- **尚未解決**：沒有取得使用者最新手動操作的逐事件 trace，故尚無法分辨兩至三次更新究竟是 React render、Lease loading／ready提示、`saveItineraryTripDetail()`重入、重複 Save RPC，或焦點／viewport變動。不得把 Lease dependency候選宣告為根因，也不得將 build PASS當成 UI驗收 PASS。

### 下一步
1. 使用乾淨的 ADR-002 synthetic test Trip，單次按下新增保存一次，不重複點擊；操作前後核對卡片數與穩定 ID。
2. 同一時間窗記錄 `saveItem` handler enter次數、`saveItineraryTripDetail` enter及 existingSave、Pending revision、Lease effect setup／cleanup與 status、Save RPC request數、React Profiler commit、卡片 `article` node identity、Day panel rect、focus／blur、`visualViewport`與 `scrollY`。
3. 若只有一個 handler／workspace save／RPC，但出現多次 render或Lease flap，才針對狀態／effect耦合提出最小修正；若 handler或RPC真的重複，沿呼叫來源追查，不以增加防重入 flag掩蓋問題。
4. 完成新增與刪除的隔離重複對照後，才判定根因及提出修正；保留本階段ACTIVE，未授權的正式資料操作、commit／push／deploy不執行。
### 本次文件修訂狀態（2026-11-23更新）
- **方向修訂已記錄；新測試鏈尚未執行。** 先前 Browser Use `claim_tab` socket timeout不再列為待診斷事項；使用者已明確要求停止追查，後續直接採已成功的 Computer Use／必要時 CDP 替代路徑，不重複調查socket/native host。
- 前一輪在 `src/App.tsx`、`src/components/ItineraryPage.tsx`、`src/hooks/useTripWorkspace.ts` 寫入的臨時追蹤程式已於本輪清除；未完成的 `cardSaveInFlightRef` guard亦已移除。原先的 Preview-removal 工作樹變更保留，沒有覆蓋或提交。
- 使用者最新手動回報：按下新增卡片保存後，畫面／資料仍重複更新約兩至三次才完成。尚無該次操作同步取得的完整事件trace，不可將畫面更新次數等同 save handler、workspace save或雲端 Save RPC次數。
- 乾淨測試基線已經重載確認只剩原始卡片「景點 2」；本輪沒有再新增測試卡，也未更動使用者正式旅程。
- 本輪完成 TypeScript與完整 `npm run build`、`git diff --check`；均PASS。這些是靜態／建置驗證，不是手動UI閃動驗收。
- 下一步應使用隔離 synthetic Trip及可觀測的本機頁面，執行一次單擊新增、一次刪除；同步記錄 handler／workspace save／Save RPC數量、Lease effect setup／cleanup、React Profiler commit、卡片DOM identity、Day panel rect、focus／visualViewport／scrollY。未完成前不宣稱根因成立。
## 2026-11-23：Browser Use 跨對話連線故障與成功路徑保存調查

### 本輪實測
- OpenChatX `start_here` 成功，沿用 Agent UUID `c7489ed6-4558-4da9-8c22-ea932352001f`；Project 為 `Travel-Companion`。Runtime health 回報 healthy，Secure MCP Tunnel control plane connected；Browser Use backend `info` 成功，Chrome extension version `1.1.0`、extensionInstanceId `e2310209-f5bd-40f4-8956-e0e0e3130deb`、nativeHostName `com.ifuryst.open_browser_use.extension`。
- Browser Use `ping` 回傳 `pong`；`tabs` 可列出 managed tab `278050344`（`http://127.0.0.1:5173/Travel-Companion/`）；`user_tabs` 可列出 Chrome 現存分頁。
- 對同一 managed tab `278050344` 呼叫 `claim_tab` 多次，均回傳相同錯誤：`read unix @->C:\Users\ahow_ho\AppData\Local\Temp\open-browser-use\8bd9c2a3-ec6b-45b2-99f5-9577fe3c2624.sock: i/o timeout`。因此故障點不是 OpenChatX runtime 整體離線，也不是 Browser Use backend 完全無回應；目前高度集中於接管分頁所依賴的本機 socket／native host request path，但尚未取得 native host process/log 證據，不能確定是程序退出、卡死、請求路由或逾時。
- Computer Use `get_app_state` 可成功取得 Chrome 畫面及 accessibility tree，但當時 key window 顯示另一分頁；它證明桌面控制替代路徑可用，不能視為 CDP/DOM 控制已恢復。

### 對「換對話就重新測」的判定
- **已確認的連線問題：** 新對話中 Browser Use 基本 ping/list 可用，但 `claim_tab` 仍在同一 socket timeout。對話更換不是唯一根因，也沒有證據證明每次都因 tunnel session expiry 而關閉。
- **已確認的交接紀錄缺口：** 專案 `AGENTS.md` 雖允許 Browser Use／Computer Use按可用性切換，但未保存特定成功案例的可重用操作路徑（成功工具、呼叫順序、tab/session識別、成功證據、失效特徵與fallback）。新對話因此只能從通用能力目錄重新查找，無法根據權威紀錄直接復用上次成功路徑。
- **尚未確認：** socket/native host為何逾時、是否有 idle timeout／程序生命週期限制、是否要重啟特定程序或擴充功能。未取得對應 process/log與成功/失敗時點對照前，不作定論，不進行破壞性重啟。

### 可重用路徑（截至本輪）
1. Browser Use：先查 `info`、`ping`、`tabs`、`user_tabs`；確認 tab ID、URL與目標後 `claim_tab`；接管成功後使用 `page_info`／CDP。`ping`成功不代表 `claim_tab`成功，兩者需分開記錄。
2. 若 Browser Use claim/page_info/CDP 因上述 socket error 失敗，不得反覆重試同一呼叫或重新走一遍功能測試；改用 Computer Use取得 Chrome狀態／畫面，先確認 key window與分頁，再執行必要桌面操作。Computer Use不提供等價DOM/CDP保證；需DOM時必須另找已授權且可驗證的路徑。
3. 新對話若 backend extensionInstanceId、nativeHostName、managed tab及socket path未變，應先比對此紀錄；若識別值改變，記錄為環境／連線實例變更，不沿用舊結論。
4. 只有在取得 native host／程序狀態與log，且確認安全影響後，才決定是否重啟服務；禁止未診斷即重啟整個Chrome、清除使用者profile或更改全域設定。

### 下一個診斷切片
- 取得 Open Browser Use native host／extension bridge的程序狀態及日誌位置，確認socket server是否仍存活、最後活動時間與錯誤原因；對照 extensionInstanceId與socket path。
- 定位上一輪成功的 Browser Use session／Computer Use操作紀錄，補回其成功工具、具體呼叫順序與前置條件；成功結果必須寫回本文件，讓下一對話直接沿用。
- 在不重啟、不清理Chrome profile的前提下，先驗證原生 CLI／Computer Use或另一已授權DOM入口是否可提供所需控制；只在明確安全且有證據時修復native host。
- 本輪尚未恢復 `claim_tab`／CDP，未清理 synthetic card，未修改瀏覽器設定、程序或擴充功能。
## 2026-11-23：手動新增仍出現多次更新；臨時追蹤程式清理

### 使用者手動測試回報
- 使用者在本機手動新增卡片，按下保存後仍觀察到畫面／資料重複更新約兩至三次才完成保存。這是最新使用者觀察；本輪未對該次操作取得同步瀏覽器事件與 Network trace，故不能直接將其等同於兩至三次 `saveItem()` 或雲端 Save RPC。

### 本機程式落地狀態
- 前一輪臨時 ADR-002 instrumentation 曾寫入 `src/App.tsx`、`src/components/ItineraryPage.tsx`、`src/hooks/useTripWorkspace.ts`，但只供診斷，並非正式修正，也未 commit／push／deploy。
- 發現一段未完成的 `cardSaveInFlightRef` 防重入 guard：設為 true 後沒有對應解除；本輪已移除該 guard，恢復原本 `isItemSaving` 條件，避免留下可能阻擋後續保存的永久鎖定。
- 本輪已清除三個 source files 中的臨時 trace helper／call sites、DOM observer、卡片 ref registry 與 trace 狀態引用；原本既存的 P3 preview-removal 變更及既存 card ref 行為均保留。原始碼搜尋確認不再有 `adr002Trace`／`adr002SaveTrace`／`adr002AppTrace`／`__ADR002_TRACE__` 參照。

### 保存鏈與 Lease effect 程式證據
- `saveItineraryTripDetail()` 單一呼叫內會先寫本機 Trip／Pending、更新 sync snapshot與 `currentTrip`；接著取得 Trip Lease、讀取雲端 version／Trip、reconcile Pending，再依結果更新 `currentTrip`，最後執行 Save RPC／更新 Synced state／最終 Trip。這些 state transition 本身可能引發多次 React render；render 次數不能直接視為重複保存或重複 RPC。
- `ItineraryPage` 的 Lease effect dependency 包含 `trip.content.daysData` 物件參照；effect 初始化會切到 `loading`，完成 lease list refresh 後切到 `ready`，cleanup 會移除舊 subscription。上述保存鏈數次替換 `daysData` 物件時，會重新觸發此 effect setup／cleanup。
- 前一輪受控程度不足的新增 trace 曾觀察到 Lease loading 提示插入／移除；Day panel高度由約 660.5px 變至約 710.0px，再回到 660.5px（約 49.5px變化；提示自身高度約37.5px）。該筆 trace 有測試操作重複新增造成的資料污染，不能用來證明完整閃動因果或每次 render數量；只支持 Lease lifecycle／狀態提示是候選位移來源。

### 驗證結果及界線
- **PASS** `npx tsc --noEmit`。
- **PASS** `npm run build`：完整既有 regression／契約驗證鏈及 Vite production build通過（Vite v8.0.16，1943 modules，built in 1.16s）。
- **PASS** `git diff --check`。
- 本輪只清除臨時診斷程式及補記進度，未修改正式資料庫、migration、Secrets、Edge Function；未 commit／push／deploy。
- **尚未解決**：沒有取得使用者最新手動操作的逐事件 trace，故尚無法分辨兩至三次更新究竟是 React render、Lease loading／ready提示、`saveItineraryTripDetail()`重入、重複 Save RPC，或焦點／viewport變動。不得把 Lease dependency候選宣告為根因，也不得將 build PASS當成 UI驗收 PASS。

### 下一步
1. 使用乾淨的 ADR-002 synthetic test Trip，單次按下新增保存一次，不重複點擊；操作前後核對卡片數與穩定 ID。
2. 同一時間窗記錄 `saveItem` handler enter次數、`saveItineraryTripDetail` enter及 existingSave、Pending revision、Lease effect setup／cleanup與 status、Save RPC request數、React Profiler commit、卡片 `article` node identity、Day panel rect、focus／blur、`visualViewport`與 `scrollY`。
3. 若只有一個 handler／workspace save／RPC，但出現多次 render或Lease flap，才針對狀態／effect耦合提出最小修正；若 handler或RPC真的重複，沿呼叫來源追查，不以增加防重入 flag掩蓋問題。
4. 完成新增與刪除的隔離重複對照後，才判定根因及提出修正；保留本階段ACTIVE，未授權的正式資料操作、commit／push／deploy不執行。

## 2026-11-23：Lease lifecycle dependency 最小修正與初步驗證

- **修正**：`src/components/ItineraryPage.tsx` Lease effect dependency由 `[activeDay, canUseEditLeases, supabase, trip.content.daysData, trip.id]` 收斂為 `[canUseEditLeases, supabase, trip.id]`。effect內不使用 `activeDay`／`daysData`；Trip-level訂閱不因卡片內容參照更新重啟。
- **保留**：原有Lease list refresh、Realtime subscription／SUBSCRIBED refresh、visibility/focus refresh、refresh queue、error狀態、cleanup及 `editLeaseRefreshRef`。未新增refresh機制，未更改Save RPC／CAS／Pending／Recovery。
- **隔離UI保存測試**：專用loopback Trip `ADR-002-人工測試`的測試卡標題先改為 `ADR002_MEASURE_VALIDATION_20261123__lease_test` 保存成功，隨後復原原標題 `ADR002_MEASURE_VALIDATION_20261123`再次保存成功。fetch instrumentation觀察兩次save RPC、4次Lease list RPC、4次Lease release RPC；計數涵蓋兩次保存，不能單獨證明effect setup／cleanup數。
- **界線**：未捕捉直接的React Profiler、effect setup／cleanup、status flap或卡片DOM identity；Mutation observer未觀察到明確loading文字。保存／復原及Lease refresh請求仍存在已驗證，但尚未直接證明閃動因果已消失。
- **Build PASS**：Node 22.23.2／npm 10.9.8下 `npm run build`完整既有regression、TypeScript、production build及postbuild chain PASS，含ADR-001 S3及ADR-002 preview-removal verifier。
- **下一步**：依既有事件因果追蹤計畫直接量測Lease effect setup／cleanup、status transition、DOM identity及Day panel位置；在專用Trip分別完成新增與刪除受控trace。尚未commit／push／deploy。

## 2026-11-23：新增卡片時間排序跳動追查（後續項目）

- **使用者回報**：新增卡片「台北101」填到達時間09:00、離開時間未填（程式自動補為09:00）後，卡片排列持續上下交替跳動；管理模式退出仍不穩定，刷新頁面後才穩定。另一瀏覽器亦觀察到同步跳動，暗示需追查共享資料更新／重套順序來源，但尚未證明。
- **補充測試條件**：手動新增一筆到達及離開時間均填妥的卡片曾正常保存並依規則定位；依相同標準再次輸入到達／離開時間仍會跳動。因此「離開時間空白」不是目前已證實的唯一觸發條件。
- **正式排序規則（文件36／V3.8.0）**：daysData陣列位置為唯一正式順序；新增依時間插入；編輯既有卡片時間不自行改變位置；顯示不強制全表依時間重新排序；手動排序須保存陣列順序。
- **目前程式核對**：`sortItineraryItemsByTime()`依 `item.time`（到達時間）排序，有時間卡片由早到晚、無時間卡片排後方並穩定保留相對順序。新增流程會對整份 `nextEvents`呼叫排序，而編輯既有卡片不重新排序。正常有效資料時排序結果通常與依時間插入相同，但實作操作方式與正式規則描述仍有細節差異。
- **初步判斷／限制**：排序函式為確定性函式，尚未直接捕捉跳動期間兩份資料／陣列順序交替及其寫入來源。跨瀏覽器同步現象優先支持追查共享更新／資料套用路徑；排序實作差異僅為待驗證候選，尚不能宣告根因。
- **追蹤方式**：納入ADR-002後續，不另開ADR。下一步直接追查daysData陣列順序被重新產生、覆蓋或套用的更新來源，並以卡片ID及排序序列時間戳比對，必要時受控驗證兩種時間輸入條件。
- **新增的可重現程式證據（2026-11-23）**：直接以目前 `src/services/itinerarySync.ts` 的 `mergeItineraryDaysData()`執行對照：base陣列 `[A,B]`；local新增已排序卡片後為 `[N,A,B]`；cloud仍為base `[A,B]`。結果merge status=`merged`，但merged order=`[A,B,N]`。原因為 `orderChanged()`只比較base既有卡片的相對順序，忽略新卡片插入位置；因此這種「新增卡片插入」不會被認定為既有卡片排序改變，`mergeOneSidedOrder()`會先沿用base順序，再把新ID追加，重現排序位置丟失。
- **判斷**：此為已直接重現且確認的同步合併排序缺陷，能解釋保存／同步流程將新卡片插入位置重置至尾端的情況；仍需透過實際畫面與同步trace確認它是否是使用者觀察到反覆跳動的完整因果鏈（例如兩種陣列版本反覆套用）。

- **最新追查結果**：直接測試目前 `mergeItineraryDaysData()`：Base=`[A,B]`、Local（新增卡片已依時間插入）=`[N,A,B]`、Cloud仍為Base=`[A,B]`，實際回傳 status=`merged`、順序=`[A,B,N]`。已證實同步合併會丟失新卡片插入位置。`orderChanged()`僅比較Base既有卡片相對順序，未將新ID插入位置視為排序變更；`mergeOneSidedOrder()`沿用Base並追加新ID，導致排序位置失真。
- **合併修正（2026-11-23）**：已定位完整保存／套用鏈：`ItineraryPage.saveItem()` 產生依到達時間排序的 `daysData`，交由 `App.tsx` 傳入 `useTripWorkspace.saveItineraryTripDetail()`；該函式先保存本機 Pending，再讀取最新 cloud snapshot，透過 `reconcilePendingItinerarySyncState()` 呼叫 `mergeItineraryDaysData()`。Reconciliation 結果會寫入 Pending、local Trip record，並以 `setCurrentTrip()` 套回畫面，之後才呼叫 itinerary Save RPC。故錯誤合併結果確實會被保存流程重新套回 UI，而非單純 render 重排。
- **程式修正**：`src/services/itinerarySync.ts` 現在分開判定既有 Base 卡片的相對順序變更與新增卡片；不涉及既有卡片重排時，按前一張 Base 卡片錨點合併 local／cloud 新增項目，保留其插入位置；單邊既有順序變更沿用變更端順序，雙邊既有順序不相容仍建立原有 day-level order conflict。刪除的 Base 錨點不在最終序列時，其後新增項目接回最近仍保留的前序位置。
- **新增回歸**：`scripts/verify-v31012-itinerary-sync.mjs` 覆蓋 local 頭部／中間插入、cloud 中間插入、雙端同一插入位置、刪除與另一端新增，以及 `reconcilePendingItinerarySyncState()` 將插入順序保留於 `pendingDaysData` 的實際保存收斂層案例。專責 verifier PASS。
- **測試結果**：`npm run verify:v31012-itinerary-sync` PASS；`npm run verify:itinerary-order` PASS；`npm run test:p0-pending-autosync-idempotency` PASS；`npm run verify:adr001-s3-app-integration` PASS；完整 `npm run build` PASS（全套既有 regression、TypeScript app/node、Production Vite/PWA build、postbuild browser-security 與 weather bundle checks）。
- **使用者實際驗收 PASS（2026-11-24）**：使用者在本機開發環境 `http://localhost:5173/Travel-Companion/` 實際新增卡片，確認「不管有無時間，都不會再發生跳動，且有遵照時間規則排列卡片」，並明確回報「此項修正有效」。此為本項新增卡片排序／畫面跳動修正的產品驗收證據；不再把該項使用者可見問題列為待驗收。
- **驗收範圍**：確認新增卡片在有時間及無時間條件下均不再跳動，且排列遵照既定時間規則。未因此宣告 ADR-002 其他保存、刪除、遠端更新或 Lease lifecycle 調查全部結案。
- **Git／範圍**：保留工作樹既有其他未提交修改。未執行 commit／push／deploy。

## 2026-11-24：ADR-001 Trip Edit Lock 前端入口回歸調查（歷史紀錄；後續已完成）

- **使用者回報**：A 瀏覽器已進入每日行程管理編輯；B 瀏覽器仍能進入管理並新增卡片、調整順序、調整時間，使用者判定 ADR-001 單一編輯權功能失效。此為新的權限／管理入口問題，與新增卡片排序跳動修正分開追蹤。
- **權威契約**：ADR-001 Accepted 決策明定鎖定單位為整趟 Trip，同一 Trip 同一時間只允許一個有效持有者編輯每日詳細行程；S4 P3 明定進入管理／編輯時應主動原子取得 Trip Edit Lock，並在允許編輯前取得必要最新資料／版本。
- **已確認的前端缺口**（`src/components/ItineraryPage.tsx`）：`toggleManageMode()` 直接 `setIsManageMode(true)` 並只呼叫 Lease list refresh，沒有 claim Trip Lease；管理入口按鈕 `disabled={!canManageItinerary}`，只檢查帳號權限／online／歷史旅程，未檢查遠端持有者或本端有效 Lease。`startCreateItem()` 同樣未檢查 `hasRemoteLeaseOnActiveDay` 或 `hasValidEditingLease`，因此遠端 Trip Lease 存在時新增入口仍可開啟表單。
- **另已確認的明確產品放行行為**：Lease list refresh 偵測到其他 client 持有 Trip Lease 時，只關閉排序與時間調整模式；狀態提示明確顯示「新增活動仍可使用」。這與單一 Trip 編輯權契約直接衝突，不是推測。
- **其他操作路徑**：`startOrderAdjustment()`／`saveOrder()`、`startTimeAdjustment()` 已檢查 `hasRemoteLeaseOnActiveDay`；編輯既有卡片會先 claim Lease。新增 `saveItem()` 只有在 `editingIndex !== null`（編輯既有卡片）時檢查 `hasValidEditingLease`，新增卡片分支沒有相同前端 Lease guard。排序／時間調整保存交由 workspace save flow再 claim Lease。
- **Server-side protection source review**：migration `20261120120000_adr001_stage1_trip_itinerary_edit_enforcement.sql` 中 `tc_claim_itinerary_trip_edit_lease()` 使用原子 UPSERT，只允許 Lease 過期或同 user/client 時取得；`tc_save_itinerary_days()` 在交易內鎖 Lease row，檢查 `auth.uid()`、client id 及 expiry，不符合即以 `ADR001_EDIT_LEASE_REQUIRED` 拒絕，之後才寫入並推進 version。因此目前源碼證據支持 Save RPC 的伺服器端保護仍存在；但此處尚未以第二個獨立 Auth context 實際呼叫 RPC 驗證 B 的拒絕結果。
- **本機 Runtime probe**：localhost App目前唯一可控頁籤為 tab `446450590`，登入 `weather-rc-test@example.invalid`，Trip `test-1`（id `trip-b4afae0b-f621-4eb0-93f4-719bb18e07be`）。以其既有頁面 session 呼叫 `tc_claim_itinerary_trip_edit_lease` 成功取得 Lease，`tc_list_itinerary_trip_edit_leases` 隨後讀回同一 user/client；呼叫 `tc_release_itinerary_trip_edit_lease` 回傳 true，再次 list 為空。這只驗證同一 session Claim/List/Release基本路徑，不構成 A/B 競爭驗證；未修改 Trip／daysData／version。
- **觀測限制**：目前 browser tool managed tabs僅一個 localhost App分頁，沒有第二個獨立登入 session；不能把既有同身份多分頁冒充第二個 user。表格直接 REST SELECT因 authenticated 對 Lease table無 SELECT權限而回403，符合使用 RPC 讀取設計；透過 `tc_list_itinerary_trip_edit_leases` RPC讀取成功。
- **暫定判斷**：前端管理模式／新增卡片入口明確違反 ADR-001 單一持有者規則，已可定案為功能缺口。尚不能由現有證據宣稱 B 的新增保存已寫入雲端或 server-side Lease／Save RPC也失效；這必須保留為待驗項。
- **下一步**：最小修正應讓進入管理模式先原子 claim Trip Lease，成功後才開啟管理 UI；Lease list refresh若發現遠端持有者，應立即關閉本端管理／排序／時間調整／新增入口並阻擋所有新增／修改／刪除／排序／時間操作；保存時仍以 Save RPC作最後權威驗證。實作前須先核對 close／release lifecycle 及現有 workspace save flow，避免重複 claim、過早 release或把save lifecycle Lease當成管理 Lease後遺失鎖。此項目前是調查結論及建議，尚未改程式，未新增回歸測試。
- **Git／範圍**：本輪未修改產品程式／資料庫／migration，未commit／push／deploy；曾用頁面目前登入 session執行一次 Lease claim後已正常 release，readback確認 Lease list為空。既有工作樹修改保留。

## 2026-11-24：ADR-001 Trip Edit Lock 管理入口修復

- **修復內容**：管理入口改為先 Claim Trip-level Lease，確認 claim 成功且 owner client ID為本端後才開啟管理模式；管理期間以既有 Lease renew API定期續租並於前景／focus重新確認。Claim未成功則不開管理模式。
- **操作封鎖**：管理模式未取得／已失去 Trip Lease時，新增、既有卡片編輯、複製、照片、刪除、排序及時間調整入口均需有效 managed lease；`saveItem()`也增加保存前 managed lease guard。遠端 Lease出現時，立即關閉本端管理／表單／排序／時間調整並停用所有管理入口，文案不再宣稱新增可使用。
- **Lease／Save lifecycle**：管理模式使用Trip-level Lease heartbeat；管理期間 workspace save仍會原子 claim／驗證Lease，但在 managed lease registry有效時，不會於save finalizer提前release管理Lease。管理退出先阻止尚在保存中的退出，清理表單／模式後release managed Lease；offline/unmount cleanup清除本端registry及timer並嘗試release（離線時由server expiry回收）。
- **回歸測試**：更新 `scripts/verify-v31012-itinerary-sync.mjs` 舊管理模式契約，新增管理入口先claim、成功owner驗證、heartbeat、managed registry、新增save guard、退出release與workspace save不提前release的 assertions；`scripts/verify-adr001-s3-app-integration.mjs` 亦新增管理Lease lifecycle assertions。兩專責 verifier及全套build均PASS。
- **Build／測試**：`npm run verify:v31012-itinerary-sync` PASS；`npm run verify:adr001-s3-app-integration` PASS；完整 `npm run build` PASS（全套既有 verifier、app/node TypeScript、Vite production build及postbuild）。Build使用已確認 host `HOWARD-NEWPC`、Node `v22.23.2`、npm `10.9.8`。
- **本機雙client runtime驗證**：在 localhost `test-1` Trip，兩個同一Auth user但各自不同 sessionStorage client ID的client（client ID `7ac73ba7-d6e2-4315-ab46-848c6cd3a2de`及`0f514374-7794-4de1-9691-0351690324dc`）先後測試。Client B成功進入管理；重新載入Client A後，管理入口disabled、管理UI未開啟，且顯示遠端持有者提示。B退出管理後，再重新載入A，管理入口恢復enabled、遠端提示消失。兩client均未新增／修改／刪除／排序／調整時間或改動Trip資料；Lease正常退出，未留測試lock。
- **Runtime驗證限制**：此為同一Auth身份下兩個不同client ID的本機競爭驗證，不等同第二個獨立Auth身份／正式跨帳號測試；亦未故意繞過UI向Save RPC提交未持有Lease的寫入。Save RPC的server-side Lease enforcement仍依migration源碼及既有契約 verifier確認，未宣稱獨立Auth runtime拒絕測試已完成。
- **工作樹保護／Git**：保留原先已有的 `src/components/ItineraryPage.tsx`、`scripts/verify-v3920-other-info-categories.mjs`、ADR-002等未提交修改；未commit／push／deploy。只修改此次必要的管理Lease程式與兩份 verifier；build產物由既有build流程生成，未commit。

## 2026-11-24：新增卡片表單及 Lease 警告時機調整

- **使用者需求**：初次新增卡片時，活動標題輸入後點地圖地點欄位可觸發自動帶入；只新增此行為，既有自動帶入／地點規則及已確認 Place 不帶入規則保持不變。新增表單提交按鈕左側增加取消。遠端 Trip Lease警告只在使用者嘗試管理且被阻擋後出現，不應在單純閱覽時出現；警告的「重新確認」不可擅自退出管理或令管理入口失效。
- **程式修改**：地圖地點輸入欄位focus時，僅在初次新增（`editingIndex === null`）、無合規 confirmed Place、地點欄位目前空白且活動標題非空時填入標題；不改動onChange、既有地點搜尋／確認及已確認Place行為。新增表單底部按鈕改為左右排列「取消」與「新增行程」；取消沿用resetForm清理。
- **警告時機／動作**：新增 `showRemoteLeaseAttemptNotice` state；一般閱覽不顯示遠端Lease警告。管理入口保持可點擊但仍需先claim，若遠端Lease阻擋則記錄attempt並顯示警告；警告「重新確認」只清除提示並refresh Lease list，不呼叫 closeManageMode／release。Lease釋放後refresh會清除attempt notice。既有管理／保存操作的Lease guard不放寬。
- **使用者實際驗收（2026-11-24）**：使用者回報 A退出管理後，B立即可進入管理並重新驗證編輯功能通過。此為管理Lease釋放／再取得的實際驗收證據，記錄為PASS；不宣稱新表單focus帶入及警告顯示時機已經使用者runtime驗收。
- **回歸／建置**：更新 `scripts/verify-v31012-itinerary-sync.mjs` assertions覆蓋警告需有管理阻擋attempt、重新確認只refresh、地圖欄位focus條件與新增取消按鈕。`npm run verify:v31012-itinerary-sync` PASS；`npm run verify:adr001-s3-app-integration` PASS；完整 `npm run build` PASS（全套 verifier、App/Node TypeScript、production Vite/PWA及postbuild）；`npm run verify:docs-links` PASS（155份Markdown／364個本地目標）；`git diff --check` PASS。
- **使用者實際回歸驗收（2026-11-24）**：使用者確認以下三項 UI 測試均通過：1. 初次新增卡片時，活動標題於地點欄位 focus 後正確帶入，且既有合規 confirmed Place 不被覆蓋；2. 新增表單取消按鈕可正常取消並清理表單；3. 單純閱覽遠端 Lease 不顯示警告，嘗試管理遭阻擋後才顯示警告，重新確認不退出管理／不使管理入口失效。此為三項新 UI 修改的使用者實際回歸驗收，均記錄 PASS。
- **驗收整合**：連同前述 A 退出管理後 B 可立即重新取得管理權並通過編輯功能的驗收，這組管理Lease與新增卡片表單／警告時機調整已完成使用者指定項目的回歸驗收；不代表 ADR-002 其餘保存／刪除／遠端更新及Lease生命週期調查已結案。
- **Git／範圍**：保留工作樹其他既有修改；未commit／push／deploy。

## 2026-11-23：管理提示文字位移問題已解決（使用者驗收回報）

- 使用者確認：儲存或刪除卡片時，管理欄位多次反覆出現提示文案造成卡片上下移動、畫面上下閃動的問題已解決；目前卡片不再因提示文案反覆出現／消失而上下移動。
- 此項視為該特定提示文案造成的位移現象已解決；與本日新增的時間排序／跨瀏覽器排列跳動回報分開追蹤，不將兩者混為同一問題或根因。

## 2026-11-24：工作項目重新分類與修正後使用者觀察測試

- **保存／刪除／遠端更新的影片分析追查：已結案（限定影片直接視覺原因及已修正現象）。** `ADR-002-video-analysis.md` 已直接定位 `editLeaseStatus === "loading"` 時新增的暫態文字區塊，造成管理區增加約49.5px並令下方卡片位移；該影片觀察已與程式條件核對。使用者其後回報保存／刪除時提示文字反覆出現造成卡片上下移動的問題已修正。這項原先泛列的「保存／刪除／遠端更新動態追查」不再單獨阻塞結案；不將其延伸成所有保存／遠端同步資料契約均已完整測試。
- **ADR-001 跨 Auth server-side 拒絕（歷史規劃，已由既有證據覆蓋）：** 後續 ADR-001 S4 已完成 SR-11 雙 Auth session／JWT 自動化 API／DB 契約驗證，並於 2026-11-22 達成原 S4 Exit PASS；2026-11-24 新增範圍亦完成人工驗收及 Exit PASS。此項不再安排額外補測、不重開 ADR-001 Exit。
第一輪交叉核對（歷史程式分析；實作與最終驗收依下方結案紀錄及 ADR-001 S4）：改動涵蓋管理入口 Claim、Heartbeat／foreground renew、保存期間 Lease 保留、save/delete guard、排序／時間調整／複製 guard、remote Lease event 時退出管理、workspace save 完成後不提前 release，以及 merge order 插入位置保留。既有 verifier assertions 覆蓋部分管理 Lease lifecycle 及 sync merge insertion/deletion/conflict；後續另完成程式與自動化驗證，並由使用者回報人工 UI 驗收通過。
  - **Save／資料保護：** `saveItem`、排序／時間調整及相關操作入口都有本端 managed Lease／scope／ready狀態guard；雲端最終仍由ADR-001 Save RPC／CAS／DB enforcement保障。現有修改沒有直接改動Save RPC／DB契約。\n  - **Pending／reconciliation：** `useTripWorkspace` 的save-finally release條件新增 `isManagedItineraryTripLeaseActive(tripId)`，避免管理模式持鎖期間保存完成即釋放；`itinerarySync`修改了合併時插入卡片位置／anchor與雙方插入處理，`verify-v31012-itinerary-sync`增加本地／雲端中間插入及同anchor插入案例。這些範圍已由相關contract assertions覆蓋，但實際跨裝置Pending／Recovery仍非本輪程式分析可證明。\n  - **Lease lifecycle／權限：** 管理入口claim成功才開管理；heartbeat／focus renew失敗會清除managed flag、停止管理；remote Lease event會停止管理並清除操作狀態；退出管理會release。需進一步核對異常分支及release結果是否被上層正確處理，尤其 `releaseManagedTripLease()`失敗回傳目前未阻止 `closeManageMode()`完成UI退出；可能是UI退出但Lease到期回收的設計，不推定為漏洞，需明確記錄。\n  - **分析界線：** 已確認修改入口／guard及既有測試覆蓋方向；未直接重跑測試、未做完整runtime recovery驗證，也未宣稱全部ADR-001安全契約已由這些修改證明。完成最後逐項靜態核對後，若沒有契約缺口，這項工作以程式分析結案，不新增泛化回歸測試。
- **一次修正後觀察測試：** 在使用者可操作的修正後環境，依序完成以下操作；觀察畫面是否有異常跳動，並記錄／回報結果。結果先記錄，不預設 PASS。
  1. **新增卡片**
     - 在管理模式新增一張測試卡片。
     - 觀察新增時畫面是否閃動、跳動、卡片突然消失再出現。
     - 留意游標、焦點或捲動位置是否突然改變。
  2. **保存既有卡片**
     - 修改一張既有卡片，保存。
     - 觀察卡片是否突然上下移動、列表重新載入、位置跳回，或只更新內容。
  3. **刪除卡片**
     - 刪除一張測試卡片。
     - 觀察下方卡片是否穩定移動到正常位置，有沒有額外閃動。
  4. **管理區位移**
     - 在上述操作期間，留意管理區、提示文字、卡片列表是否上下移動。
     - 不必量測像素，只判斷肉眼是否看到不正常跳動。
  5. **管理權及鎖定**
     - 進入管理。
     - 保存或刪除卡片。
     - 退出管理。
     - 切換日或旅程（必要時）。
     - 如果另一裝置持有編輯權，嘗試進入管理，確認阻擋提示及重新確認行為。
     - 觀察管理權是否突然失效、提示反覆出現、操作被錯誤阻擋或管理模式意外退出。
  6. **遠端更新**
     - 在隔離測試資料上，由另一裝置／帳號產生遠端更新。
     - 觀察目前畫面如何提示、是否跳動、是否影響管理或卡片位置。
  7. **測試後清理核對**
     - 確認測試卡片的新增／修改／刪除結果。
     - 刷新後確認資料沒有意外復現。
     - 確認 Pending 已同步或沒有未完成狀態。
     - 確認沒有影響其他非測試旅程。
  - 本輪以使用者肉眼觀察為準，不要求開啟 React 工具、Profiler 或辨識 DOM；若觀察到可重現異常，再討論是否需要進一步專業量測。
- **2026-11-24 使用者人工驗收回報（A 項 7 項）：** 使用者回報第 1–4 項通過、第 6–7 項通過；第 5 項部分通過。此結果依使用者實際雙端操作回報記錄，不將部分通過擴張為完整 PASS。
  1. **PASS｜新增卡片**：通過。
  2. **PASS｜保存既有卡片**：通過。
  3. **PASS｜刪除卡片**：通過。
  4. **PASS｜管理區位移**：通過。
  5. **PARTIAL PASS｜管理權及鎖定**：卡片管理編輯時 A/B 互鎖定通過；編輯旅程頁修改天數時鎖定通過。但編輯旅程頁修改出發日期及刪除旅程，均未被鎖定，屬未預期缺口。
     - **預期行為／已觀察契約**：B 進入管理後 A 顯示鎖定；B 再進入編輯旅程時，A 仍顯示鎖定並要求重新確認。此為預期 UI 行為；系統不主動推送解除鎖定，應等待使用者手動詢問鎖定狀態後，再執行相應權限確認。
     - **額外異常／待討論**：B 執行上述未受鎖定保護的出發日期修改或刪除旅程後，A 重新聚焦頁面，會執行同步並直接解除鎖定。需一併檢討 focus/reconciliation 同步是否能在未完成使用者手動確認時清除 A 的鎖定狀態。
     - **使用者核准後續修訂（2026-11-24；權威決策及結案見 ADR-001）**：同一 TRIP 的「管理卡片」與「編輯旅程」共用既有 Trip Lease，兩入口互斥；旅程基本資料提交前重驗 Lease；focus/reconciliation 只查詢 Lease、不主動解除提示；切換 TRIP 依 `trip_id` 隔離。刪除旅程仍位於編輯旅程入口並維持既有 `super_admin` 權限，不新增刪除專用 Lease／DB enforcement。其他功能同步行為不變。此範圍已完成程式實作、自動化驗證及使用者人工 UI 驗收，並於 2026-11-24 達成 ADR-001 新增範圍 Exit PASS；不得再列為待驗收，也不得沿用舊的「metadata 更新／刪除都需 DB Lease enforcement」建議。
  6. **PASS｜遠端更新**：通過。
  7. **PASS｜測試後清理核對**：通過。
- **原始人工驗收總結（歷史狀態）**：該輪首次回報時為 1–4、6–7 PASS；5 PARTIAL PASS。這是 2026-11-24 新增範圍修正前的初始結果，不再代表最終狀態；第 5 項已由後續核准修正、實作、自動化及使用者人工驗收完成，最終結案依 ADR-001 S4 紀錄為準。
- **後續決策（依 2026-11-24 後續結案紀錄更正）：** 第 5 項缺口已由使用者核准擴大 ADR-001 範圍處理；程式實作、自動化驗證及使用者人工 UI 驗收均已完成，新增範圍 Exit PASS。管理卡片／編輯旅程雙入口互斥、管理權及鎖定不再是 ADR-002 S1 待辦。跨 Auth server-side Lease 拒絕已有 ADR-001 SR-11 雙 Auth session／JWT 自動化 API／DB 契約測試覆蓋；不另列補測、不重開 ADR-001 Exit。
- **狀態更正：** 上述 2026-11-24 原始驗收 1–4、6–7 PASS／第 5 項 PARTIAL PASS 是新增範圍修正前的歷史結果。修正後第 5 項及 2026-11-24 核准新增範圍的人工驗收結果，以 ADR-001 S4「2026-11-24 新增範圍實作與人工驗收結案」為準：IMPLEMENTED／AUTOMATED PASS／MANUAL ACCEPTANCE PASS／EXIT PASS。

## 2026-11-24：編輯旅程入口沿用既有 Trip Lease 專項確認（已核准、實作完成、自動化通過）

**實作前唯讀證據：** 可重用 `itineraryCardEditLeaseService.ts` 的 Trip Lease、同 TRIP 隔離及 `ItineraryPage.tsx` 現有 focus／visibilitychange refresh，不需建立第二套鎖。當時 `App.tsx` 的 `openEditTrip`、`handleTripEditorSubmit` 尚未查詢同一 Trip Lease；`useTripWorkspace.updateTrip` 只有 `daysDataChanged` 時才 Claim `__trip__`，一般 Trip metadata 更新不受該 Lease 保護。`isTripMasterLocked` 來自 `useTripDataRevision` 的權限撤銷提示，並非管理卡片 Trip Lease 狀態，不能直接拿來當鎖定判斷。

**2026-11-24 使用者已核准的範圍（權威決策：ADR-001）：**
- 同一 TRIP 的「管理卡片」與「編輯旅程」共用既有 Trip Lease，兩入口互斥，不新增第二種鎖。
- 編輯旅程入口阻擋、已開啟視窗送出前 Lease guard、旅程基本資料更新納入同一 Lease 協調。
- focus／visibilitychange 只重新查詢指定 TRIP 的 Lease，不主動清除鎖提示；切換 TRIP 後依新 `trip_id` 查詢。
- 刪除旅程仍只從編輯旅程入口提供並維持既有 `super_admin` 權限；不增加刪除專用 Lease／DB enforcement。這項 Lease 是正常編輯操作協調，不是針對管理者刻意繞過的安全邊界。
- 其他功能的同步、revision、Realtime、CAS／版本及驗證流程不得變更。

**實作與驗證結果（2026-11-24；歷史自動化結果）：** 已完成 `App.tsx` 編輯入口 Claim／heartbeat／focus-only requery／submit revalidation／正常 close release，以及 `useTripWorkspace.updateTrip` metadata-only Lease 保護；擴增 `verify-adr001-s3-app-integration.mjs`。TypeScript app/node、ADR-001 integration、Cloud Save Service、Workspace Recovery、完整 `npm run build` 與 `git diff --check` 均 PASS。未修改 DB／migration，未操作正式資料。此段當時的 MANUAL ACCEPTANCE PENDING 已由同日稍後 ADR-001 S4 新增範圍驗收紀錄取代；最終狀態為 IMPLEMENTED／AUTOMATED PASS／MANUAL ACCEPTANCE PASS／EXIT PASS。
