# ADR-001：每日詳細行程統一編輯與保存架構

- **ID：** ADR-001
- **狀態：** Accepted
- **核准日期：** 2026-11-19
- **修訂日期：** 2026-11-24
- **本次核准修訂：** 2026-11-24（同一 TRIP 的「管理卡片」與「編輯旅程」共用既有 Trip Lease）
- **標題：** 每日詳細行程統一編輯權、保存協調與更新提示簡化

## 決策內容（不可因階段拆分而變更）

本決策整合並取代先前將卡片保存修正（P0）與旅程級編輯權（P1）分開規劃的架構方向。每日詳細行程的編輯權、保存協調及其提示簡化，應依同一目標架構設計與實作，避免先建立一套日後必須重構的卡片級獨立驗證流程。

**Trip Lease 的協調範圍（2026-11-24 核准修訂）：** 鎖定單位仍為整趟 Trip；同一趟旅程的「管理卡片」與「編輯旅程」是同一組互斥編輯入口，共用既有 Trip Lease。任一入口持有有效 Lease 時，另一入口不得同時進入編輯；不得另建第二套鎖或只在 UI 按鈕層做限制。重新聚焦／頁面恢復時，只重新查詢目前 TRIP 的 Lease 狀態，不主動釋放或清除鎖提示；切換 TRIP 時依新的 `trip_id` 查詢，彼此隔離。

「管理卡片」入口仍保護每日詳細行程卡片新增、修改、刪除及其必要資料操作；「編輯旅程」入口另保護同一 TRIP 的旅程基本資料修改。已開啟的編輯旅程視窗在送出時，必須再次確認目前 Lease 仍有效且由本端持有，避免入口檢查後 Lease 狀態改變造成競態。旅程基本資料更新須納入既有 Trip Lease 協調，不得只鎖入口而讓保存提交繞過。

此 Lease 是正常使用流程的同時編輯協調機制，不是取代資料權限模型或防範具管理權限者刻意繞過的安全邊界。刪除旅程仍只透過「編輯旅程」入口提供，並維持既有 `super_admin` 權限限制；本次不增加刪除專用 Lease／DB enforcement，也不改變既有刪除授權模型。

鎖定擴大僅限上述兩個編輯同步功能；清單、帳本、旅程其他設定及所有其他功能同步不得改變。

### 統一責任分工

- **Trip Edit Lock：** 唯一編輯權協調機制，由伺服器原子取得及驗證；正常離開釋放，非正常中斷由租約到期回收。
- **Realtime：** 僅作鎖定狀態及資料更新通知，不是編輯權授權來源，不因事件自動讀取整份 Trip 或執行摘要統計。
- **Revision：** 保留必要資料更新／異常訊號及事件遺失後操作時補查；全域 revision 通知本身不得拒絕合法保存，也不得取代鎖驗證。
- **CAS／Version：** 保留最後一道資料一致性保護，防止舊版本覆蓋新版本；不取代 Trip Edit Lock。
- **Offline policy（2026-11-21核准修訂）：** 每日詳細行程離線只讀，離線時禁止開啟編輯、新增、修改、刪除及排序等變更；無法確認有效Trip Lease即禁止編輯。重新連線後須重新確認／取得有效Lease才恢復編輯。離線卡片編輯與Offline Pending→Autosync不再是產品需求或驗收項目。既有Pending／Recovery仍僅處理線上保存未知結果、版本衝突或既有保護狀態，不得用來接受離線編輯。
- **保存協調入口：** 每日詳細行程新增、修改、刪除及自動／恢復同步收斂至一致的鎖、版本與 Pending 協調流程，不另建平行卡片遠端驗證流程。

### 已定案的資料庫邊界與版本責任

