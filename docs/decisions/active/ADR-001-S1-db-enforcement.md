# ADR-001-S1：DB Enforcement 與 Save RPC 基準

> **階段工作紀錄治理：** 本文件是 S1 持續執行與測試進度的唯一維護位置。每輪記錄執行範圍、環境、測試證據摘要、PASS／FAIL／BLOCKED、未完成項及下一步；長篇原始輸出與根因調查可連結文件 116，但不得把文件 116 當作本階段進度日誌。更新本文件後，同步更新 `docs/decisions/README.md` 的精簡狀態與下一步。

## 目前狀態摘要（2026-11-21；以下為最新判定）

- **S1 Exit：PASS（DB階段範圍）。** SR-01～SR-11的DB enforcement／Save RPC必要驗證已完成追溯核對，原始SR-12與SR-09／SR-01應用層Pending／Recovery責任歸S3，不阻塞S1 DB Exit。正式進入S2 Cloud Save接線。
- **本次新增 PASS：** Historical Trip `trip_editor` enforcement（真實 Local Auth API session；metadata UPDATE零筆、Save RPC拒絕、readback不變）；Cross-backend marker isolation限定 probe（獨立 backend PID；B直接 daysData UPDATE被Trigger拒絕；readback不變）。此 probe 不等同驗證合法 Save RPC跨backend完整流程。
- **Cleanup：** fixture已清理，readback基線 Auth users=4、Trips=3、versions=3、leases=0、markers=0、history=1。
- **Git／Schema：** 現行三筆 migration已存在於 develop／origin develop並已套用 local；本輪未新增migration。實際schema與現行migration核對一致。
- **限制：** local loopback only；未連正式Supabase、未部署、未修改程式、未commit／push。工作樹原有其他修改均保留。
- **下一步：** S1 DB Exit已達成；進入S2 Cloud Save接線，按S2階段文件核對Repository／Cloud service／daysData caller及唯一Save RPC路徑。

---


### 已定案：daysData 寫入隔離及獨立 CAS／Version

- **DB Trigger 精準 enforcement：** 由資料庫端以 `BEFORE UPDATE` enforcement（實際 trigger/function 實作細節待審查）判斷每日詳細行程資料 `daysData` 是否變更；只有變更 `daysData` 的寫入才驗證 Trip Edit Lock。驗證有效租約持有者、必要 client identity 與租約期限，無有效鎖／租約逾期拒絕該寫入。
- **範圍隔離：** `daysData` 未變更的其他 Trip 更新不得受每日詳細行程 Edit Lock 阻擋；不得採用鎖整筆 `trips` UPDATE 的方式，亦不得改動其他功能既有同步與驗證流程。
- **版本分離：** Edit Lock 決定編輯權；每日詳細行程專屬 CAS／Version 判斷 `daysData` 是否仍符合保存基準。其他 Trip 功能更新所改變的全列 `updated_at` 不得直接被當作每日詳細行程版本衝突。
- **已定案保存入口方向：** `daysData` 遠端保存收斂至專用 RPC；RPC 在單一原子交易中驗證 Trip-level Lease 與 itinerary version CAS，並僅更新 `daysData`（不回寫整筆舊 `content`），成功時原子推進專屬版本。此方向不授權程式實作。
- **已定案：受控寫入通道：** 專用 itinerary save RPC 為 `daysData` 的唯一合法寫入通道。資料庫 Trigger 必須拒絕所有未經此受控通道的 `daysData` 變更，包含舊直接 UPDATE 路徑；不得只依前端旗標或可偽造的 session 設定授權。受控標記／授權機制須以 PostgreSQL 權限模型實際驗證，確保 authenticated 使用者無法自行偽造；非 `daysData` 的 Trip 更新不受阻擋。
- **已定案：Lease 交易序列化：** Claim、Renew、Release 及 itinerary Save 均須遵循一致的 Lease row lock／交易序列化契約。Save 在交易內鎖定 Lease row，重新驗證 `auth.uid()`、client identity、租約期限及預期 itinerary version；只有全部成立才更新 `daysData` 並原子推進版本。競爭接管／續約／釋放不得使失效持有者保存成功。
- **已定案：Pending 版本遷移：** Pending Sync 保留現有三方合併引擎及本機資料保護，基準版本改用 itinerary version。Conflict State 使用專用版本。舊 timestamp baseline 不得直接轉換為新版本；Recovery 必須先取得可信任 Cloud `daysData` 及版本，保留 Pending snapshot，安全重建合併基準後才可同步。資料不足或無法安全重建時保留 Pending 並停止自動覆寫。
- **待驗實作安全條件：** 受控寫入標記、Trigger/RPC 權限及直接 UPDATE 封鎖機制，必須在資料庫整合測試中證明 authenticated 使用者無法繞過 CAS／Lease；未驗證前不得視為完成。以上決策不授權程式實作。

