# ADR-001：每日詳細行程功能編輯鎖範圍

- **ID：** ADR-001
- **狀態：** Accepted
- **核准日期：** 2026-11-19
- **修訂日期：** 2026-11-20
- **標題：** 每日詳細行程統一編輯權、保存協調與更新提示簡化

## 決策內容

本決策整合並取代先前將卡片保存修正（P0）與旅程級編輯權（P1）分開規劃的架構方向。每日詳細行程的編輯權、保存協調及其提示簡化，應依同一目標架構設計與實作，避免先建立一套日後必須重構的卡片級獨立驗證流程。

編輯鎖的適用範圍唯一且固定為「每日詳細行程」功能。鎖定單位為整趟 Trip：同一趟旅程在此功能中同一時間只允許一個有效持有者編輯。鎖定僅保護每日詳細行程內的卡片新增、修改、刪除及其必要資料操作，不得延伸至旅程中的其他功能。

### 統一責任分工

- **Trip Edit Lock：** 唯一編輯權協調機制，決定哪個使用者／裝置可以編輯該 Trip 的每日詳細行程。進入該功能的編輯／管理意圖時，必須由伺服器以原子操作取得鎖；不得用「先讀取鎖狀態、再取得鎖」代替原子 claim。編輯期間只保留維持有效租約所需的續期；正常離開時釋放，非正常中斷由租約到期回收。
- **Realtime：** 作為鎖定狀態及資料更新事件的通知通道，不是編輯權授權來源，也不應因收到每個事件就自動讀取整份 Trip、產生變更摘要或統計筆數。
- **Revision：** 保留必要的資料更新／異常訊號及事件遺失後的操作時補查；全域 revision 通知本身不得作為每日詳細行程合法保存的拒絕條件，也不得取代鎖權限驗證。
- **CAS／Version：** 保留作為最後一道資料一致性保護，防止舊版本覆蓋新版本；不取代 Trip Edit Lock，鎖也不取代 CAS／Version。
- **Local Pending Sync：** 保留本機持久化、離線資料保護與同步／恢復能力。租約失效或離線期間不得以過期編輯權直接上傳；Pending 必須保留，重新連線後先重新取得有效編輯權，再依版本保護恢復同步。不得因鎖失效丟棄本機資料。
- **保存協調入口：** 每日詳細行程新增、修改、刪除及自動／恢復同步，應收斂至一致的鎖有效性、版本保護與 Pending 協調流程，不建立與 Trip Edit Lock 平行、彼此獨立的卡片遠端驗證流程。

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

### Pending Sync／version migration 審查（方案已記錄，尚待實作驗證）

既有 Pending state 同時保存 `baseDaysData`、`pendingDaysData` 及 `baseCloudUpdatedAt`。遷移至 itinerary version 時，timestamp 不可直接轉換成 version，但 `baseDaysData` 可作三方 merge 的資料基準；版本基準與資料 merge 基準應分離。

解決方案：

1. 保留舊 Pending 的 baseDaysData／pendingDaysData／conflict snapshot／resolution choices；將 baseCloudUpdatedAt 標示為 legacy metadata，不映射成 itinerary version。
2. Recovery 取得最新可信 Cloud daysData 與 itinerary version，使用原 baseDaysData、Pending daysData、最新 Cloud daysData 執行既有三方 merge engine。
3. 無衝突且 merge 結果需要保存時，建立新的 pending snapshot，以 Cloud version 作 CAS expected version；Save RPC 成功後更新 baseline/version。
4. CAS 失敗代表 Cloud 已再變動，重新 fetch version／daysData並再次 reconciliation；不可直接重送原 snapshot。
5. 有衝突時保留完整 Pending、最新 Cloud snapshot及 conflict／resolution state，等待使用者處理；無法安全 merge 時不得自動覆寫。
6. 舊 timestamp 不可信或缺失不影響三方資料比較；但若 baseDaysData、pendingDaysData 等必要 snapshot 不完整、格式損壞或 local storage state 無法辨識，需將 raw Pending record 保留／隔離並顯示 recovery error，不可因讀取函式回傳 null 就當作沒有 Pending 或清除資料。
7. migration／Recovery 必須能區分「不存在的 Pending」與「存在但無法解析／損壞的 Pending」；在安全修復或人工處理前，不得讓新保存覆蓋原始 recovery data。