- `daysData` 實際變更仍只受每日詳細行程 Save RPC／DB Trip Lease enforcement 與 itinerary version CAS 保護；既有資料庫契約不因本次擴大入口協調而改變。
- 同一 TRIP 的旅程基本資料修改須與「管理卡片」共用既有 Trip Lease：從「編輯旅程」開啟時先取得／確認 Lease，編輯期間續租，送出前再次確認 Lease 仍由本端持有，保存成功或正常離開後釋放；Lease 失效、他端持有或狀態無法確認時不得提交旅程基本資料修改。
- Trip Lease 入口協調只作用於「管理卡片」與「編輯旅程」兩個功能。其他功能的保存、同步、revision、Realtime、CAS／版本及驗證流程保持原狀。
- `daysData` 的唯一合法遠端寫入通道為專用 itinerary Save RPC；直接 REST／UPDATE 或其他 RPC 不得繞過。
- Save RPC 在單一原子交易內驗證 Trip-level Lease 與 itinerary version CAS，只更新 `daysData` 並原子推進專屬版本；不得回寫前端舊的整筆 `content`。
- 授權必須由資料庫權限模型保護且不可由 authenticated 使用者偽造；Trigger 必須拒絕未經受控通道的 `daysData` 寫入。
- Claim、Renew、Release、Save 遵守一致 Lease row locking／交易序列化契約；失效持有者不得保存成功。
- Pending／Recovery限於線上Save RPC未知結果、CAS衝突或已存在的安全保護狀態；不得新增離線卡片修改Pending。版本基準使用 itinerary version，舊 timestamp不得直接轉成version；Recovery取得可信Cloud snapshot/version，無法安全重建時保留Pending並停止自動覆寫。
- 受控授權、Trigger／RPC 權限及直接 UPDATE 封鎖須以資料庫整合測試證明；未驗證前不可宣稱完成。

### 適用範圍與禁止事項

- 本 ADR 的共用 Trip Lease 編輯協調範圍，僅限同一 TRIP 的「管理卡片」與「編輯旅程」兩個入口；兩者互斥並共用同一 Lease。
- 「管理卡片」範圍：每日詳細行程卡片新增、修改、刪除及其必要資料操作；卡片呈現／操作所需天氣、路線／交通、圖片等仍屬該功能範圍。
- 「編輯旅程」範圍：旅程基本資料編輯及其保存提交。刪除旅程仍位於此入口，使用既有 `super_admin` 權限限制；本 ADR 不新增刪除專用 Lease enforcement 或 DB enforcement，也不改變既有權限政策。
- 清單、帳本、天氣以外的其他旅程工具、旅程其他設定及所有非上述兩個編輯入口功能，均不受本次共用編輯 Lease 控制。
- 不得因共用資料表、服務或技術依賴再擴張鎖定範圍；不得改動其他功能既有同步、revision、Realtime、CAS／版本或驗證流程。
- 每日詳細行程只保留編輯鎖提示及資料更新提示；取消預覽變更、變更分類／統計及其專用呈現／計算。共用資料或其他功能依賴須先盤點，不得逕行刪除。

### 依據與持續有效性

使用者於 2026-11-19 核准將 P0 卡片保存修正、P1 旅程級單一編輯權及 P3 提示簡化整合為同一架構，避免新增日後重複的卡片獨立驗證流程。使用者於 2026-11-24 另核准同一 TRIP 的「管理卡片」與「編輯旅程」共用 Trip Lease，並確認刪除旅程仍由編輯旅程入口及既有 `super_admin` 權限共同限制，不額外增加刪除專用 Lease／DB enforcement。上述決策持續有效，直到使用者明確核准修訂或取代；階段文件不得自行改寫本節決策。

## 階段索引與目前進度

2026-11-24 核准的「編輯旅程入口共用 Trip Lease」屬原 S4 Exit 後新增範圍，原 S1／S2／S3／S4 Exit PASS 僅對當時範圍有效；新增範圍尚未實作／驗收，依 `docs/decisions/README.md` 指定的續行入口執行，不得回溯宣稱已完成。

`docs/decisions/README.md` 是此 ADR 狀態、當前階段、下一步與阻塞的唯一總索引；目前階段文件是階段工作進度及執行紀錄的唯一維護位置。階段詳細規格依工作需要載入，不得每次讀取本 ADR 就自動載入所有階段文件。