### 已記錄：技術實作解決方案及驗證前基準

以下為本 ADR 的技術解決方案基準。它們是已記錄的目標設計，不代表 PostgreSQL／Supabase 整合實測已完成；若實測結果要求改變，須提出 ADR 修訂，保留本次決策及變更理由。

#### 1. 唯一合法 daysData 保存通道

- 建立專用 itinerary Save RPC，作為每日詳細行程遠端保存唯一入口。前端、舊 REST／直接 UPDATE 路徑及其他 RPC 均不得自行寫入 daysData。
- Save RPC 在單一交易內完成 Lease 驗證、CAS、daysData 更新、itinerary version 推進及必要歷程觸發，任何步驟失敗均整筆 rollback。
- RPC 僅更新 daysData 對應資料，不回寫整份舊 content，以避免其他功能的資料被覆蓋。
- 直接更新 daysData 即使持有有效 Lease 仍拒絕；有效 Lease 本身不等於合法寫入通道，保存必須同時經 Save RPC。

#### 2. DB Trigger enforcement 與不可偽造的受控授權

- 在資料庫建立非 authenticated 使用者可直接存取的私有授權紀錄機制（private schema／table），其寫入權限僅授予受控 SECURITY DEFINER RPC／必要資料庫函式；authenticated 不得讀寫、插入、更新或刪除授權紀錄，也不得直接執行授權建立函式。
- Save RPC 在交易內完成 Lease 與 version 驗證後，建立與當前資料庫交易、backend/session、Trip、authenticated 使用者及保存操作相綁定的短生命週期授權紀錄；Trigger 僅接受完全匹配的授權紀錄。授權不可由前端傳入旗標、可自行設定的 GUC／session variable 或單純 client identity 推定。
- Trigger 使用資料庫端可驗證的交易識別與操作上下文確認授權紀錄，避免跨交易、其他連線、其他 Trip 或其他使用者重用。授權紀錄在交易內使用，交易結束後失效；必要清理採安全的資料庫清理機制，清理不得成為授權判定依據。
- BEFORE UPDATE enforcement 僅在實際 daysData 變更時執行。若 daysData 未變更，其他 Trip 欄位的更新不需取得每日詳細行程 Lease，也不得受此 enforcement 阻擋。
- 若資料庫實測證明上述交易綁定授權機制存在可繞過、無法可靠識別或權限缺陷，替代解決方案必須仍維持「authenticated 不可直接寫 daysData、只有唯一 Save RPC 可以合法寫入、其他功能不受阻擋」三項不變條件；不得退回可偽造 session flag 的做法。替代方案須提出實測證據與 ADR 修訂。

#### 3. Lease row locking 與交易序列化

- Claim、Renew、Release、Save 使用一致的 Lease row locking／交易序列化規則；所有操作採一致鎖定順序，以降低 deadlock 風險。
- Claim 在交易內鎖定／建立對應 Trip Lease row，原子判定有效持有者並決定取得或拒絕；不得以先查後寫代替。
- Renew 在鎖定 Lease row 後，重新確認 user、client identity 及 lease 狀態，才更新期限；失效租約不得直接復活。
- Release 在鎖定 Lease row 後，僅允許符合持有者身分的操作釋放，避免其他持有者清除有效租約。
- Save 在交易內鎖 Lease row，重新驗證 user、client identity、期限與 version。Lease row 的競爭操作依交易序列化結果判定，失效持有者不得保存成功。
- 固定交易鎖定順序與必要索引，並在兩個以上獨立 Auth context 的併發測試中驗證 claim／renew／release／save 競爭、過期、接管及 deadlock／rollback 行為。

#### 4. 獨立 itinerary version 與原子 CAS

- 建立以 trip_id 為鍵的專屬 itinerary version 資料，不再以整列 trips.updated_at 直接作為每日行程 CAS 基準。
- 新 Save RPC 以預期 itinerary version 做 compare-and-swap；成功更新 daysData 後同交易原子遞增版本。版本不一致即拒絕保存，且不修改資料、歷程或版本。
- 初始化舊旅程版本時，採 migration 為既有旅程建立可信 baseline；初始化及後續版本更新不得因其他功能的 Trip 更新而錯誤推進 itinerary version。
- Trip row、Lease row、version row 及授權紀錄的交易鎖定順序需明確固定，避免循環等待；併發測試驗證不同功能更新與 itinerary Save 的相互影響。