此方案保留既有 merge engine與 local protection，version只負責 Cloud CAS；不將 timestamp baseline硬轉 version，也不要求重寫三方 merge。此項目前為架構審查／解決方案記錄，仍須在後續 Recovery integration test驗證。

### P3 更新提示簡化決策

- 每日詳細行程的提示只保留兩類：**編輯鎖提示**（取得失敗、持有者資訊、續期／失效狀態）及**資料更新提示**（有其他資料更新，需要時主動取得最新資料）。
- 取消每日詳細行程「預覽變更」使用者流程、變更分類／統計計數及其專用呈現；不得為保留不存在的預覽畫面而繼續維護專用 preview baseline、journal 摘要計算或確認流程。相關程式、資料契約及 migration 是否可刪除，須在實作審查中確認依賴及其他功能用途後才能決定；本決策不直接授權刪除共用資料表或其他功能依賴。
- 正常瀏覽期間不持續輪詢編輯鎖或完整 Trip 更新資料。Realtime 可保留輕量狀態通知；收到更新事件時只提示，不自動執行完整 Trip／Journal 讀取或預覽計算。
- 使用者進入每日詳細行程管理／編輯時，主動原子取得 Trip Edit Lock，並在允許編輯前取得必要的最新資料／版本狀態；使用者主動要求更新時才重新讀取最新資料。
- 編輯／保存期間仍必須在伺服器端驗證鎖所有權及版本。Realtime 事件可能因斷線、休眠或事件遺失而漏失，因此「未收到通知」不得視為「資料未更新」；操作時補查及伺服器端 CAS 是必要保護。
- 以上 P3 簡化只適用每日詳細行程；其他功能的 revision、Realtime、同步、提示及驗證行為不隨之更動。

## 適用範圍

- 「每日詳細行程」功能內的每日行程卡片新增、修改、刪除，以及該功能既有操作所涉及的卡片資料，均納入編輯鎖保護。
- 每日詳細行程卡片本身呈現或操作所使用的天氣資訊、路線／交通資訊、圖片／縮圖等內容，仍屬此功能範圍；不得僅因其由其他技術服務或模組提供，就將其拆出本功能邊界。
- 是否納入編輯鎖，只依功能歸屬判定：只有明確屬於「每日詳細行程」功能的操作與資料才納入，不以資料同屬一趟旅程、共用資料表、服務或模組作為納入理由。

## 限制與不可做事項

- **除「每日詳細行程」以外，所有功能一律不得納入本編輯鎖。**不以本 ADR 是否逐項列出功能名稱為限，也不得透過「附屬功能」、「相關資料」或技術依賴等解釋擴張範圍。
- 清單、帳本、旅程基本資料、旅程設定及其他非「每日詳細行程」功能，均不受本編輯鎖控制。
- 不得因本編輯鎖而改動任何其他功能既有的同步比對、revision、Realtime、雲端比對、CAS／版本控制或同步驗證流程。
- 其他功能維持原有操作與同步行為；本 ADR 不授權重構、替換、略過或調整其既有機制。


## 依據與理由

使用者於 2026-11-19 定案：P0 卡片保存修正與 P1 旅程級單一編輯權必須以同一目標架構整合，避免新增獨立、未來會重複的卡片外部驗證流程；並同時簡化每日詳細行程的提示，只保留必要編輯鎖提示與資料更新提示，取消預覽及變更統計。編輯鎖仍僅適用「每日詳細行程」，以固定功能邊界避免影響其他功能。

