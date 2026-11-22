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
- 卡片列表已使用 `event.id` 作 sortable identity；缺少 ID 時採 `legacy-${activeDay}-${originalIndex}` fallback。需驗證 ID 是否在保存／reconciliation 中穩定，以及 fallback 是否可能造成 identity 變動。
- 約 2.2 秒的保存觀察窗（隔離合成旅程）曾記錄：`tc_save_itinerary_days` 1 次、`tc_release_itinerary_trip_edit_lease` 1 次、`tc_list_itinerary_trip_edit_leases` 4 次、`/rest/v1/trips` 14 次、`other_info_items` 20 次、`tc_read_trip_participant_email_map` 98 次。此為近似觀察窗的請求計數，不完全隔離，不能直接證明每筆請求由卡片保存引起或造成閃動。
- MutationObserver 累計 254 次 mutation，包含 DOM／屬性變化，並非純視覺閃動次數，不能作為閃動量化指標。
- `tc_read_trip_participant_email_map` 的大量呼叫與 `getCloudTripRecordsStrict()` 的逐 Trip hydration N+1 模式相符；此效率問題尚未證明與本案閃動有直接因果。
- 已曾執行 ADR-001相關 regression（`test:adr001-cloud-save-service`、`verify:adr001-s3-app-integration`）、build及 `git diff --check` 並有PASS紀錄；這些結果並不驗證閃動根因或本案改善。
- 合成卡片／旅程清理曾因瀏覽器 session timeout 受阻；不得把清理宣稱完成，亦不列為本案根因驗證停止條件。

## 階段導航
- [ADR-002-S1 根因定位與歷史比較](ADR-002-S1-root-cause-investigation.md)：唯一持續追查工作日誌。

## 本案完成條件
1. 以可重現且可觀察的證據確認或排除主要候選根因：state 更新序列、卡片 identity/key、remount、列表／資料替換、loading／conditional rendering。
2. 比較目前實際機制與歷史版本，確認「以前沒有閃動」的差異有 Git／程式證據支援，不以記憶或假設代替。
3. 明確分離已確認因果、推論及仍未驗證項目。
4. 提出範圍最小的修改方案及驗證方法；方案仍需使用者核准後才可實作。
5. 若核准並實作，完成相應 regression／實際隔離測試並記錄證據。ADR-002 在核准方案／實作之前維持 Proposed。