#### 5. 既有 Trigger／歷史旅程規則相容

- 保留 trips_touch_updated_at、trips_capture_itinerary_day_history、trips_guard_visibility_and_email_map、trips_reject_historical_trip_editor_update 及其既有契約；不得為新 Save RPC 任意停用或 bypass。
- Save RPC 的更新須正常經過既有 Trigger。歷史旅程編輯限制仍由既有權限契約及 DB enforcement 保護，不因持有 Edit Lock 或受控授權紀錄而豁免。
- 驗證 Save 成功時 history 正確產生、失敗時 daysData／version／history 原子 rollback、非 itinerary 欄位更新不錯誤觸發 itinerary history，並確認不重複記錄。
- 若既有 Trigger 的欄位判斷或歷程機制與專用 RPC 不相容，採最小相容修正並保留原功能；修改前須完成依賴盤點及驗證，不得直接移除既有 Trigger。

#### 6. RPC／Trigger 權限安全基準

- RPC 如使用 SECURITY DEFINER，須固定安全 search_path、採 schema-qualified 物件、避免動態 SQL 權限漏洞及未受控物件解析。
- 明確 REVOKE PUBLIC／不必要角色的 RPC、私有 table、授權建立函式及 Trigger helper 權限；只授予必要的 authenticated RPC EXECUTE。
- RPC 以 auth.uid() 及資料庫端可信資料驗證使用者；不得將前端傳入的 user、owner、client identity 或 lease 狀態當成權威。
- Lease、version、授權紀錄及 enforcement 相關私有物件不可由 authenticated 直接寫入。
- 測試直接 REST／SQL 等所有可用寫入入口、舊 RPC、偽造旗標、權限不足、跨 user／Trip／transaction 重用及正常 Save，確認無繞過路徑。

#### 7. Pending Sync 與舊基準安全遷移

- 保留既有 Pending snapshot、三方 merge engine 與本機資料保護；新基準改用 itinerary version。
- 舊 baseCloudUpdatedAt 不可直接映射成新 version。Recovery 先取得可信 Cloud daysData 與 version，保存 Pending snapshot，再重建可驗證基準並進行 merge。
- 若 Cloud snapshot/version 不可信、取得失敗或無法安全重建，保留 Pending、停止自動覆寫並提供可恢復狀態；不得以空資料、舊 timestamp 或未驗證版本強行同步。
- 測試正常 Recovery、版本衝突、Lease 失效、離線、事件遺失、重新取得 Lease、merge failure 及重試，確認 Pending 不遺失且舊 holder 不可上傳。

#### 8. 必須完成的最小資料庫驗證矩陣

| 驗證案例 | 預期結果 |
|---|---|
| 無 Lease direct daysData UPDATE | 拒絕 |
| 有 Lease direct daysData UPDATE | 仍拒絕（非 Save RPC） |
| authenticated 偽造授權紀錄／旗標 | 拒絕 |
| 其他連線／交易重用授權 | 拒絕 |
| 非 holder Save RPC | 拒絕 |
| client identity 不符 | 拒絕 |
| Lease expired Save | 拒絕 |
| expected version 不符 | 拒絕且不變更資料／history／version |
| 合法 holder + RPC + 正確 version | 成功 |
| Save 成功 | daysData／version／history 同交易一致 |
| Save 交易失敗 | daysData／version／history rollback |
| 非 daysData Trip update | 正常成功且不受 Edit Lock 阻擋 |
| 非 itinerary update 與 Save 競爭 | 兩者依各自契約正常完成，不產生錯誤 itinerary conflict |
| Claim／Renew／Release／Save 競爭 | 依 Lease 交易契約序列化，不允許失效 holder 保存 |
| 歷史 Trip 編輯限制 | 既有限制仍有效 |

上述驗證須使用至少兩個獨立 Auth context，並涵蓋資料庫直接操作及應用程式實際入口。所有測試結果、SQL／測試案例、權限設定及失敗證據均須記錄；未 PASS 的項目不得宣稱完成。

#### 9. 審查／實作關卡