## 驗收／解除條件

- Trip Edit Lock 的 claim／renew／release／衝突處理均以 trip_id 為鎖定單位，並有伺服器端原子取得與每個每日詳細行程寫入路徑的所有權驗證。
- 有效鎖持有者可完成每日卡片新增、修改、刪除；第二持有者無法取得鎖；鎖過期／失效後不能繼續上傳。
- 保存同時保留 CAS／Version；真正版本衝突不得靜默覆寫。
- 離線／鎖失效時 Pending 不遺失；恢復同步前須重新取得有效鎖並通過版本保護。
- Realtime 只作輕量提示；事件遺失時，進入管理、主動更新或保存所需的伺服器讀取／驗證仍可確認最新狀態。
- 每日詳細行程不再顯示預覽變更及變更計數，也不為這些已取消功能執行專用摘要計算；鎖定提示與資料更新提示仍正確。
- 驗收需確認清單、帳本、旅程基本資料、設定及其他非每日詳細行程功能，不會被編輯鎖阻擋，也不會因 P3 而改變原有同步、提示及驗證行為。
- **整合後必須重新驗證既有 P0：** 本次整合架構修改完成後，先前 P0 已通過的每一項自動化測試、契約／整合測試及 build，均須在整合後版本重新執行；不得沿用整合前 PASS 作為整合後驗收結果。
- **整合後必須重新驗證真實瀏覽器操作：** 原 P0 涉及的卡片新增、修改、刪除、儲存後重新載入／回讀、雙瀏覽器／雙裝置資料一致性、Pending／離線至重新連線恢復，均須在整合後版本重新實際操作驗證。先前未完成的瀏覽器／離線案例仍屬待驗，不得因整合前資料庫 API 測試通過而視為完成。
- 驗收結果須區分整合前歷史證據與整合後重新執行結果，記錄測試命令／案例、瀏覽器環境、操作步驟、結果及未通過項目；任一原 P0 回歸未通過，不得將統一架構標記為完成。
- 本決策持續有效，直到使用者明確核准修訂或取代。

### Save RPC 整合架構審查紀錄（2026-11-20）

本輪核對既有 migration／trigger 契約，確認：

- V3.5.2 database function hardening 已建立 private schema helper、API role 權限撤銷、固定空 search_path 與 public tc_ SECURITY DEFINER 禁止基準；新 RPC／helper 不得降低此基準。
- V3.6.2 historical Trip trigger 是既有 shared-data 寫入限制，依 stored Trip 與 authenticated role判定；Save RPC 不得以 SECURITY DEFINER、Lease 或受控授權豁免此限制。
- itinerary history trigger 在 content 更新時精準比較 daysData，並使用 advisory transaction lock及歷程保存；RPC 必須正常經過此 trigger，不得停用／bypass。
- visibility/email-map trigger亦會在 trips 更新時執行。Save RPC只更新 daysData並以DB當下content精準替換，需保留此trigger契約與其拒絕／正規化行為。
- 既有歷史限制與其他欄位trigger屬各自原有資料安全／功能契約，不等同將其他功能納入 Trip Edit Lock；ADR-001的鎖仍只保護每日詳細行程。

**整合方案補充（審查基準，非實作授權）：** Save RPC須在同一交易中依固定順序鎖定及驗證 Lease、version，之後更新 Trip 的 daysData，讓既有 Trip row locking、history trigger/advisory lock及其他 trigger自然執行；失敗一律交易rollback。所有新增SECURITY DEFINER入口需空 search_path、schema-qualified reference、明確REVOKE／GRANT，且不得直接暴露私有helper。正式驗收仍須驗證實際Supabase role／auth context及兩個獨立Auth context。

**本輪結論：** 未發現需變更ADR-001核心決策的證據；上述既有Trigger契約已明確列入Save RPC整合驗收。尚未進行正式RPC或正式資料庫實作。