| 階段文件 | 內容 | 狀態 | 讀取時機 |
|---|---|---|---|
| [ADR-001-S1](ADR-001-S1-db-enforcement.md) | DB schema、Lease、version、Trigger、Save RPC、安全及資料庫驗證基準與詳細測試紀錄 | **S1 DB Exit PASS（2026-11-21）；SR-01～SR-11 DB slice已核對。** S3應用層Pending／Recovery不阻塞S1 DB Exit。 | DB／RPC／migration 工作時 |
| [ADR-001-S2](ADR-001-S2-cloud-save-integration.md) | Cloud Save service／Repository 基礎契約、非 itinerary 保存隔離、RPC adapter／DB contract 基礎驗證 | **S2 Exit PASS（2026-11-21；依核准重新界定範圍核對）** | Cloud／Repository contract 工作時 |
| [ADR-001-S3](ADR-001-S3-client-lock-pending.md) | App callers／Trip metadata-dayCount 分離、Trip-level Lease／可信 version client、Pending／Recovery／Conflict Save RPC 整合、旁路 closure | **原範圍 S3 Exit PASS（2026-11-21）；2026-11-24 核准新增編輯旅程 Lease 協調範圍，尚待另行實作驗收。** | 原範圍已結案；新增範圍依 README 後續安排 |
| [ADR-001-S4](ADR-001-S4-acceptance.md) | 整合後驗收及退出條件（雙瀏覽器競爭UI已取消） | **原範圍 S4 Exit PASS／2026-11-22；2026-11-24 核准新增編輯旅程 Lease 協調範圍，尚待另行實作驗收。** | 原範圍已結案；新增範圍依 README 後續安排 |
| [文件 116](../../116_卡片編輯故障根因與旅程級編輯契約調查紀錄.md) | 根因證據、呼叫鏈調查、工程審查及原始／補充測試證據 | 調查證據來源；不維護階段進度 | 根因調查或需核對原始證據時 |

### 階段治理

1. 每次只執行 README 指定的當前階段；先讀本 ADR，再讀該階段文件及必要領域權威規格。
2. 階段文件保存本階段規格、持續工作進度、每輪執行及測試結果、PASS／FAIL／BLOCKED、未完成項、退出條件與證據連結；它是階段執行紀錄的唯一維護位置。不要複製本 ADR 的 Accepted 決策或文件 116 的根因調查原文。
3. 每次執行、驗證結果、阻塞或下一步變更時，更新該階段文件；同步更新 `docs/decisions/README.md` 的精簡狀態／下一步。文件 116 僅在新增根因分析或原始證據時更新，不用來代替階段工作日誌；不可在未達退出條件時推進階段。
4. 新的持續性架構決策或對 Accepted 內容的修改，仍須依決策治理規則取得核准並同步更新 ADR 主檔與 README；階段檔不能單方面改變決策。
5. 原型 PASS、Stage exit PASS、程式完成、DB migration 套用與正式環境驗收是不同狀態，必須分開標示。

## Stage 1 驗證狀態

**S1 DB Exit PASS（2026-11-21），目前進入 S2 Cloud Save 接線。** S1的DB enforcement／Lease／version／Save RPC必要驗證（SR-01～SR-11 DB slice）已完成追溯核對。SR-09／SR-12的App Pending／Recovery屬S3跨層工作，不阻塞S1 DB Exit；整體ADR-001仍須依S2、S3及S4完成整合與驗收。進度／下一步以 [決策總索引](../../decisions/README.md) 為準，詳細S1證據以 [S1階段文件](ADR-001-S1-db-enforcement.md)為準。文件116僅保留根因分析與原始調查證據。
- [文件 112：區段預報 P0 技術驗證與實作前檢查紀錄](../../112_區段預報P0技術驗證與實作前檢查紀錄.md)：僅在涉及該領域時讀取；非 ADR-001 的替代決策來源。
- 本 ADR 不授權正式程式實作、正式 DB 操作、commit、push 或 deployment；各步驟仍依使用者明確授權及專案操作規範執行。