1. ADR 記錄上述解決方案，並以此作為後續技術驗證基準。
2. 先驗證 PostgreSQL 授權紀錄與 Trigger enforcement 的不可偽造、交易綁定及精準範圍。
3. 若第一關 PASS，才進入 Lease row locking／併發序列化驗證。
4. 再驗證獨立 itinerary version、CAS、Trigger/history 相容性與 RPC security。
5. 完成 DB acceptance matrix 後，才進入前端保存入口整合、Pending migration／Recovery 及整合後全面驗收。
6. 任一關發現問題時，必須直接提出具體替代解決方案、影響、驗證方法與必要 ADR 修訂；不得將問題留作未解疑問後跳至下一關。
7. 本 ADR 不授權程式或資料庫實作；實作仍須由使用者明確授權。

### 技術驗證進度（2026-11-20，本地隔離原型）

**第一關：受控授權紀錄與 Trigger enforcement 原型 — PASS（限定原型範圍）**

在本地 PostgreSQL 17.6、transaction rollback 隔離測試中，建立臨時 schema/table/trigger/helper/RPC，確認：

- 未受控直接修改 daysData 被 Trigger 拒絕。
- 非 daysData 欄位修改正常通過。
- 受控 SECURITY DEFINER RPC 在同交易內建立 txid 綁定授權並完成 daysData 更新。
- authenticated role 無法直接 INSERT 私有授權紀錄或執行授權 helper。
- 測試以 rollback 結束，未保留測試 schema／資料。

限制：此結果證明 prototype pattern 可行，不是正式 trips table、既有 auth claims、RLS、history trigger 或完整 RPC 整合驗收。正式方案仍須驗證交易識別在 Supabase 真實 role／auth context 下的可靠性，並確保 helper 只可由唯一 Save RPC 的交易內路徑呼叫；不得把這個原型直接部署。

**第二關：Lease row locking 原子競爭 — PASS（最小 SQL 原型）**

使用兩個並行 PostgreSQL session，對同一 expired lease row 執行相同的原子 UPSERT claim：

- Session A 成功回傳 holder A。
- Session B 在競爭後回傳 0 rows。
- 最終 row 僅由 A 持有，未發生雙重 claim。

這支持採用 Lease row locking／原子 UPSERT 作為 Claim 基礎。正式 Claim／Renew／Release／Save 仍須統一交易鎖順序並整合實測；此原型未驗證正式 RPC 權限及完整 Lease 競爭序列。

**第三關：獨立 version CAS 原子競爭 — PASS（最小 SQL 原型）**

兩個並行 session 同時執行 conditional version UPDATE：

- 其中一個 session 成功推進 version 至 1。
- 另一個 session 回傳 0 rows。
- 最終 version 只推進一次。

此結果支持使用 row-locked conditional UPDATE 作為 CAS；正式保存需將 Lease、version、daysData、history 合併在同交易，且失敗 rollback。

以上均為本地隔離原型，不涉及正式資料，未建立 repository migration，且測試物件已清除。下一審查關卡為既有 trips Trigger／歷史限制／history capture 與新 Save RPC 更新方式的相容性分析及最小可驗證原型，接續前不得進行前端整合。

**第四關：既有 Trip Trigger／history 相容性 — PASS（本地既有 Trigger 原型）**

在本地 Supabase DB 的 transaction rollback 測試中使用臨時 Trip，實際經過現有 Trips Trigger：

- 非 daysData content 更新未產生 itinerary history。
- daysData 更新成功捕捉修改前 snapshot，previous_items 正確。
- 使用 savepoint rollback 模擬失敗回復，daysData 與 history 一致回復。
- 測試交易 rollback，臨時 Trip 未保留。

Trigger 相容性結論及解決方案：Save RPC 必須以資料庫當下 content 為基礎，採 JSON 精準替換 daysData（例如 jsonb_set），不可用前端舊 content 整列覆蓋。既有 history、visibility/email map、歷史 Trip trigger 不移除、不 bypass。這項原型尚未整合受控授權 Trigger、實際 Save RPC、完整歷史旅程身份及 RLS/Auth context；後續仍需整合驗收。

**第五關：授權紀錄精準交易／backend binding 原型 — PASS（限定原型）**

進一步以本地隔離原型驗證授權紀錄包含 transaction id、backend pid、Trip target、user、operation：

- 受控 RPC 在 Trigger 驗證後即清除授權紀錄，清除與更新在同交易完成。
- RPC 後同一交易再次直接修改 daysData，因授權紀錄已清除而拒絕。
- 授權紀錄不可由 authenticated role直接存取，helper EXECUTE 也未授予 authenticated。
- rollback 結束，未留下原型物件。