### Save RPC 整合 Acceptance Matrix（補齊規格，2026-11-20）

此矩陣是後續隔離原型及正式整合驗收的必要契約；列出的情境尚不代表已測通。測試只能使用本機／隔離DB、臨時資料與兩個獨立 Auth context，不操作正式資料。

| ID | 情境 | 預期結果 | 失敗／回復要求 |
|---|---|---|---|
| SR-01 | 有效 Lease + 正確 expected version 保存 | RPC成功；僅daysData改變；itinerary version原子+1 | 保存成功後Pending可確認並清理 |
| SR-02 | Lease不存在、他人持有、owner/client不符或已過期 | Save拒絕，明確lease-lost | daysData、version及history均不變；Pending保留 |
| SR-03 | expected version落後 | 明確version-conflict | 不更新daysData/version；保留Pending與merge資料 |
| SR-04 | 兩個Save使用同Lease、同expected version並行 | 僅一個成功，另一個CAS conflict | version僅+1，敗方不得覆蓋勝方 |
| SR-05 | Claim/接管與Save競爭 | 依同一Lease row lock／固定lock order序列化；Save只能由交易內有效owner完成 | 不允許驗證後Lease被接管而仍寫入；不死鎖，若失敗整交易回復 |
| SR-06 | Save RPC寫入daysData後觸發既有Trigger／History | history捕捉正確前Snapshot；既有visibility/email及historical限制照常執行 | 任一Trigger拒絕則全交易rollback，包括授權標記與版本 |
| SR-07 | authenticated直接更新daysData／偽造授權標記 | Trigger拒絕；一般role不能直接讀寫私有authz或helper | 不能留下資料／version/history部分變更 |
| SR-08 | 同一Trip其他欄位更新（非daysData） | 不被Edit Lock／daysData enforcement阻擋；原有功能Trigger仍有效 | 不得改動daysData或itinerary version |
| SR-09 | Save交易中途錯誤、RPC回傳／連線失敗 | transaction rollback；成功回覆前不清Pending | 若結果不明，重讀Cloud version/data後reconcile，不盲目重送 |
| SR-10 | NULL、缺少daysData、非JSON型別、dayCount/schema normalization及空值 | 明確驗證／拒絕／既有正規化契約，不能默默把資料變成非預期結構 | 保留原Cloud資料及Pending；需記錄各輸入的預期契約 |
| SR-11 | 兩個獨立 Auth context：user/session A與B | A Lease不能由B保存／續期／釋放；身份以auth.uid為準，client ID只作session辨識 | B操作拒絕且不影響A Lease或資料 |
| SR-12 | Pending Recovery及舊timestamp baseline | 取得最新Cloud snapshot/version後使用既有三方merge；CAS成功才提交 | 衝突／snapshot損壞／無法重建baseline時保留Pending，停止auto overwrite |

**整合設計必須落實：** 固定序列化順序與Lease row locking；所有驗證及daysData更新在同一交易；版本採conditional update並原子推進；Save RPC基於DB當下content精準替換daysData；既有Trigger正常執行；授權紀錄限交易／backend／user／operation並在Trigger驗證後同交易消除；Pending只在確認保存成功後清理。對任何不明結果，先讀回權威Cloud狀態並reconcile。

**下一階段：** 以本地隔離DB建立組合原型，至少涵蓋Lease驗證 + CAS + daysData Trigger/history + rollback，並以雙獨立Auth context及並行session驗證SR-04、SR-05、SR-07、SR-11；完成後逐項更新測試證據，未通過不得宣稱整合完成。此矩陣不授權正式程式或正式migration實作。

### Save RPC交易與安全規格補充（審查準備，2026-11-20）

