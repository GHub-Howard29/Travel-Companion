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
1. 追查 `ItineraryPage.tsx` 卡片列表、SortableCard、父層及 loading／conditional rendering 的 identity與生命週期。
2. 追查 `ensureItineraryDaysDataIds`、保存／reconciliation對 card ID的處理，建立保存前後 identity evidence。
3. 以 Git history／差異核對相關保存流程與列表 render機制變更，定位歷史上沒有閃動的可證實差異。
4. 如有必要，在安全隔離環境建立可重現、精確的 remount／render／visual observation測試；不得把 mutation總數當閃動量。
5. 彙整根因及最小方案供核准。未核准前不修改程式。

### 狀態
- **PASS**：已識別需優先追查的保存 state更新序列與卡片 identity。
- **PENDING**：根因證明、歷史差異比較、可重現證據、改善方案審查。
- **禁止**：自行修改程式、commit/push/deploy、使用 TEST-1／正式 DB測試。