**技術解決方案補強：** 授權紀錄需包含 transaction id、backend pid、Trip、user、operation，並由唯一 Save RPC 在更新後於同交易刪除授權紀錄；Trigger只在更新當下核對紀錄。這可降低同交易內授權重用及已提交授權紀錄累積風險。正式設計仍須整合實際 auth.uid()、Lease、CAS，且對 authenticated 的授權/helper/table權限需逐項驗證。

詳見文件 116 的 Save RPC 根因／整合架構調查證據；此處保留 DB 基礎契約及原型驗證證據。後續實作與驗證進度、測試結果、阻塞及下一步均在本 S1 階段文件持續更新，不以文件 116 代替。

以下均為本次 S1 階段的持續執行紀錄。測試狀態只反映所列本機隔離環境與具體案例；未完成項不得由局部 PASS 推定通過。

## 2026-11-20 階段執行與驗證進度

### 執行範圍與環境

- 專案：Travel-Companion，分支 `develop`。
- 主機：公司端 `TPEPC-TM7503-01 / NICE-GREEN`；專案 Node.js `22.23.2`、npm `10.9.8`。
- 驗證環境：本機 loopback Supabase（`http://127.0.0.1:54321`），不連線正式 Supabase，不部署。
- 本輪僅整理與更新文件責任及 S1 工作紀錄；未修改程式、migration 或測試資料庫，未 commit／push。
- 工作樹在本輪開始前已有其他修改及 untracked migrations／scripts；本次保留，不覆寫、不清除。

### 本輪已確認的測試證據

- **SR-11：PASS。** 使用既有 `scripts/test-adr001-dual-auth-session-local.mjs` 重新執行雙 Auth Session 隔離測試。兩個獨立使用者／JWT context 可驗證各自身份；B 在 A 持有 Lease 時，Claim／Save／Renew／Release 受拒絕。清理後 Auth users、Trips、Lease 數量回到基線。Durable Job：`job-1795166256389-y77ep3`，狀態 completed，exit code 0。
- **SR-04 及其他既有 runner 案例：** 既有雙 Auth runner 涵蓋 Save CAS、stale CAS、直接 daysData 寫入拒絕、private authz marker 權限拒絕、偽造 Lease 拒絕、private version 讀取、metadata-only update、save history before-state、強制 Trigger rollback／cleanup、expired Lease Claim 競爭。這些是本機整合 runner 所覆蓋的具體案例，不代表整個 S1 exit criteria 已全部完成。
- **SR-05：PASS（現行 RPC interleaving，local）。** `docs/test-results/adr001-stage1-sr05-rpc-latest.json` 證明 A Save與B Claim真正交錯，Save成功、B claim被拒、Lease owner/client及daysData/version維持一致、無deadlock並完成清理。
- **SR-09：DB unknown-outcome simulation PASS（尚非應用層 recovery PASS）。** 以單次 Save RPC fault-injection，在 backend response已收到後模擬客戶端 response loss；client收到錯誤，未重送，獨立 readback確認daysData已commit且version僅推進一次（1→2）。fixture cleanup PASS。結果：`docs/test-results/adr001-stage1-sr09-unknown-outcome-latest.json`；runner：`scripts/test-adr001-sr09-unknown-outcome-local.mjs`。S3 Pending/reconcile端到端仍未驗證。
- **SR-10：PASS（限目前已驗證契約）。** 既有 omitted `p_days_data`、SQL NULL、array/string/number/boolean rejection及空 object／正常 object測試；另以 PostgreSQL DO probe將 JSONB literal `null`送入 Save RPC，於 isolated request.jwt.claim context下捕捉 `ADR001_INVALID_SAVE_INPUT`（probe未切換 DB role至 authenticated；拒絕發生於輸入 guard）。新增隔離 Trip Save整合測試：daysData由 2 day keys grow至3 keys，version 1→2、獨立 readback精確一致；再 shrink至1 key，version 2→3、readback一致，history共3筆。`createDays(dayCount)`、`createEmptyDaysData(days)`、`createTripRecord` caller contract仍為靜態核對，未實測 content.days本身的天數變動。Runner／證據：`scripts/test-adr001-sr10-local.mjs`、`docs/test-results/adr001-stage1-sr10-latest.json`。Fixture cleanup後 trips／leases／versions／history／Auth users／admin_users均回零。
- **SR-12：BLOCKED（屬後續 S3 整合責任）。** 目前 `ItinerarySyncState` 僅有 `baseCloudUpdatedAt`，尚無 `baseCloudVersion`；`reconcilePendingItinerarySyncState` 仍以 `cloudUpdatedAt`／timestamp 作基準。不得為了讓 S1 顯示 PASS 而提前修改 S3 client／Pending 程式；S1 記錄介面缺口與明確交接即可。