#### A. RPC介面與資料驗證
- Save RPC需明確接收 `trip_id`、`client_id`、`expected_itinerary_version`、完整待保存 `daysData`；使用者身份不得從參數接收，而由 `auth.uid()`取得。
- `client_id`是session識別，不是身份或授權；不得因其為UUID或由前端生成就視為可信。RPC須驗證格式、必要非空值、daysData JSON shape及Trip有效性。
- `expected_itinerary_version`使用整數且拒絕null／負值／溢位／不合法型別；資料版本不得依client timestamp產生。
- RPC結果需能區分成功、新Lease失效／權限拒絕、version conflict、輸入錯誤、Trip不存在／歷史限制，以及未知DB錯誤。不要將所有失敗折成false或讓client推測原因。

#### B. 建議交易序列（待隔離prototype證實）
1. 取得`auth.uid()`；若未登入即拒絕。驗證RPC輸入及使用者對Trip每日詳細行程的管理權限。
2. 以`trip_id`取得Trip-level Lease row並`FOR UPDATE`鎖定。Lease不存在時拒絕；鎖定後重新驗證owner_user_id、owner_client_id、expiry（以DB clock為準）。Lease取得／接管／Save共用Lease row的鎖競爭，避免Save驗證後被接管。
3. 在同一交易中依固定順序鎖定／更新Trip資料列，驗證expected itinerary version。version mismatch即回傳明確conflict且不寫daysData。
4. 建立受控daysData更新授權紀錄，綁定交易ID、backend PID、Trip、user及operation；授權表/helper不授予authenticated直接存取。Trigger必須驗證精確匹配及daysData實際變更，不接受前端單純設定的session flag作授權。
5. 以DB當下content為基礎精準替換`daysData`（不得用client送來的整份content覆蓋），並在conditional version update中推進專屬itinerary version。只允許expected version匹配時成功；實際UPDATE與版本推進必須同交易。
6. 正常觸發既有history、visibility/email map及historical Trip限制；不得停用或繞過Trigger。任何Trigger／CAS／權限錯誤使整交易rollback。
7. Trigger完成受控更新驗證後，在同交易清除授權紀錄；RPC成功commit才回成功。RPC不得在提交後另行補寫version或history。

**Lock order／死鎖防護要求：** Lease row先於Trip row；其他涉及同一Save路徑的鎖不得逆序取得。History trigger/advisory lock、Trip row lock、version update需檢視既有實際順序後再定義正式lock order；目前上述順序是候選方案而非已驗證定案。測試需使用並行session及lock timeout／deadlock觀察，任何逆序路徑須消除或設計安全retry。

#### C. Version及資料結構契約
- Itinerary version應有Trip專屬欄位或等價獨立資料表；不得以全列`updated_at`作version，也不得由其他功能更新推進此version。
- 初始化baseline必須對現有Trip逐筆確認；timestamp不能直接轉換成version。Version初始化／回填須可重複、可查核，且不得改寫daysData或history；正式migration另行審查。
- CAS失敗必須回傳最新version或讓client fetch最新Cloud snapshot；不得在RPC內自動把舊expected version改成最新版本後重送原payload。
- Save只修改daysData與專屬version；除既有Trigger契約明確允許外，不得寫其他content欄位。版本不因非daysData更新變動。

#### D. Pending與RPC回覆不確定性
- Client先持久化Pending及base snapshot，RPC送出後不得先清除Pending。
- RPC明確成功且client確認Cloud version/data後才清Pending；若回覆中斷或timeout，不假設Save失敗／成功，重新讀Cloud version及daysData，以三方merge/reconciliation判定是否已保存或仍Pending。
- 若Cloud data與Pending完全一致可判定already-synced；若version已變但內容不一致，重新merge；不得用重試原payload方式處理未知結果。
- Lease失效／CAS conflict／DB拒絕時不丟Pending；使用者退出、切換Trip、關閉視窗或heartbeat失敗均不得清除尚未確認保存的Pending。