### 尚未完成及下一步

1. **SR-05：已 PASS。** 現行 RPC Save／Claim交錯測試已完成並記錄；不需重跑。
2. **SR-09：DB層模擬已 PASS。** 後端commit後response loss及獨立readback已完成；下一步僅為S3應用層Pending/reconcile整合驗收，S1不提前修改 client/Pending程式。
3. **SR-10：已 PASS（限定已驗證契約）。** JSONB literal null拒絕、day-keyed daysData grow/shrink Save、version與history一致性及cleanup已記錄；未實測 content.days本身天數更新，見 `docs/test-results/adr001-stage1-sr10-latest.json`。
4. **SR-12：** 保留為 S3 前置整合／驗收項目：加入 version baseline，舊 timestamp 不得推定為 itinerary version；驗證已同步、可單向 merge、衝突保留 Pending、舊紀錄缺 snapshot、Lease 遺失／離線／事件遺失／CAS loser 等 recovery 情境。
5. S1 只有在本階段退出條件與所有必要資料庫整合測試完成後才能標示 Stage exit PASS；原型 PASS、單項 runner PASS、migration 存在或已套用均不能替代階段驗收。

### 安全與範圍界線

- 不接觸正式 Supabase、正式使用者資料、正式部署或 Secrets。
- 不因本輪文件治理修正改動 migration、程式、S2／S3／S4 範圍。
- 不執行 commit／push；保留原有工作樹內容。

## 執行修復紀錄（2026-11-20）

目前實作基準為 `develop` 已存在的三筆 migrations，不採用 backup branch 的 16:00 prototype migration：
- `20261120120000_adr001_stage1_trip_itinerary_edit_enforcement.sql`
- `20261120130000_adr001_initialize_itinerary_version_on_trip_insert.sql`
- `20261120140000_adr001_trip_lease_list_rpc_volatility.sql`

backup branch 的 `20261120160000_adr001_stage1_trip_itinerary_edit_enforcement.sql` 使用不同 schema／命名與授權標記設計（例如 `itinerary_trip_edit_leases`、`itinerary_trip_versions`），與現行 migrations 不一致。其 prototype smoke／rollback／SR-05 結果不能視為現行 migrations 的驗證證據，也不得將 16:00 migration 合併至 develop。

相關 runner／SQL／JSON results 保留於 Git backup ref `backup/adr001-stage1-local-commit` 供追溯，但目前不移植成現行 Stage 1 PASS evidence。現行版本的驗證須重新對照實際 migration schema、RPC、trigger、baseline 與權限。

**後續：** 現行 local DB 的 smoke／rollback／SR-05 已重跑並持久化。接續補完整 SR-01～SR-12、真實雙 Auth API session、SR-09 unknown outcome recovery及SR-12 Pending recovery；Stage 1 Exit 維持 BLOCKED，未完成前不推進 Stage 2。不得連線／寫入正式DB或部署。


## 本次修正後重新驗證（2026-11-20）

- `supabase migration list --local` 確認 local 已登記現行 12:00／13:00／14:00 三筆 migrations；`supabase status` 確認只使用 loopback local Supabase。
- Local schema inspection 確認 `trip_itinerary_edit_leases`、`trip_itinerary_versions`、current RPC/trigger存在；baseline version min/max=0；test lease清理基準=0。
- Smoke test：PASS，使用本地 DB，交易 rollback。Claim、Save RPC、version 0→1、Read version、拒絕另一 context claim/renew/release/save、direct daysData update denial、stale version denial、metadata update allowed、history capture、authorization marker清理均確認。
- 強制 AFTER-trigger rollback：PASS；version=0、daysData未變、history=0、authorization marker=0，fixture rollback。
- SR-05 current RPC interleaving：PASS；A Save成功／version=1，B於延遲期間Claim被拒，最終資料及Lease owner/client仍為A，無deadlock，fixture cleanup成功。
- 測試結果 JSON 與 SQL／runner 已持久化至 `docs/test-results/`、`scripts/`。上述測試僅限 local DB；Smoke 使用單一 session sequential JWT contexts，不等同真正雙 Auth API驗證。
- Cleanup baseline：trips=3、versions=3、Lease rows=0、authorization markers=0；history rows=1為原有 Trip `trip-91f222b6-64ef-489a-9367-ce2606840080`，非本次fixture。

**限制：** 本輪重新驗證現行三筆 migration下的 DB smoke／rollback／SR-05。S1 Exit維持 BLOCKED。

### SR-09 unknown-outcome追加驗證（2026-11-20）

- local loopback Supabase，建立唯一臨時 Trip/Auth fixture及有效 Lease。
- Save RPC只送出一次；fault-injection fetch在backend response已返回後模擬response loss，client收到錯誤，不重送。
- 透過獨立 readback確認 daysData payload已寫入，itinerary version由1推進至2，結果判定為已commit，不重複Save。
- fixture及Auth user cleanup：PASS。
- Runner：`scripts/test-adr001-sr09-unknown-outcome-local.mjs`；結果：`docs/test-results/adr001-stage1-sr09-unknown-outcome-latest.json`。
- **狀態：** DB unknown-outcome simulation PASS；S3應用層 Pending/reconcile處理未驗證，不納入此PASS。
- SR-10與其餘S1矩陣仍待完成，S1 Exit維持 BLOCKED。

### 本輪續測（2026-11-20）

- **SR-10：PASS（限定已驗證契約）。** omitted RPC parameter、SQL NULL及 JSONB literal null拒絕；day-keyed daysData grow/shrink Save後version 1→2→3、readback及history驗證PASS。詳細結果見 `docs/test-results/adr001-stage1-sr10-latest.json`。
- **SR-11：PASS（重驗）。** `scripts/test-adr001-dual-auth-session-local.mjs` 再次執行成功：兩個獨立Auth users／JWT sessions，B的Claim／Save／Renew／Release均受拒，A保存成功；cleanup回到基線。runner exit code 0。
- 雙 Auth runner的SR-10既有案例涵蓋SQL NULL／非object拒絕、empty object接受與版本推進；SR-10專用 runner另驗JSONB literal null與grow/shrink整合。content.days天數更新本身仍僅有caller靜態核對。
- 本輪未連正式Supabase、未部署、未commit／push。

### 文件整理及續測（2026-11-20，接續）

- **SR-11：再次 PASS。** 透過真實 loopback Supabase Auth API 的雙獨立使用者 runner 驗證；兩個身份及 Token 獨立，B 對 A Lease 的 Claim／Save／Renew／Release 均拒絕，A 正常保存。runner exit code 0，finally cleanup 完成。
- Cleanup/readback：Auth users=4、Trips=3、versions=3（回到測試前 baseline）；Lease=0、authorization marker=0。History=1 為 baseline，未新增測試殘留。
- **先前探針狀態（已被2026-11-21實測取代）：** rollback probe無法提供有效驗收證據，當時暫列未PASS；最新結果見下方2026-11-21續測。
- **先前歷史Trip探針（已被2026-11-21實測取代）：** 早期transaction／role claims probe證據不足；最新真實Auth API測試結果見下方續測。
- 本輪確認 local baseline：Trips=3、itinerary versions=3、Lease rows=0、authorization markers=0、history=1。此 readback僅確認數量，未證明 historical trip enforcement。
- S1 Exit 維持 **BLOCKED**；不推進 S2/S3，不修改 migration／程式，不連正式 Supabase、不部署、不 commit／push。
- **2026-11-21 續測結果：兩項剩餘驗證均 PASS（local loopback）。**

- **Historical Trip `trip_editor` enforcement：PASS。** 透過 Supabase Local Auth API建立隔離使用者、實際 sign-in／`auth.getUser()`確認 JWT身份，對 2026-11-01 的歷史 Trip fixture 嘗試 metadata UPDATE及 `tc_save_itinerary_days`。metadata UPDATE回傳零筆更新（RLS拒絕，無 error），Save RPC回傳 `ADR001_TRIP_WRITE_WINDOW_CLOSED`。獨立 readback確認 title及daysData未變。
- **Cross-backend authorization marker isolation：PASS（backend／transaction binding probe）。** 兩個獨立 PostgreSQL backend PID（41048、41069）不同。A backend marker（txid、pid、Trip、user、operation）建立後，B backend在同一 user context嘗試直接 daysData UPDATE，Trigger拒絕 `ADR001_DAYS_DATA_SAVE_RPC_REQUIRED`；readback確認daysData未變。此probe證明跨backend不能重用A marker；未模擬合法Save RPC跨backend，因該marker設計應只由RPC同交易產生。
- 初次 historical metadata probe看到無error且零rows；調整驗收判定為「error或零rows」，重測成功，未將無error的RLS拒絕誤判為失敗。
- Cleanup readback：Auth users=4、Trips=3、versions=3、leases=0、markers=0、history=1，回到baseline；臨時測試腳本已刪除。
- 測試使用local loopback，未連正式Supabase、未部署、未新增migration、未修改程式、未commit／push。