#### E. Security／Trigger acceptance細節
- SECURITY DEFINER functions使用固定空`search_path`，所有資料表/function引用schema-qualified；REVOKE public/anon/authenticated對私有helper及authz table的直接權限，僅授權公開RPC必要EXECUTE。
- Trigger對daysData變更必須採嚴格比對；授權紀錄缺失、錯Trip、錯user、錯backend/transaction、錯operation、已消除或重複使用一律拒絕。Trigger拒絕不應阻擋非daysData欄位更新。
- Trigger不得將service role或管理員身份自動視為跳過daysData enforcement的例外；若migration/service operation需要daysData更新，必須另有明確、可審核的授權契約，不得隱藏bypass。
- Trigger及RPC不依賴前端傳入email作權限判斷；身份採`auth.uid()`及DB權威角色／Trip access規則，既有歷史Trip限制仍優先執行。

#### F. Prototype進入條件及停止界線
- 隔離prototype先確認本地DB的實際Trips表、history Trigger、Lease schema、權限與Auth context可安全構造測試；若只能以postgres/service role測試，不能代替authenticated驗收。
- 測試資料、helper、Trigger、RPC均須置於可rollback transaction或獨立temporary schema；避免修改既有migration、正式Trip資料、正式DB或production secrets。
- SR-04/05/06/07/09/11的結果須有實際並行／拒絕／rollback證據。若缺少兩個有效Auth context或不能測試RLS/Trigger實際角色，記錄為blocked，不得宣稱通過。
- 下一階段審查前須完成：規格讀回、候選lock order實測、授權標記安全模型確認、CAS/Trigger/history原子性、rollback、雙Auth context驗證或明確列出受阻原因、Pending不清理及unknown outcome recovery契約。此補充仍不授權正式程式實作或migration。

### 下一階段技術審查目標：施工藍圖與防回歸控制（2026-11-20）

目的：在開始正式實作前，將既有架構決策與原型證據轉化為可按階段施工的具體藍圖，降低改動既有程式、資料及其他功能的風險。此審查不重新設計已Accepted架構，也不授權正式實作。

審查項目：

1. **完整修改點盤點：** 依實際程式呼叫鏈列出需修改／新增的DB schema、migration、Lease RPC/service、Save RPC、Trigger、version、Repository、Hook、Sync、Reconciliation、Pending storage及Recovery；確認所有daysData遠端寫入路徑，避免漏改或保留旁路。
2. **明確修改邊界：** 逐項確認修改僅服務每日詳細行程；其他功能的保存、同步、revision、Realtime、CAS、提示與資料契約不被擴張改動。列出不應修改的檔案／模組或其行為契約。
3. **分階段施工順序：** 提出可逐階段驗證的順序與每階段進入／退出條件，避免同時改DB與前端而無法定位故障；每階段可安全停止，未通過不得推進。
4. **回歸測試與驗收映射：** 將ADR SR-01至SR-12、原P0既有測試、真實瀏覽器／雙裝置操作、離線Pending Recovery及非每日詳細行程功能隔離測試映射至施工階段，定義實際可執行的驗證證據；整合前PASS不可代替整合後重新測試。
5. **失敗及回復策略：** 每階段列出可回復方式、資料保護措施、migration／版本初始化的風險與停止條件。Pending、Cloud snapshot及已保存資料不得因失敗或未知結果遭清除／覆寫；正式DB操作或不可逆操作須另行授權。
6. **整合原型審查收尾：** 先完成必要隔離整合驗證，逐項記錄PASS／FAIL／BLOCKED及證據。環境無法驗證的項目須明確揭露，不可以單項prototype PASS推論整體整合PASS。

完成條件：上述六項有實際 repository／DB／測試依據，施工藍圖、修改邊界、階段驗收及回復策略已寫入相關文件並read-back驗證；所有技術審查差距與環境限制清楚列明。達成後停止審查並提出實作階段建議，不自行開始正式實作、migration、commit、push或deployment。

### 審查結論與施工契約補充（2026-11-20）

本節將已查明的問題直接落定為施工契約，避免施工前再重複調查已完成的架構分析或原型。

#### 1. 已完成審查不得重做

- 已完成的架構呼叫鏈盤點、Trigger enforcement、Lease 原子 Claim、CAS、既有 history Trigger 相容性及交易/backend binding 隔離原型，均作為既有證據；施工時只檢查其整合缺口，不重新做相同的孤立測試。
- SR-01至SR-12仍是驗收契約；現有prototype PASS只保留其原本限定範圍，不推論整合PASS。
- 既有 save入口、Pending／Recovery及同步流程的分析，施工前不再全面重查；僅補齊尚未分類的實際遠端 daysData 寫入 caller／旁路，以及其是否必須改接唯一Save RPC。

#### 2. daysData 寫入與呼叫者封閉清單

施工前／第一階段必須形成實際可核對的caller清單，至少涵蓋下列既有候選路徑：

- `src/components/ItineraryPage.tsx`：每日卡片編輯操作及各save callback。
- `src/hooks/useTripWorkspace.ts`：`saveItineraryTripDetail()`、`saveCurrentTripDetail()`、`updateTrip()`及auto-sync／Recovery／conflict處理。
- `src/services/tripRepository.ts`：`saveTripRecordWithCloudSync()`、`updateTripRecord()`及upsert／CAS整列寫入路徑。
- `src/services/tripCloudService.ts`：`updateCloudTripRecord()`、`upsertCloudTripRecord()`及其實際呼叫者。
- `src/services/itinerarySync.ts`、`src/storage/itinerarySyncStorage.ts`、`src/services/tripReconciliation.ts`：Pending、reconcile及Recovery。
- 既有DB RPC、Trigger、migration及所有直接／間接更新trips.content.daysData的程式或SQL路徑。

清單每項須分類為：(a)每日詳細行程合法Save入口，將改接專用RPC；(b)非每日詳細行程操作，保持既有契約；(c)初始化、migration、維護或特殊操作，需明確定義受控且可審核的例外，不能默認bypass Trigger。完成清單前不得宣稱daysData旁路已封閉。

#### 3. Trip基本資料／dayCount與daysData的契約

- Trip基本資料及其他非每日詳細行程功能不受Edit Lock管制；不得因更新Trip metadata要求取得每日詳細行程Lease。
- 但既有 `updateTripRecord()` 依dayCount重新建構／裁切daysData，可能間接改寫每日詳細行程資料。此副作用不得繼續以一般整列Trip更新方式繞過唯一Save RPC／Trigger。
- 修改dayCount或其他Trip metadata時，metadata更新與daysData變更必須分離。只有當操作實際改變daysData時，才依每日詳細行程的受控Save契約處理；metadata本身不取得Edit Lock。
- dayCount縮短造成的卡片／日資料裁切不得在未經每日詳細行程受控保存及明確資料處理契約下默默發生。不得將metadata更新傳入的舊整份content覆蓋Cloud daysData。
- 此契約不將Trip基本資料功能納入Edit Lock；它只封閉非itinerary更新造成的daysData旁路。

#### 4. 分階段施工及停止條件

**Stage 0 — Caller封閉與範圍基線**
- 完成第2節caller分類及第3節dayCount契約。
- 建立整合前測試基線、受影響檔案清單及非每日詳細行程保護清單。
- 退出條件：所有daysData遠端寫入路徑已辨識並分類；存在未分類路徑即停止。

**Stage 1 — DB schema／Lease／version／Trigger／唯一Save RPC**
- 在隔離DB建立必要schema、version baseline、Lease契約、enforcement Trigger及唯一Save RPC；不得對正式DB執行。
- 依既有SR矩陣驗證授權、雙Auth context、競爭、CAS、Trigger/history、rollback、非daysData更新及安全權限。
- Exit：必要整合案例PASS；缺少雙Auth context、實際role/RLS驗證或其他關鍵證據即標BLOCKED，禁止推進。