**S1 DB Exit：PASS（2026-11-21）。** 本階段目標是資料庫 enforcement／Lease／version／Save RPC DB契約驗證；SR-01～SR-11的DB slice已完成核對。SR-12及SR-09／SR-01應用層Pending／Recovery為S3責任，不再阻塞S1 DB Exit。

## 2026-11-21 S1 exit matrix 證據追溯核對

以文件 116 的 SR-01～SR-12 原始定義及既有 runner／結果檔核對；不為補獨立 JSON 樣板而重跑已具證據案例。

| 原始 SR | S1 DB 範圍判定 | 現有證據／來源 | 限制 |
|---|---|---|---|
| SR-01 | PASS（DB Save slice） | dual-auth runner：A Claim及有效Save，version推進、history capture；另SR-10 grow/shrink Save readback | Pending清理是應用層；不以此DB證據宣稱App確認／清理已驗 |
| SR-02 | PASS（DB拒絕 slice） | runner：B Save拒絕、Lease owner/data/version不變；expired舊holder Save拒絕 | pending保留屬S3，不在此驗 |
| SR-03 | PASS | runner：stale expected-version CAS拒絕，readback勝方資料不變 | App merge／Pending保留未驗 |
| SR-04 | PASS | runner：兩個獨立worker、同client／expected version併發Save，恰一成功、一CAS loser，version只+1 | runner屬真實多程序但同Auth token；不同Auth身份併發由其他案例分別驗 |
| SR-05 | PASS | `docs/test-results/adr001-stage1-sr05-rpc-latest.json`：Save／Claim interleaving，無deadlock，結果及Lease一致 | 限該交錯案例，非所有Claim/Renew/Release排列 |
| SR-06 | PASS（已測DB範圍） | dual-auth runner：history前snapshot及強制Trigger rollback，daysData/version/history/Lease回復；歷史Trip限制另測 | visibility/email-map完整所有情境未獨立覆蓋 |
| SR-07 | PASS（已測DB範圍） | runner：direct daysData write、marker寫入、偽造Lease、private version read拒絕；跨backend marker isolation另有probe | 不宣稱所有私有helper／所有入口皆已窮盡測試 |
| SR-08 | PASS | runner：無Lease metadata-only update成功，history/version不變 | 代表該metadata案例及既有trigger範圍 |
| SR-09 | PASS（DB unknown outcome及transaction rollback slice） | rollback runner案例；`docs/test-results/adr001-stage1-sr09-unknown-outcome-latest.json`：單次Save、模擬response loss、readback已commit、未重送、cleanup | App Pending/reconcile及成功回覆前Pending清理條件仍未驗，屬S3 |
| SR-10 | PASS（已測輸入契約） | dual-auth runner omitted/SQL NULL/非object拒絕與empty object；專用runner驗JSONB literal null及day-keyed grow/shrink，version/history/readback/cleanup | literal-null probe未切authenticated DB role；`content.days` caller天數欄位本身變動仍為靜態核對 |
| SR-11 | PASS | 真實Local Auth API雙Session runner；B對A Lease的Claim/Save/Renew/Release拒絕，A Save有效，cleanup基線 | 符合所列獨立Session案例，非所有跨user／所有操作排列 |
| SR-12 | BLOCKED／S3 | 文件116原始定義：真實Pending state、baseline/local/cloud merge、CAS保存及清理；snapshot/baseline不可重建時保留Pending | 明確不屬S1 DB exit測試，須於S3驗收 |

**階段界線：** S1 DB Exit不等於ADR-001整體Stage 1／S4驗收完成。SR-09未知結果的DB單次提交/readback證據已PASS；客戶端Pending／reconcile及SR-12的三方merge、Recovery、保留Pending等屬S3。這些跨層項目不應被反向列為S1 DB Exit阻塞。S1已解除，下一階段為S2 Cloud Save接線。