**Stage 2 — Cloud service／Repository接線**
- 將每日詳細行程遠端daysData寫入收斂至Save RPC；其他功能的整列更新／保存路徑維持原契約，且不能藉由metadata更新改寫daysData。
- Exit：caller封閉清單逐項驗證；direct daysData旁路被DB拒絕；非itinerary操作仍可正常保存。

**Stage 3 — Hook／UI／Lease／Pending與Recovery整合**
- 接線Trip-level Lease、保存協調、Pending persistence、version reconciliation、unknown outcome recovery及Lease失效處理。
- Exit：保存成功確認後才清Pending；失敗／timeout／lease lost／conflict均保留Pending並可恢復，沒有舊holder上傳。

**Stage 4 — 整合回歸及交付審查**
- 重跑SR-01至SR-12及原P0既有自動化／契約／整合測試、build、真實瀏覽器操作、雙瀏覽器／裝置、離線與重新連線Recovery。
- 驗證清單、帳本、Trip基本資料、設定及其他非每日詳細行程功能仍按原契約運作。
- Exit：全部必要驗收PASS，FAIL已修復且重新驗證，BLOCKED項目不得宣稱完成；提交施工結果及Git差異供使用者確認。

各Stage未達退出條件不得進入下一Stage；任何失敗均先定位與修正本Stage，不以跳階或假設通過處理。

#### 5. 修改範圍固定與回歸防護

- DB／migration／RPC／Trigger：只新增或調整每日詳細行程受控寫入、Lease及專屬version所必需內容；既有history、visibility/email map、historical限制及security hardening不得移除或bypass。
- Cloud／Repository／Hook／Pending：只修改每日詳細行程遠端保存、Lease、version及Recovery所必需的接線；非每日詳細行程保存契約不得重構或替換。
- UI：僅每日詳細行程管理操作依Lease／保存結果調整；其他功能不得新增Edit Lock UI、鎖狀態、阻擋或提示。
- 不以共用模組、共用Trip資料表或技術依賴為理由擴張鎖定範圍。
- 每Stage需檢視Git diff，排除未核准的重構、格式化、功能改動或其他功能資料契約變更。

#### 6. 每階段回復與資料安全

- DB階段：只使用隔離DB及可回復測試資料；migration／baseline設計需具可查核與停止機制，正式DB變更另行授權。不得將已寫入的正式資料視為可藉rollback migration直接回復。
- Cloud／Repository接線階段：可回復程式差異，但不得以退回舊直接daysData寫入方式作為安全rollback；DB enforcement仍須封閉未受控寫入。若程式回退與DB契約不相容，先停用受影響的部署流程並保護Pending。
- Pending／Recovery階段：原Pending snapshot、Cloud snapshot及conflict state保留；未知RPC結果先讀Cloud並reconcile，禁止清空、盲目重送或以空資料代替。
- 任一Stage資料安全無法確保、正式DB操作未授權或rollback方案不明時停止，不自行進行不可逆操作。

#### 7. 審查收尾判定

施工藍圖、修改封閉清單、dayCount契約、Stage退出條件、回歸映射及回復策略以上述內容為既定施工基準。後續若實際程式／DB證據與此契約衝突，先提出具體差異、影響及必要修訂，不自行改變Accepted決策。完成本審查後不得重複進行已PASS的孤立原型或重新設計架構；僅處理實際整合驗證及施工。

本補充仍不授權正式程式實作、正式migration／DB操作、commit、push或deployment。

## 權威規格連結

- 本決策為每日詳細行程編輯鎖範圍、統一保存協調責任及 P3 提示簡化方向的權威紀錄。
- 實作細節、測試矩陣及執行進度記錄於《[116_卡片編輯故障根因與旅程級編輯契約調查紀錄](../../116_卡片編輯故障根因與旅程級編輯契約調查紀錄.md)》。
- 本決策不授權改動其他功能。
