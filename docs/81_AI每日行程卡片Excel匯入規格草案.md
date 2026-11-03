# 新增 TRIP Excel 建立規格草案

> 狀態：產品範圍與主要規則已定案，文件草案；建議排入 V3.11.0（MINOR 主要功能），尚待 Product Owner 核准實作。
>
> 開發狀態：尚未實作程式。版本建議不代表已核准開始開發或資料庫變更。
>
**重要範圍定案（2026-11-03）：V1 採用新增 TRIP 時匯入 Excel 的 A 流程；使用者在新增 TRIP 時選擇「Excel 建立」或「手動新增」，兩者二選一，Excel 直接建立新 TRIP，不要求先建立空白 TRIP。舊方案 B「既有 TRIP 每日卡片 Excel 匯入／匯出」已捨棄，不屬本功能、不保留為 V1 或後續待辦規格；其單日／零卡片資格、既有卡片覆蓋、地點搜尋與候選確認等規則不得套用至 A。V1 採單一可見工作表「新增 TRIP」，TRIP 基本資料只有 TRIP 名稱及出發日期兩欄；卡片日序最大值推導天數，其他設定由系統預設。
>
> **安全與資料邊界原則（2026-11-03 定案）：只有 Super Admin 可執行 Excel 建立。採三層保護：第一層由前端限制匯入入口只對 Super Admin 顯示；第二層於確認匯入時自動檢查當下 Supabase Session／登入憑證有效性、線上狀態與目前帳號，不要求再次啟動 Google OAuth；第三層由 Excel 專用 RPC 依目前請求 JWT 與資料庫權威角色重新核對 Super Admin，作為最終授權。前端 Session 或角色快取不得取代 RPC 授權，任何檢查失敗或無法確認均停止匯入。系統背景產生或由資料庫安全設定保護的欄位不得由 Excel 指定；V1 的使用者輸入欄位以本文最新精簡欄位契約為唯一依據，不再採用「手動新增 UI 可修改欄位原則上全部納入 Excel」的舊原則。Excel 欄位標題使用固定繁體中文；格式及允許值依欄位契約嚴格驗證。
>
> **標準範本工作方式（2026-11-03 更新）：先依本節最新單一工作表欄位契約定義並產生一份正式 Excel 範本，固定保存於專案資料夾供日後提取及修改；V1 的範本版本 `template_version=1` 存放於隱藏系統 metadata，不建立使用說明工作表，版本識別由系統維護且使用者不得任意修改。**
>
> 範圍限制：本文件只規範新增 TRIP 的 Excel 建立流程，包含 TRIP 基本資料及每日行程卡片；不包含已捨棄的既有 TRIP 卡片匯入／匯出功能。
>
> 決策紀錄更新：2026-11-03（新增 TRIP Excel V1 精簡欄位契約已定案；剩餘工作為資料映射、範本技術細節、安全性核對及測試規劃，不代表已核准開始程式實作）。

## 新增 TRIP Excel V1 精簡欄位契約（2026-11-03 最新定案）

> 本節為唯一有效的 V1 產品欄位契約，優先於本文其餘歷史討論內容。2026-11-03 決策已取代先前將 TRIP 天數、參與者、編輯者、公開設定、農曆設定及旅程型態列為 Excel 輸入欄位的版本。

### 1. 工作簿與工作表

- V1 只有一張可見工作表，名稱固定為「新增 TRIP」。
- TRIP 基本資料置於工作表上方，行程卡片資料表置於下方；不另建 TRIP 基本資料工作表或使用說明工作表。
- 工作表版面以固定標題及固定區塊界線識別，解析器不得依空白列猜測區塊。
- `template_version=1` 由系統維護於工作簿隱藏的系統 metadata 位置；不得要求使用者輸入或修改。匯入端仍須驗證 metadata、工作表名稱、固定欄位及資料驗證規則。
- 範本檔案預定保存於 `docs/templates/AI新增TRIP標準範本_V1.xlsx`，欄位契約配套文件預定為 `docs/templates/AI新增TRIP標準範本_V1_欄位契約.md`；實際範本檔案待規格及技術核對完成後建立。

### 2. TRIP 基本資料區

| 欄位 | 必填 | 格式／規則 | 系統處理 |
|---|---:|---|---|
| TRIP 名稱 | 是 | 文字；去除前後空白後不可為空 | 沿用新增 TRIP 名稱處理規則 |
| 出發日期 | 是 | 有效日期，固定 `YYYY-MM-DD` | 作為第 1 天日期基準 |

TRIP 基本資料區只有上述兩項。V1 不提供旅程天數、結束日期、參與者、編輯者、公開行程、顯示農曆日期、旅程型態、幣別、幣別符號或 TRIP 備註輸入欄。

### 3. 每日行程卡片資料區

| 欄位 | 必填 | 格式／規則 | 對應及預設 |
|---|---:|---|---|
| 第幾天 | 是 | 正整數，1–30 | 決定卡片歸屬日，並用最大值推導 TRIP 天數 |
| 開始時間 | 是 | 有效時間，固定四位數 `HHMM`，例如 `0930` | 對應卡片 `time` |
| 結束時間 | 否 | 空白或有效時間 `HHMM` | 空白時系統補成開始時間 |
| 行程名稱 | 是 | 文字；去除前後空白後不可為空 | 對應卡片 `title` |
| 類別 | 是 | Excel 下拉選單，只能選擇固定允許值 | 依類別映射至內部 `type` 及對應顏色 |
| 描述 | 否 | 文字，可空白 | 空白時存為空字串 |

類別下拉選單固定為「交通、住宿、景點、餐飲、自駕、其他」。範本以 Excel 資料驗證建立下拉選單；匯入端仍須重新驗證允許值，不能只信任工作簿下拉選單或使用者輸入。

### 4. 天數推導與日期建立

- TRIP 天數不由 Excel 輸入，系統取所有有效卡片「第幾天」的最大值作為 `dayCount`。
- 推導結果必須介於 1–30；至少要有一筆有效卡片。
- `content.days` 由系統產生 `[1..dayCount]`；`content.daysData` 為每一天建立陣列，卡片依「第幾天」分配。
- 出發日期為第 1 天；第 N 天日期由出發日期加 N−1 日計算。結束日期由系統推導，不列入 Excel。
- 中間日序即使沒有卡片仍保留為空白日。例如有第 1 天與第 3 天資料、沒有第 2 天資料，系統仍建立 3 天行程，第 2 天保持空白。
- 第幾天不得超過 30；不得以遺漏的日序縮短推導天數。

### 5. TRIP 系統預設

下列資料全部由系統依目前新增 TRIP 建立流程及權威設定產生，不提供 Excel 欄位：

- TRIP ID、建立／更新時間及其他系統識別資料。
- 參與者：沿用資料庫 `admin_profiles` 與 `admin_users` 的即時權威預設參與者，不硬編碼姓名或 Email。
- 可編輯者：不額外指派 `trip_editor`。
- 公開行程：沿用目前新增 TRIP 的預設值（目前為不公開）。
- 顯示農曆日期：沿用目前新增 TRIP 的預設值（目前為開啟）。
- 旅程型態：沿用目前新增 TRIP 的預設值（目前為跟團／`guided`）。
- 幣別與符號：沿用目前新增 TRIP 表單當下的預設幣別代碼及符號，不固定指定 TWD，不接受 Excel 覆寫。預覽及最終確認均須顯示幣別代碼與符號，要求使用者依本次旅程目的地明確確認；提交前重新取得設定，若與預覽不同則更新預覽並要求再次確認。
- Sidebar、備忘錄、檢查清單、預設其他資訊資料夾及每日資料結構：由系統建立必要初始結構。

### 6. 卡片時間、類別與系統欄位

- 開始時間必填，採嚴格 `HHMM` 格式；不接受 `9:30`、`930`、`24:00` 等輸入。
- 結束時間可空白；空白時系統以開始時間補入。非空白時須為有效 `HHMM`，且不得早於開始時間；V1 不支援跨午夜區間。
- 卡片類別必填，僅接受固定六個選項。中文顯示值須明確映射至程式內部 `type`；`typeColor` 由程式現有類別設定取得，不由 Excel 指定。
- 卡片 ID 由系統產生；描述空白時存空字串；地點 `location` 設為空字串。
- Excel 不提供地點名稱、地址、`location_address`、Place ID、座標、移動方式、交通估算、天氣、照片或路線欄位；匯入不搜尋／確認地點，也不觸發地圖、天氣或路線服務。

### 7. 嚴格驗證

- 先完整解析及驗證整份工作簿，再顯示預覽；驗證完成前不得寫入資料。
- TRIP 名稱、出發日期、卡片第幾天、開始時間、行程名稱及類別為必填；結束時間與描述可空白。
- 任一非空白值格式錯誤、類別不在允許值內、標題缺漏／重複、工作表或 metadata 不符，整份匯入拒絕，不靜默略過錯誤列、不猜測或自動轉換。
- 錯誤須指出工作表、列號及欄位；拒絕時不得建立 TRIP 或部分卡片。
- 範本固定版型與隱藏版本 metadata 均須驗證。缺少、空白或不支援版本均拒絕匯入。

### 8. 版本與範本決策沿革

以下較早決策已被 2026-11-03 精簡方案取代，只保留作為決策沿革，不得當成 V1 現行契約：

- 舊版旅程天數必填 1–30，已改為依卡片最大日序推導。
- 舊版參與者名稱／Email 橫向五組輸入，已改為一律使用資料庫權威預設參與者。
- 舊版 TRIP 編輯者 Email 五組輸入，已改為不額外指派編輯者。
- 舊版公開行程、顯示農曆日期、旅程型態欄位，已改為全部沿用系統預設。
- 舊版兩張或三張工作表／使用說明工作表構想，已改為單一「新增 TRIP」工作表；版本識別移至隱藏 metadata。
- 幣別規則以 P04-04／P05-01-05 最新決策為準：沿用新增表單當下預設幣別及確認流程，不固定 TWD。

## 新增 TRIP Excel 建立：目前已定案項目總覽（2026-11-03）

| 主題 | 最新定案 |
|---|---|
| 建立流程 | 新增 TRIP 時選擇 Excel 建立或手動新增；Excel 直接建立全新 TRIP |
| 工作表 | 單一可見「新增 TRIP」工作表；TRIP 區在上、卡片區在下；版本 metadata 隱藏於工作簿系統位置 |
| TRIP 必填欄位 | TRIP 名稱、出發日期，僅兩項 |
| 卡片欄位 | 第幾天、開始時間、行程名稱、類別必填；結束時間、描述選填 |
| 類別 | 必填，Excel 下拉選單六選項：交通、住宿、景點、餐飲、自駕、其他；匯入端重新驗證 |
| 天數 | 依卡片最大「第幾天」推導，限制 1–30；空白日仍建立 |
| 參與者／編輯者 | 參與者使用資料庫權威預設；不額外指派編輯者 |
| 其他 TRIP 設定 | 公開、農曆、旅程型態及其他設定全部沿用目前新增 TRIP 系統預設 |
| 幣別 | 沿用目前新增表單當下預設幣別代碼及符號；預覽與最終確認明確顯示並確認，設定變更須重新確認 |
| 系統欄位 | ID、日期陣列、卡片初始結構與其他預設資料均由系統產生 |
| 權限 | 僅 Super Admin；第一層 UI 顯示限制、第二層確認提交時自動檢查當下 Supabase Session／登入帳號／線上狀態、第三層 RPC 以 JWT 與資料庫權威角色最終授權；不再次啟動 Google OAuth |
| 雲端完整性 | 僅在線建立；TRIP 與所有卡片整批建立成功後才更新本機快取／UI；結果不明須核對 |
| 地點與其他副作用 | 不匯入地點／地址／座標／Place ID，不觸發地圖、天氣、路線或照片操作 |

**建立流程共同原則**：新增 TRIP 時由使用者選擇「Excel 建立」或「手動新增」，兩者二選一。Excel 匯入不要求先建立空白 TRIP，也不支援既有 TRIP 卡片匯入／覆蓋。匯入前完成整份驗證，預覽幣別及卡片分布，明確確認後才提交。僅雲端整批建立成功後更新本機權威快取／UI；離線或結果不明時不得本機單獨建立或誤報成功。

**目前狀態（2026-11-03 更新）**：產品欄位契約及主要技術架構已整理；已核對資料模型、類別／顏色、日期與 ID、參與者來源、TRIP 建立路徑、通用 RLS、Other Info 儲存及特殊資訊初始資料。TRIP 名稱與出發日期不作唯一限制；不同建立請求即使名稱及日期相同，也允許建立不同 TRIP。安全產品決策已定案為三層保護：UI 入口限制、確認匯入時自動檢查當下 Supabase Session／登入帳號／線上狀態（不再次啟動 Google OAuth）、RPC 依目前 JWT 與資料庫權威角色最終核對 Super Admin。RPC request registry 的併發協定、SQL 權限／交易 rollback 仍待完整 SQL review 與本機驗證。IM01–IM10 尚未執行。正式範本尚未產製；尚未授權程式實作、資料庫 migration 或發布。

### 現行 TRIP ID 與名稱／日期唯一性基線（2026-11-03，公司端實測）

本節記錄目前既有手動新增流程的實際行為，並將使用者本次決策明確納入目標規格。

- **TRIP ID 產生方式**：`src/utils/tripIdentity.ts` 的 `createTripId()` 回傳 `trip-${globalThis.crypto.randomUUID()}`；ID 為隨機 UUID，並非由 TRIP 名稱或出發日期組成。
- **手動新增流程**：`src/services/tripRepository.ts` 的 `createTripRecord()` 呼叫 `createTripId()`；`src/hooks/useTripWorkspace.ts` 的 `createTrip()` 在 `createTripRecordWithCloudSync()` 回報 `DuplicateTripIdError` 時，會重新建立一次新 UUID 再試。這是 ID 碰撞／重複 ID 重試，不是同名同日期防重複。
- **現行雲端寫入**：`src/services/tripCloudService.ts` 的 `insertCloudTripRecord()` 直接對 `public.trips` 執行 `.insert(toCloudTripInsert(record))`；資料庫以 `id` 作唯一識別，並無在該呼叫前以 `title + departure_date` 做防重複檢查。
- **本機資料庫實測**：公司端 2026-11-03 啟動的 local Supabase，透過 `docker exec supabase_db_travel-companion psql` 唯讀查詢 `pg_indexes` 與 `pg_constraint`。`public.trips` 僅見 `trips_pkey (id)`、`trips_departure_date_idx (departure_date DESC)` 與 `trips_created_by_idx (created_by)`；無 `title + departure_date` 或 `btrim(title) + departure_date` 唯一索引。`pg_constraint` 僅見 `trips_pkey` 主鍵及資料格式／外鍵約束，沒有名稱日期唯一約束。本機查詢當下共有 2 筆 TRIP，無空白標題。
- **Migration 狀態**：公司端 Supabase CLI 2.122.0；`supabase migration list --local` 顯示 local 與 linked remote 的已套用 migration 清單逐筆一致，最新為 `20261101120000`。本輪未執行 migration、未對正式資料庫寫入。migration 清單一致只代表版本紀錄一致，不替代 schema catalog 查詢；本機 schema 已另以唯讀 catalog 查詢確認如上。
- **結論與產品決策（2026-11-03）**：TRIP ID 的唯一性完全由隨機 UUID 及資料庫 `trips_pkey(id)` 負責。TRIP 名稱與出發日期只供使用者辨識、顯示與搜尋，不是唯一鍵；允許任何數量的 TRIP 具有相同名稱及出發日期。不同 request ID 代表不同建立意圖，應建立不同 UUID 的 TRIP。不得因名稱／日期相同而拒絕、覆蓋或合併既有 TRIP。
- **明確不採用的方案**：不建立 `UNIQUE (btrim(title), departure_date)` expression unique index、不建立名稱／日期防重複 trigger、不使用 advisory lock／前端預查／RPC 檢查作為名稱日期唯一保護；不新增 `TRIP_DUPLICATE_TITLE_DATE` 錯誤碼或相關 constraint-name 分流。`TRIPS_PKEY`、tombstone 等 ID 本身的唯一及防重用保護仍保留。
- **冪等性界線**：request registry 只防止同一個 `request_id` 的同一次提交因逾時／網路重送而重複建立；相同名稱與日期若由不同 `request_id` 提交，必須允許建立另一筆新 TRIP。request UUID 冪等性不得與名稱＋日期去重混為一談。
- **驗證範圍限制**：本輪直接 catalog 實測針對公司端本機 Supabase；linked remote migration history 已比對，但本輪沒有再查遠端 schema catalog。因此不得把本機 catalog 結果延伸宣稱為已重新實測正式 DB 的現行 indexes。



> 本節只記錄新增 TRIP 的 Excel 建立流程決策；每日行程卡片 Excel 匯入欄位規則仍見後續章節。逐項討論使用固定編號 P01、P02…；後續回覆沿用相同編號。

### 產品決策紀錄（截至 2026-11-03）

本節只記錄產品決策；目前有效欄位及行為以本文開頭「新增 TRIP Excel V1 精簡欄位契約」為準。下列決策不得被解讀為手動新增表單的權限或欄位規則也要一併改動。

1. **P01｜Excel 建立權限（三層保護，已定案 2026-11-03）**：只有 Super Admin 可使用新增 TRIP Excel 建立。第一層：前端只向 Super Admin 顯示 Excel 建立入口。第二層：使用者按下確認建立時，系統自動檢查當下 Supabase Session／登入憑證有效性、線上狀態及目前帳號；若 Session 可由 Supabase 正常更新，須先完成更新再確認，若無 Session、更新失敗、帳號不符或狀態無法確認則停止；不再次啟動 Google OAuth、不要求輸入 Google 帳密。第三層：Excel 專用 RPC 依請求 JWT 與 `auth.uid()`，再以 `private.tc_is_super_admin()` 查詢資料庫權威角色，通過才建立。前端 Session、快取角色名單或任何用戶端旗標都不能取代 RPC 授權。既有手動新增權限及 `trips` 通用 INSERT RLS 不因本功能而收緊；Excel 使用獨立安全寫入入口。
2. **P02｜Excel 可控制資料範圍（已定案）**：Excel V1 僅能指定最新欄位契約列出的 TRIP 名稱、出發日期及六項卡片欄位。TRIP／卡片 ID、建立／更新時間、參與者 Email mapping、編輯者、公開狀態、農曆、旅程型態、幣別及其他系統欄位均不得由 Excel 指定；依系統權威預設或明確確認流程產生。
3. **P03｜欄位標題與格式（已定案）**：使用固定繁體中文欄位標題；格式、必要／選填、允許值及範例均以 V1 精簡欄位契約為準，不得自行增欄或改採英文程式欄位名稱。
4. **P04-01｜固定範本與嚴格驗證（已定案）**：系統提供固定 V1 `.xlsx` 範本，隱藏 metadata 保存 `template_version=1`。匯入端重新驗證工作表、metadata、固定區塊、標題及欄位值；任何不合約定的非空白值拒絕整份匯入，不猜測、不自動轉換、不靜默忽略。
5. **P04-02｜記帳參與者（已定案）**：Excel 不提供參與者欄位；建立時使用即時資料庫權威預設名單，即 `admin_profiles.include_in_new_trip=true` 且 Email 同時存在於 `admin_users.role=super_admin` 的交集。手動新增原有參與者管理行為不變。
6. **P04-03｜可編輯者（已定案）**：Excel 不提供編輯者 Email 欄位；V1 不額外指派 `trip_editor`。需要授權時，建立後使用 App 既有管理功能。
7. **P04-04｜幣別與符號（已定案）**：Excel 不提供幣別欄位；沿用新增 TRIP 表單當下的預設幣別代碼與符號，不固定 TWD、不接受 Excel 覆寫。預覽及最終確認均顯示幣別並要求明確確認；確認前若預設值改變，必須更新預覽並重新確認。手動新增原有幣別選擇不變。
8. **P05-01｜正式範本保存（已定案）**：正式範本固定為 `docs/templates/AI新增TRIP標準範本_V1.xlsx`，配套欄位契約為 `docs/templates/AI新增TRIP標準範本_V1_欄位契約.md`；範本待階段 0 技術細節完成後產生。
9. **P05-01-01｜TRIP 名稱（已定案）**：必填；去除前後空白後不可為空；不另增長度上限或字元白名單。
10. **P05-01-02｜TRIP 基本資料與天數（已定案）**：TRIP 基本資料只有名稱及出發日期；天數由有效卡片最大日序推導，範圍 1–30。
11. **P05-01-03｜結束日期（已定案）**：結束日期＝出發日期＋（最大日序－1）；中間無卡片日仍保留空白日。
12. **P05-01-04｜TRIP 名稱與日期不作唯一限制（已定案，2026-11-03 更新）**：TRIP 名稱本身及相同名稱＋出發日期均可重複；既有 UI 顯示名稱仍由原始 `title` 與 `departureDate` 組成，格式為 `title (departureDate)`。名稱與日期只供使用者辨識，不作為資料庫唯一鍵；不同建立 request 即使名稱及日期完全相同，也建立不同 UUID 的 TRIP。不得拒絕、覆蓋或合併既有資料，也不做 trim／大小寫／Unicode 等價去重。唯一性由 `trip-<UUID>` 與 `trips_pkey(id)` 保證；同一提交的重送另由 request UUID 冪等性處理。
13. **P05-01-05｜預設幣別（已定案）**：依 P04-04。
14. **P05-01-06｜記帳參與者（已定案）**：依 P04-02。
15. **P05-01-07｜TRIP 編輯者（已定案）**：依 P04-03。
16. **P05-01-08｜TRIP 備註（已定案）**：不納入 Excel V1。
17. **P05-05｜公開行程（已定案）**：不提供 Excel 欄位；沿用目前新增 TRIP 預設不公開。
18. **P05-06｜顯示農曆日期（已定案）**：不提供 Excel 欄位；沿用目前新增 TRIP 預設開啟。
19. **P05-07｜旅程型態（已定案）**：不提供 Excel 欄位；沿用目前新增 TRIP 預設跟團（`guided`）。

**系統預設補充（2026-11-03）**：公開行程預設不公開、顯示農曆日期預設開啟、旅程型態預設跟團；以上沿用目前新增 TRIP 系統預設，不再作為 Excel 輸入欄位。

### 新增 TRIP Excel 建立：目前已定案項目總覽（截至 P05-01-08、P05-07）

以下彙整本輪已確認的產品規則，供後續欄位審查及正式範本製作使用；未列為已定案的欄位仍須逐項確認。此總覽不代表已核准程式實作或資料庫變更。

| 編號 | 欄位／主題 | 已定案規則 |
|---|---|---|
| P01 | Excel 建立權限 | 僅 Super Admin；第一層 UI 入口限制，第二層確認建立時自動檢查當下 Supabase Session／登入帳號／線上狀態（不再次啟動 Google OAuth），第三層 Excel 專用 RPC 以 JWT、`auth.uid()` 與資料庫權威角色最終授權。既有手動新增及通用 INSERT RLS 不改動。 |
| P02 | Excel 可控制資料範圍 | 僅限 V1 精簡契約的兩個 TRIP 欄位與六個卡片欄位；所有系統識別、預設、權限及設定欄位均由系統產生或確認。 |
| P03 | 欄位名稱與說明 | 固定繁體中文標題；欄位型別、格式、必填／選填及允許值依 V1 精簡欄位契約。 |
| P04-01 | 固定範本與驗證 | 固定 `.xlsx` 範本及隱藏 `template_version=1`；重新驗證版型與值，任一違規拒絕整份匯入。 |
| P04-02 | 記帳參與者 | 不提供 Excel 欄位；使用 `admin_profiles.include_in_new_trip=true` 且 Email 同時具有 `admin_users.role=super_admin` 的即時交集名單。 |
| P04-03 | TRIP 編輯者 | 不提供 Excel 欄位；不額外指派 `trip_editor`。 |
| P04-04 | 預設幣別 | Excel 不提供幣別代碼、幣別名稱或符號欄；沿用新增 TRIP 表單當下預設幣別代碼及符號，不固定使用 TWD、不接受 Excel 覆寫。預覽及最終確認顯示幣別並要求使用者明確確認；若預覽期間設定改變，更新並要求重新確認。手動新增原有幣別選擇行為不變。 |
| P05-01 | 正式範本 | 欄位契約完成後，正式範本固定為 `docs/templates/AI新增TRIP標準範本_V1.xlsx`，配套契約文件為 `docs/templates/AI新增TRIP標準範本_V1_欄位契約.md`；目前尚未建立。 |
| P05-01-01 | TRIP 名稱 | 必填；去除前後空白後不可為空；V1 不另增長度上限或字元白名單。 |
| P05-01-02 | TRIP 基本資料與天數 | TRIP 區僅有「TRIP 名稱」「出發日期」兩欄；天數由卡片最大「第幾天」推導，範圍 1–30。 |
| P05-01-03 | 結束日期計算 | 天數由最大卡片日序推導；結束日期＝出發日期＋（推導天數－1），包含出發日。 |
| P05-01-04 | TRIP 名稱與日期唯一性 | 不設名稱＋日期唯一限制；允許完全相同的 `title + departure_date` 建立多筆不同 UUID 的 TRIP。UI 顯示仍為 `title (departure_date)`；名稱與日期僅供使用者辨識。 |
| P05-01-05 | 預設幣別 | 不提供幣別代碼／符號輸入欄；匯入建立沿用系統目前「新增 TRIP」表單的預設幣別代碼與符號，不固定使用 TWD，亦不接受 Excel 覆寫。匯入預覽及最終確認均須顯示幣別與符號，提醒匯入者依本次旅程目的地確認；未經確認不得提交。 |
| P05-01-06 | 記帳參與者 | 不提供 Excel 欄位；一律使用資料庫 `admin_profiles` 與 `admin_users` 即時權威預設名單。 |
| P05-01-07 | TRIP 編輯者 | 不提供 Excel 欄位；不額外指派任何 `trip_editor`。 |
| P05-01-08 | TRIP 備註 | 不納入 Excel V1。 |
| P05-05 | 公開行程 | 不提供 Excel 欄位；沿用目前新增 TRIP 預設不公開。 |
| P05-06 | 顯示農曆日期 | 不提供 Excel 欄位；沿用目前新增 TRIP 預設開啟。 |
| P05-07 | 旅程型態 | 不提供 Excel 欄位；沿用目前新增 TRIP 預設跟團（`guided`）。 |

**建立流程共同原則**：新增 TRIP 時由使用者選擇「Excel 建立」或「手動新增」，兩者是二選一的建立方式，但 Excel 使用最新精簡欄位契約，不要求欄位與手動表單完全相同。Excel 直接建立新 TRIP，不先建立空白 TRIP，也不套用既有 TRIP 匯入的單日／零卡片資格。建立前確認雲端可用；只有雲端整批交易成功後才更新本機權威快取／UI。離線或建立結果不明時停止，結果不明須依提交識別查詢雲端，不得誤報成功或只在本機建立。

**目前狀態**：P01–P05-07 產品決策已定案；Excel 精簡欄位契約為唯一有效欄位依據。Excel 專用 RPC 的安全邊界、輸入／輸出、錯誤碼、交易順序、重複判定及逾時處理已記錄於第 8 節；request UUID 保存位置、跨手動建立併發防護及目標 DB trigger／RLS 實際狀態仍待驗證。正式 Excel 範本待階段 0 收斂後建立。尚未授權程式實作、資料庫 migration 或發布。

### 手動新增 TRIP 程式核對補充（2026-11-03，只讀檢查）

- 手動新增入口會先要求在線，並呼叫管理者資料載入流程；參與者預設資料來自 `admin_profiles.include_in_new_trip=true`，再以 `admin_users.role=super_admin` 的 Email 過濾。Excel 參與者欄空白時必須使用同一權威來源，不得硬編碼 Howard／Carol 或沿用過期快取。
- 「公開行程」手動新增預設為關閉；repository 建立資料時缺省亦為 `false`，與 P05-05 的 `0` 一致。
- 「顯示農曆日期」手動新增預設為開啟，與 P05-06 的 `1` 一致。
- 「旅程型態」新建預設為 `guided`（跟團），與 P05-07 的 `0` 一致。
- 手動新增表單目前新建時預設幣別為 TWD（`TripEditorModal` 的預設狀態），並允許使用者選擇目前支援的幣別；資料模型會保存 `currencyCode` 及 `currencySymbol`。Excel 匯入不另設幣別輸入欄，也不固定鎖定 TWD；應沿用同一新增流程當下的系統預設幣別代碼與符號，且不得由 Excel 覆寫。匯入預覽及最終確認均須顯示將使用的幣別與符號，提醒匯入者依本次旅程目的地確認後才提交；若預覽期間系統設定改變，必須重新載入設定並再次確認。
- 手動新增的「記帳代號設定」仍依 App 既有表單規則維護；Excel V1 不提供參與者欄位，建立時直接載入資料庫權威預設參與者名單，不沿用任何舊版五組輸入版面。
- 手動新增 UI 的「可編輯者 Google Email」仍保留原有操作；Excel V1 不提供編輯者欄位，也不額外建立 `trip_editor` 授權。使用者如需授權，可於 TRIP 建立後透過 App 既有管理功能處理。
- `createTripRecord` 會依旅程天數建立日期資料、產生 Trip ID、建立空白每日資料／清單／預設資料夾及其他資訊項目。這些系統產生的初始結構與 ID 不由 Excel 控制。
- 權限核對發現目前新增入口的 UI 並非只限 Super Admin：入口依歷史離線唯讀及旅程主資料鎖定狀態檢查後開啟表單；表單的 `canManageEditors` 才是 `adminProfile.role === "super_admin"`。因此，P01 的 Super Admin 限制應套用於新增 Excel 匯入入口及其服務／資料庫寫入驗證，不可宣稱目前整個手動新增 TRIP 已限 Super Admin。
- 日期方面，手動 UI 使用 date 欄位，預設今天；手動表單的旅程天數限制 1–30。Excel 不提供天數欄位，採嚴格 `YYYY-MM-DD`，天數依卡片最大日序 1–30 推導。

**已定案差異（2026-11-03 更新）**：Excel V1 不提供幣別代碼或符號輸入欄；匯入建立 TRIP 時沿用系統當下「新增 TRIP」表單的預設幣別代碼與符號，不固定使用 TWD，也不接受 Excel 覆寫。匯入預覽及最終確認都必須顯示幣別與符號，提醒匯入者依本次旅程目的地確認；匯入者確認後才能提交。手動新增仍保留原本的幣別選擇功能。

## 已確認決策與歷史紀錄（2026-10-19 起；現行規則以 2026-11-03 V1 精簡契約為準）

1. **新增 TRIP 的兩種建立流程（2026-11-03 更新）**：使用者在新增 TRIP 時選擇「Excel 建立」或「手動新增」。兩者是建立同一種 TRIP 資料的不同輸入方式，但輸入欄位不必完全相同：Excel V1 僅要求本文件精簡契約列出的 TRIP 名稱、出發日期及必要卡片欄位；參與者、編輯者與其他設定由系統預設產生。驗證及建立結果仍須符合 App 與資料庫的完整資料模型，不得因 Excel 輸入欄位較少而產生不完整 TRIP。
2. **Excel 建立資料範圍（2026-11-02 定案）**：本功能只採新增 TRIP 的 A 流程；工作簿同時提供 TRIP 基本資料與每日行程卡片，使用者由新增 TRIP 入口直接建立新旅程。先前既有 TRIP 卡片匯入／匯出方案 B 已捨棄，不屬本功能。
3. **旅程天數與卡片建立（2026-11-03 更新）**：Excel 不提供「旅程天數」欄位；系統取所有有效卡片「第幾天」的最大值推導旅程天數（1–30），並依出發日期建立完整日期資料。中間沒有卡片的日序仍保留空白日；工作簿每筆卡片資料均建立為新卡片，卡片 ID 由系統產生。
4. **系統管理欄位排除**：不從 Excel 匯入 Place ID、座標、天氣、照片／Storage 路徑、路線估算、移動方式或其他系統管理欄位。天氣預設不勾選，完全不列入 V1 匯入欄位或匯入觸發流程。
5. **地點欄位排除（2026-11-03 更新）**：單一「新增 TRIP」工作表中的卡片資料區完全不提供地點名稱、完整地址、`location` 或 `location_address` 欄位；不匯入地點文字，也不在匯入流程進行地圖搜尋、候選確認、Place ID／座標設定或地點確認摘要。卡片建立後如需設定地圖地點，由使用者在 App 內自行編輯卡片並使用既有地點搜尋／確認功能。此決策只限制 Excel 欄位與匯入流程，不刪除 App 既有地圖功能。
6. **新增 TRIP 匯入建立與雲端保護（2026-11-03 更新）**：Excel 採本文最新精簡欄位契約；系統預設資料須補齊 App 完整 TRIP 模型。不得以既有 TRIP 的單日／零卡片資格限制新增匯入。只有雲端整批建立成功後才更新本機權威快取／UI；離線或無法確認雲端建立結果時停止並核對，不得本機單獨建立或誤報成功。
7. **復原策略（使用者選擇 D／自訂）**：遵守不過度開發原則，V1 不新增每次匯入的持久化快照子系統，也不承諾匯入成功後可一鍵還原上一版。V1 重點是匯入失敗時不破壞舊資料；若日後明確需要成功後復原，再另行評估最小單筆 Trip 備份。
8. **離開時間（使用者選擇 B）**：`arrival_time` 必填；`departure_time` 可空白，空白時系統以抵達時間作為離開時間，不阻止匯入。
9. **實作邊界**：現有一般儲存入口可能在雲端同步失敗時仍更新本機 UI 或排程照片清理，因此不能未經調整就直接作為嚴格匯入入口；須設計具雲端成功閘門的專用整批流程。以上為規格決策，尚未授權開始程式實作或資料庫變更。
10. **舊地點確認摘要流程（2026-10-19，已於 2026-11-02 完全廢止）**：本項只保留歷史決策背景，不屬於 V1 現行規格，不得實作或納入驗收。其逐張地點選擇、地圖候選、不帶入地點選項、地點確認摘要及三個操作按鈕，均因最新定案「Excel 不提供任何地點欄位」而全部取消。
11. **舊地點欄位允許空白規則（2026-10-19，已於 2026-11-02 完全廢止）**：本項只保留歷史決策背景，不屬於 V1 現行規格。Excel 已不提供 `location`／`location_address`，因此不再有地點欄位空白、地點搜尋初始文字或跳過地點確認等匯入情境。
12. **舊匯入地圖搜尋次數規則（2026-10-19，已於 2026-11-02 完全廢止）**：本項只保留歷史決策背景，不屬於 V1 現行規格。新增 TRIP Excel 建立流程不呼叫地圖搜尋，因此不適用匯入搜尋次數、關鍵字重搜或候選查詢限制；App 卡片後續手動設定地點時，仍沿用 App 原有地圖搜尋規則。
13. **舊 `location_address` 搜尋輔助規則（2026-10-19，已於 2026-11-02 完全廢止）**：本項只保留歷史決策背景，不屬於 V1 現行規格。Excel 不提供 `location_address`，也不提供任何地點文字；不得由匯入流程組合地址、預填搜尋字詞或啟動地圖候選確認。使用者若需要地圖地點，於建立後在 App 內手動編輯設定。
14. **P01：新增 TRIP Excel 建立的權限邊界（2026-11-03 技術核對與安全流程定案）**：只有 Super Admin 可以使用新增 TRIP Excel 建立功能；目前通用 `trips` INSERT RLS 允許 Super Admin 或該 TRIP 的 `trip_editor`，因此不能滿足 Excel 專用限制。Excel 必須走專用安全 RPC。產品採三層保護：UI 限制入口、確認提交時自動檢查當下 Supabase Session／登入帳號／線上狀態（不再次啟動 Google OAuth）、RPC 依目前 JWT／`auth.uid()` 及 `private.tc_is_super_admin()` 重新核對資料庫權威角色。前端 Session 或角色快取不得取代 RPC 最終授權；既有通用 INSERT RLS 及手動新增權限保持不變。
15. **P02：Excel 可控制欄位與系統欄位界線（2026-11-03 更新，取代舊版「可修改欄位原則上全部納入」）**：凡由系統背景產生、系統自動計算，或受資料庫／安全政策保護的資料，不得由 Excel 指定或覆寫，例如 TRIP ID、卡片 ID、建立／更新時間及系統識別資料。Excel V1 可輸入欄位僅限本文件最新契約列出的 TRIP 名稱、出發日期及卡片資料；參與者、編輯者、公開、農曆、旅程型態、幣別及其他設定均不由 Excel 控制，依系統預設或確認流程產生。
16. **P03：Excel 欄位標題及備註原則（2026-11-03 更新）**：工作表可見欄位標題使用固定繁體中文，僅採最新 V1 欄位契約列出的兩個 TRIP 欄位及六個卡片欄位；範本的時間格式、必要／選填、類別下拉選項與範例依該契約呈現，不增加未定案欄位或開放式輸入方式。
17. **P04-01：標準範本與嚴格驗證（2026-11-03 更新）**：系統提供固定格式 Excel 範本，隱藏 metadata 管理範本版本，使用者不得任意修改版本識別。匯入時驗證工作表結構、欄位標題、資料型別及允許值；選填欄位僅依契約允許空白，任何非空白但不符合格式／允許值的資料一律拒絕整份匯入，不猜測、不自動轉換、不靜默忽略。
18. **P04-02：記帳參與者沿用系統預設（2026-11-03 更新）**：Excel 不提供參與者欄位；建立時直接載入資料庫 `admin_profiles` 與 `admin_users` 的即時權威預設參與者名單，不在範本硬編碼姓名或 Email。手動新增表單原有參與者管理功能不變。
19. **P04-03：可編輯者（2026-11-03 更新）**：Excel 不提供可編輯者 Email 欄位；V1 不額外指派任何 `trip_editor`。需要授權時，使用者於 TRIP 建立後透過 App 既有管理功能處理。
20. **P04-04：幣別與符號（2026-11-03 更新）**：Excel 不提供幣別代碼或符號欄位。建立時沿用目前新增 TRIP 表單當下的預設代碼與符號，不固定指定 TWD，也不由 DB 預設值取代此產品決策。預覽及最終確認均顯示實際將採用的幣別代碼與符號，要求依本次旅程目的地明確確認；預覽後設定若改變，更新預覽並要求再次確認。手動新增表單原有幣別選擇功能不變。
21. **P05-01：正式範本保存方式（2026-11-02 同意）**：先完成欄位契約與範本內容定義，再產生一份正式 `.xlsx` 範本，固定保存於專案資料夾，供日後提取、修改及作為匯入格式依據。不建立多份互不相容的範本。建議位置為 `docs/templates/AI新增TRIP標準範本_V1.xlsx`，配套欄位契約文件為 `docs/templates/AI新增TRIP標準範本_V1_欄位契約.md`；檔案應在 P05 欄位契約完成後建立，目前尚未建立。

## 1. 目標與範圍

讓使用者在新增 TRIP 時，選擇以手動新增或 Excel 建立旅程。Excel 使用本文最新精簡欄位契約，不要求與手動表單提供完全相同的輸入欄位；系統以權威預設補齊必要資料，確保建立結果符合 App 完整 TRIP 資料模型。

- 正式匯入格式：Excel .xlsx。
- Markdown 可用於需求整理及人工審閱，但不是 V1 正式匯入格式。
- 新增 TRIP 的 Excel 匯入是旅程建立流程之一；不要求先建立既有或空白 Trip。Excel 欄位必填／選填依本文最新精簡契約，不要求與手動新增表單相同；系統以權威預設補齊完整 TRIP 資料模型。不得將「既有 TRIP 匯入／覆蓋」的資格限制套用到新增流程。
- 跟團／自駕是目標旅程既有的旅程性質，不是每日卡片類別，也不需要匯入。
- 共用一份範本，不為跟團與自駕製作兩份不相容的範本。
- 不匯入移動方式、路線距離／時間、Google Place ID、座標、天氣資料、照片、卡片 ID 或其他系統計算欄位。
- 自駕／跟團專屬資訊及額外備註不納入匯入；本功能只處理每日行程卡片所需資料。

## 2. Excel 範本

工作簿只有一張可見工作表「新增 TRIP」：

- 上方為 TRIP 基本資料區，僅包含「TRIP 名稱」「出發日期」兩個必填欄位。
- 下方為每日行程卡片資料表，每列代表一張新卡片，欄位為「第幾天」「開始時間」「結束時間」「行程名稱」「類別」「描述」。其中第幾天、開始時間、行程名稱及類別必填；結束時間、描述選填。
- 「類別」使用 Excel 資料驗證下拉選單，固定選項為「交通、住宿、景點、餐飲、自駕、其他」；匯入端仍須重新驗證。
- 不提供任何地點名稱或地址欄位。每日卡片總數與每日分布由系統依資料列計算，不接受 AI 提供的摘要數字。
- `template_version=1` 存於工作簿隱藏的系統 metadata，不建立第二張使用說明工作表。

使用者在新增 TRIP 時選擇 Excel 建立，系統依同一份工作簿中的 TRIP 基本資料及行程卡片一次建立新旅程。Excel 不攜帶可覆寫系統識別資料；TRIP ID、卡片 ID、日期資料及其他初始結構由系統建立。此流程不以既有 TRIP 作為匯入目標，也不執行既有卡片覆蓋／合併。

不得以合併儲存格、空白分隔列、顏色或額外小標題承載資料。欄位標題固定，不允許 AI 任意改名或新增欄位。

## 3. V1 標準欄位

| 標準欄位 | 中文名稱 | 必填 | 規則 |
|---|---|---:|---|
| day_number | 第幾天 | 是 | 正整數 1–30；所有有效卡片的最大日序推導 TRIP 天數 |
| arrival_time | 抵達／開始時間 | 是 | 必填；只接受 24 小時制 HHMM 四位數字，例如 0930、1845；不接受冒號或三位數簡寫 |
| departure_time | 離開／結束時間 | 否 | 可空白；空白時系統以抵達／開始時間作為離開／結束時間 |
| title | 行程名稱 | 是 | 卡片顯示名稱；去除前後空白後不得為空 |
| category | 行程卡片類別 | 是 | 僅接受「交通、住宿、景點、餐飲、自駕、其他」；匯入時仍須重新驗證 |
| description | 行程描述 | 否 | 卡片內容說明；可空白 |

### 現有卡片類別

依目前 src/components/ItineraryPage.tsx 的 ITINERARY_TYPE_OPTIONS，已核對的類別為：

- 交通
- 住宿
- 景點
- 餐飲
- 自駕
- 其他

範本正式版應以程式中的選項清單作為允許值來源，避免文件與程式日後不一致。Excel 可顯示使用者看得懂的中文名稱；匯入端須以明確對照映射到程式內部值，不得讓 AI 自創類別。

## 4. 時間與日期規則

- `day_number` 表示新 TRIP 中的第幾天，必須是 1–30 的正整數；系統取所有有效卡片的最大 `day_number` 推導 TRIP 天數。中間缺少卡片的日序仍保留為空白日。
- TRIP 出發日期由「TRIP 基本資料」提供；實際卡片日期由系統依出發日期及 `day_number` 建立，不要求 Excel 每張卡片另填實際日期或星期。
- `arrival_time` 必填，只接受四位數字 `HHMM`，例如 `0930`、`1845`；不接受 `9:30`、`930`、`24:00` 等格式。此為 Excel V1 契約，不改變 App 現有手動編輯欄位的時間輸入行為。
- `departure_time` 可空白；空白時系統以抵達／開始時間補入，與目前卡片儲存行為一致。非空白時採相同 `HHMM` 格式與有效時間檢查。
- 第一版不另外定義跨午夜時間區間的匯入支援；遇到跨午夜行程時，須在匯入前調整資料。

## 5. 地點、交通與系統欄位

- 「行程名稱」對應卡片 `title`，是每日行程卡片的顯示名稱，也是 Excel 必填欄位；去除前後空白後不得為空。
- Excel V1 完全不提供地點名稱、完整地址、`location` 或 `location_address` 欄位；匯入不寫入地點文字，也不執行地點搜尋或確認。
- 卡片建立後，如需地圖地點，使用者可在 App 內編輯卡片，透過現有地圖搜尋／確認功能自行設定。此限制僅適用 Excel 匯入，不改變 App 既有 `location`、Place ID、地圖、天氣及路線功能。
- V1 不匯入移動方式、交通估算、路線距離／時間或路線快取；匯入不得觸發自動路線估算。
- 卡片 ID 由系統產生；類別顏色沿用現有類別設定，不由 Excel 指定。
- 不匯入 Place ID、座標、天氣快取、照片或 Storage 路徑等系統管理欄位。天氣不列入 Excel 欄位，也不得因匯入而觸發天氣更新。

## 6. 匯入流程

1. 使用者在「新增 TRIP」流程中選擇「Excel 建立」或「手動新增」。選擇 Excel 時直接建立新 TRIP，不先建立空白 TRIP，也不從既有 TRIP 功能選單啟動。Excel 欄位採本文精簡契約，系統以權威預設補齊其他必要資料，建立結果須符合 App 完整資料模型。**此流程僅在網路連線可用且雲端服務可正常連線時開放；離線狀態直接禁止開始。**
2. 開始匯入前先檢查網路狀態，再以實際雲端請求確認服務可達，並確認使用者具備新增 TRIP 的權限。`navigator.onLine` 只能作為初步訊號，不可單獨視為雲端可用證明。若離線、雲端請求失敗、逾時或無法確認，停止匯入，不進入會修改資料的流程，也不得改成本機暫存建立。
3. 使用者上傳 `.xlsx`。系統檢查單一工作表名稱及隱藏範本版本 metadata、固定 TRIP／卡片區欄位、推導天數、欄位值與時間格式；任何驗證失敗均不得建立 TRIP 或寫入部分卡片，並指出工作表、列號及欄位。
4. 驗證成功後顯示建立預覽，至少包含 TRIP 名稱、出發日期、依最大卡片日序推導的結束日期與旅程天數、系統目前預設幣別代碼與符號、明確的幣別確認提醒、系統預設參與者摘要（不提供自訂參與者欄位）、編輯者未額外指派提示，以及每日卡片總數與每日分布；列出所有錯誤與警告。幣別確認應由匯入者明確勾選或以等效明確動作完成，未確認不得進入提交。此預覽不包含地點確認摘要、Google 地圖候選或地點確認操作。
5. 使用者按下「確認建立」後，先重新讀取／取得目前新增 TRIP 流程的系統預設幣別代碼與符號；若與預覽顯示值不同，更新預覽、清除舊的確認狀態並要求匯入者再次確認，不可直接提交。幣別確認有效後，第二層自動檢查當下 Supabase Session／登入帳號／線上狀態；必要時依 Supabase Auth 正常更新 Session，若無有效 Session、更新失敗或帳號不符則停止，不啟動第二次 Google OAuth。接著呼叫 Excel 專用 RPC，由 RPC 依目前請求 JWT、`auth.uid()` 及 `private.tc_is_super_admin()` 再核對權限。只有通過後才提交 TRIP 主資料及每日卡片。TRIP ID、卡片 ID、日期資料及其他系統初始結構由系統產生。若建立提交失敗或結果不明，依雲端建立結果核對流程處理；不得本機單獨建立或誤報成功。
6. 只有整批雲端建立成功後才回報成功，並以雲端回傳的權威資料更新本機快取／UI。失敗時不得留下部分建立的 TRIP 或卡片；若底層儲存無法保證整批完整性，實作前必須補足原子性或安全補償設計。

## 7. 匯入初始化、錯誤處理與安全邊界

- **新增 TRIP 匯入建立**：從新增 TRIP 流程選擇 Excel 建立，依本文最新精簡欄位契約提供資料；系統以權威預設補齊 App 完整 TRIP 模型。不得要求先建立已儲存、單日、零卡片的空白 TRIP，也不得要求 Excel 欄位與手動表單完全相同。若規格其他段落仍出現舊方案 B 的資格限制，均屬已廢止內容。
- **新增 TRIP 建立不做既有卡片覆蓋／合併**：目標 TRIP 尚未建立，因此匯入流程只建立新旅程及其每日卡片；不執行既有 TRIP 每日卡片的逐張比對、合併或刪除。
- **必要資料錯誤**：例如缺少 TRIP 名稱或出發日期、沒有任何有效卡片、卡片缺少第幾天／行程名稱／類別／開始時間、日序不是 1–30 正整數、時間格式錯誤或類別不支援，均阻止整份建立並指出工作表、列號與欄位。旅程天數由最大卡片日序推導，不是 Excel 必填欄位。
- **地點欄位排除**：Excel V1 不提供地點名稱、完整地址、`location` 或 `location_address` 欄位，也不匯入地點文字。匯入過程不搜尋／確認地點、不設定 Place ID 或座標；如需設定地圖地點，使用者於建立完成後在 App 卡片編輯功能自行設定。
- **空白離開時間**：以抵達／開始時間補入。
- **雲端連線與完整性保護**：建立流程只允許在線使用。預檢時以實際雲端請求確認服務可達及操作者有權限；提交前再次確認連線與 Super Admin 身分。只有雲端整批建立成功後才更新本機權威快取／UI。預檢失敗、逾時或建立結果不明時停止或核對雲端，不允許本機暫存／離線建立，不得誤報成功。
- **復原範圍（V1）**：不新增每次匯入的持久化快照子系統，也不承諾匯入成功後一鍵還原；重點是匯入失敗時不得留下部分 TRIP 或卡片。

## 8. 技術建立契約（2026-11-03 已同意；實作前仍須細化驗收）

本節記錄新增 TRIP Excel 建立的技術邊界。此為已同意的架構方向，不代表已建立 RPC、migration 或已授權程式實作。

### 8.1 RPC 交易內的建議寫入順序

1. 先驗證 `auth.uid()` 存在且 `private.tc_is_super_admin()` 為 true，再驗證所有參數、欄位白名單、`p_title = btrim(p_title)`、日期、Trip ID 格式及 JSON 型別。此檢查必須先於任何既有 request 結果查詢，避免已被撤銷 Super Admin 權限的帳號透過重送讀取 Trip 資料。
2. 由資料庫根據已驗證的 canonical payload 計算 fingerprint；fingerprint 涵蓋 `p_trip_id`、trim 後 title、departure date、完整允許的 Trip payload，以及 RPC 將寫入的特殊 Other Info 欄位。不得信任呼叫端傳入 fingerprint。
3. 以 `p_request_id` 對專用 request registry 執行 `INSERT ... ON CONFLICT DO NOTHING`，作為該提交的唯一併發仲裁；成功取得新 row 的呼叫者才擁有建立權。若發生 request_id 衝突，必須在另一個 SQL statement 讀取既有 row（取得 READ COMMITTED 新 snapshot），比較 fingerprint：相同則依保存的 trip_id 回傳既有結果，不重新 INSERT；不同則回傳 `REQUEST_ID_CONFLICT`。同一 request 的併發若前一 transaction rollback，等待中的呼叫可取得 request_id 並繼續；前一 transaction commit 則後續呼叫讀取已完成資料。registry、Trip、特殊 Other Info 必須在同一 transaction，絕不可先獨立提交 pending request row。
4. 檢查 request 所指定的 `p_trip_id` 是否已存在或 tombstoned；若衝突，以穩定 `TRIP_ID_CONFLICT` 結束，不更換 ID 盲目重送。正式 DB tombstone trigger 使用自訂 SQLSTATE `23505` 並指定 constraint name `trips_tombstoned_id_key`，應依 constraint name 識別，不能把所有 `23505` 一概視為主鍵衝突。
5. INSERT `public.trips` 主資料及完整 `content`：系統預設 Sidebar、備忘錄、空 checklist、預設 folders、日期陣列／空白日、`daysData` 卡片、mode、農曆設定、currency config 等；`created_by` 必須由 `auth.uid()` 指定。participant email map 由既有 `trips_guard_visibility_and_email_map` trigger 根據已驗證的 Super Admin 身分處理；不要另行寫入 private mapping，也不得由呼叫端指定公開權限或管理者欄位。
6. TRIP 名稱與出發日期不參與唯一性判斷；不同 `p_trip_id`／不同建立 request 即使 `title` 與 `departure_date` 完全相同，也必須允許 INSERT。僅依 `trips_pkey(id)` 與既有 tombstone trigger 保護 Trip ID 唯一及已刪除 ID 不重用；不建立 title/date expression unique index、trigger、advisory lock 或名稱日期預檢。
7. INSERT 該 TRIP 的一筆特殊 `other_info_items` 初始資料；沿用 `createSpecialInfoItem` 的預設 guided 標題、內容、folder ID、排序與 TRIP 專屬 client item ID。資料表欄位包括 `trip_id`、`client_item_id`、`folder_id`、`title`、`content`、`allowed_roles`、`sort_order`，`id`、`created_by` 與時間使用資料庫預設／`auth.uid()`。不得使用 upsert 靜默覆蓋。由於正式 DB `other_info_items` 的 RLS owner/bypass 行為，SECURITY DEFINER RPC 必須在 SQL 內明確驗證本次 `trip_id`、`client_item_id` 與其他欄位白名單，只能新增該 RPC 剛建立的 Trip 特殊資訊，不可接受任意目標 Trip。
8. registry INSERT、Trip INSERT、participant mapping trigger 與 special Other Info INSERT 任一失敗即讓整筆交易 rollback；所有成功資料一起 commit。`app_data_revision`／Realtime revision 通知只由既有 AFTER INSERT trigger 維護，RPC／前端不得重複更新 revision。成功時回傳 `CREATED` 及雲端權威 Trip／special item 欄位；相同 request 重送回傳 `ALREADY_CREATED`。

`app_data_revision` 及 Realtime revision 通知由既有 AFTER INSERT trigger 維護；不得在 RPC 或前端另外增加第二次 revision 更新。Revision 通知實際在交易提交前後的可觀察時點，列入本機 Supabase 整批成功／rollback 測試。

### 8.2 專用安全入口與資料庫交易

- Excel 建立使用獨立 Supabase RPC（下稱 `tc_create_trip_from_excel` 為暫定名稱）；不得沿用一般 `trips` 直接 INSERT 作為 Excel 最終寫入入口。
- RPC 必須要求 `auth.uid()` 存在，並以 `private.tc_is_super_admin()` 驗證目前登入者。已查證正式 DB 中 `private.tc_is_super_admin()` 為 `SECURITY DEFINER`，owner 為 postgres、固定 `search_path = ''`；participant-map trigger function 同樣由 postgres 擁有且只授權 postgres 執行。RPC 不得信任前端傳入的角色、Email 或管理者旗標。
- RPC 採 `SECURITY DEFINER` 時，沿用專案資料庫安全標準：固定 `search_path = ''`、所有物件明確 schema-qualified、撤銷 `PUBLIC`／`anon` 執行權限，只授權 `authenticated` 執行；另明確 `REVOKE ALL` from `PUBLIC, anon, service_role`，再僅 grant `EXECUTE` to `authenticated`。不得暴露私有 helper。RPC owner 必須為受信任的 postgres／migration owner，且所有管理資料表操作均明確使用 schema。
- 正式 DB `trips` 與 `other_info_items` 均由 postgres 擁有，RLS enabled 但 `FORCE ROW LEVEL SECURITY=false`；postgres owner 執行的 SECURITY DEFINER 會繞過一般 RLS。因此 RPC 不能把 RLS 當成欄位／目標 Trip 的最後安全檢查，必須自行驗證所有輸入白名單、Super Admin、建立者、Trip ID、request ID、重複鍵及特殊 Other Info 只能屬於本次建立的 Trip。不得接受任意 row JSON 後直接 INSERT。
- 不修改既有 `trips` 通用 INSERT RLS，不收緊手動新增及其他既有 Trip 建立路徑。Excel 流程採三層保護：入口只對 Super Admin 顯示；確認提交時自動檢查當下 Supabase Session／登入帳號／線上狀態，不再次啟動 Google OAuth；資料庫 RPC 依目前 JWT 與權威 `super_admin` 角色最終授權。
- 建立前端仍可先做線上／服務可用性預檢，但 `navigator.onLine` 不能作為雲端可用證明。RPC 提交時重新驗證登入者權限。

### 8.3 TRIP ID 唯一性與名稱／日期欄位

- 資料庫 `trips.title` 保存原始名稱；既有 UI 顯示名稱由 `title` 與 `departure_date` 組合為 `title (YYYY-MM-DD)`，不新增正式名稱欄位。
- `title` 與 `departure_date` 是使用者辨識、顯示及搜尋資訊，不是唯一鍵。即使兩筆 TRIP 的名稱及出發日期完全相同，也允許分別建立與保存；不做 trim 後的重複拒絕、不合併、不覆蓋。
- 不建立 `UNIQUE (btrim(title), departure_date)` expression unique index，不建立名稱／日期 trigger，不使用 advisory lock、前端預查或 RPC 檢查來限制同名同日期建立。名稱或日期日後被編輯成與其他 TRIP 相同，也允許保存。
- TRIP ID 仍由應用程式依現行 `trip-<UUID>` 規則產生並隨 RPC 傳入；資料庫 `trips_pkey(id)` 負責唯一性，既有 `trip_deletion_tombstones` trigger 負責已刪除 ID 不重用。僅 ID 已存在或已 tombstoned 才回傳 `TRIP_ID_CONFLICT`，不可將名稱／日期相同視為 ID 衝突。
- ID 碰撞重試與 request 冪等性仍須保留。若重新產生 ID，只能發生在確認該 ID 本身衝突且尚未提交的情況；同一 request 的逾時重送必須沿用原 request ID 與 Trip ID。不同 request ID 即使名稱／日期完全相同，仍是不同建立意圖，必須允許建立另一筆 TRIP。

### 8.4 RPC 輸入契約（建議欄位；實作前需與 SQL／TypeScript 型別對齊）

> RPC 需由系統信任的服務層組裝輸入，不接受 Excel 原始任意 JSON row。正式 DB 的 participant mapping trigger 會從 `content.participantEmailMap` 取出 mapping 寫入 private table，再從 content 移除；因此 RPC 內必須使用已核准的即時預設參與者名單建立該 mapping，且不得讓 Excel 呼叫端自行注入 participants／email map。Excel 既定產品契約仍是以 `admin_profiles.include_in_new_trip=true` 且 email 同時屬於 `admin_users.role=super_admin` 的交集產生預設參與者；SQL 必須自行從權威資料表計算或驗證該名單，不能只信任 TypeScript 傳入的清單。

| 輸入 | 型別／內容 | 規則 |
|---|---|---|
| `p_trip_id` | text | 前端生成的 `trip-<UUID>`；必填、不可空白；保留既有 tombstone 防護 |
| `p_title` | text | 已 trim 的原始名稱；必填、不可空白 |
| `p_departure_date` | date | `YYYY-MM-DD` 有效日期 |
| `p_trip_payload` | jsonb | 僅包含 RPC 需要寫入的 TRIP 欄位及完整 `content`；禁止接受角色／建立者等安全欄位覆寫 |
| `p_special_info_item` | jsonb | 必要特殊 Other Info 初始項目；由受信任程式建立並由 RPC 驗證 trip ID、mode、folder、欄位型別及內容；不可接受任意 trip_id |
| `p_request_id` | uuid | 每次使用者確認提交前生成一次，重送同一提交時必須沿用；用來核對同一提交是否已成功，不得每次網路重送都換新值 |

RPC 只接受必要欄位白名單；不接受完整任意資料列讓前端覆寫 `created_by`、公開權限或其他受保護欄位。`created_by` 應由 `auth.uid()` 設定；`is_public` 沿用預設 false；參與者名單與 mapping 不得由 Excel 提供。

### 8.5 RPC 回傳契約與穩定錯誤

| 結果／錯誤碼 | 意義 | 前端處理 |
|---|---|---|
| `CREATED` | 本次 request ID 已建立成功 | 取得雲端權威 TRIP 資料及特殊資訊結果，再更新本機快取／UI |
| `TRIP_ID_CONFLICT` | `trips_pkey` 或 `trip_deletion_tombstones` 防護衝突 | 不更換 request ID 盲目重送；查詢該 ID 與 request 狀態，避免誤建第二筆 |
| `REQUEST_ID_CONFLICT` | 同一 request ID 被用於不同 payload | 停止提交並記錄錯誤，不覆蓋既有資料 |
| `NOT_AUTHENTICATED` | RPC 收到的 JWT／登入身分不存在或無效 | 停止提交並提示重新登入；不進行本機建立 |
| `NOT_SUPER_ADMIN` | 目前登入者不是 Super Admin | 拒絕建立，不更新本機 |
| `INVALID_PAYLOAD` | TRIP payload／特殊資訊欄位不符合白名單或型別 | 顯示一般資料驗證錯誤；保留檔案供修正 |
| `REQUEST_ID_CONFLICT` | 同一 request ID 被用於不同 payload | 停止提交並記錄錯誤，不覆蓋既有資料 |
| `INTERNAL_ERROR`／未知錯誤 | 資料庫或服務端不可預期錯誤 | 查核 request ID；不可直接換 ID 再建立 |

RPC 成功回應（建議使用單一 JSON object）至少包含：

| 回傳欄位 | 型別 | 說明 |
|---|---|---|
| `status` | text | 成功固定為 `CREATED` 或 `ALREADY_CREATED`（同一 request 重送） |
| `request_id` | uuid | 原提交識別 |
| `trip_id` | text | 已建立 Trip ID |
| `title` | text | 雲端實際保存的原始名稱 |
| `departure_date` | date | 雲端實際保存的出發日期 |
| `trip` | jsonb | UI 必要的雲端權威 Trip row 欄位；不可包含私有 email mapping |
| `special_info_item` | jsonb | 同一交易已建立的特殊 Other Info 欄位；僅回傳目前登入者可讀取的欄位 |

資料庫錯誤不得依賴原始 SQL 訊息字串作為前端協定。實作時須以明確 SQLSTATE／錯誤碼對應穩定的應用錯誤碼，並確保錯誤細節不洩漏私有資料。

### 8.6 請求重送與逾時核對

- 使用者按下最終「確認建立」前建立一個 request UUID，與 TRIP ID 一起固定在這次待提交資料中；網路層重送、逾時後查詢及使用者重試都沿用相同 request UUID 與 Trip ID。
- 2026-11-03 技術審查建議採最小專用 request registry，不把 request UUID／fingerprint 放入 `trips.content`（一般 Trip 同步會更新整個 content），也不使用公開 metadata。建議資料列僅保存 `request_id uuid primary key`、`trip_id text`、`payload_fingerprint text`、`created_at timestamptz`；成功紀錄與 TRIP／特殊 Other Info 在同一 PostgreSQL transaction commit。RPC 先驗證 auth／Super Admin，再以 `INSERT ... ON CONFLICT DO NOTHING` 競爭取得 request_id；若已存在，待前一交易完成後讀取既有 fingerprint：相同則回傳既有 trip 結果，不同則回傳 `REQUEST_ID_CONFLICT`。新 request 的 registry INSERT、TRIP INSERT、特殊 Other Info INSERT 任一失敗必須整筆 rollback，不能留下 pending 狀態。registry 應只授權專用 RPC owner 存取，撤銷 `PUBLIC`／`anon`／`authenticated` 直接 SELECT／INSERT／UPDATE／DELETE；暫不設自動清除期限，以免舊 request 重送後再次建立，保留政策待 SQL review 核准。fingerprint 必須由資料庫根據已驗證、canonical JSONB 的所有影響結果欄位計算（含 trip_id、title/date、完整建立 payload、特殊資訊初始資料），不得信任前端傳入 fingerprint。**交易協定注意事項：** request registry INSERT 必須先於 `trips` INSERT，並與整個建立流程在同一 transaction；同 request_id 的併發呼叫由 PK／`ON CONFLICT` 序列化，若前一交易 rollback，後一呼叫可繼續建立；若前一交易 commit，後一呼叫讀取已完成的 fingerprint／trip_id。不得先查後插而留下競爭窗口；不得把 `pending` 紀錄獨立提交。由於 transaction 內 `ON CONFLICT DO NOTHING` 在衝突時可能不回傳既有 row，後續需以獨立 SQL statement 再 SELECT，取得新的 READ COMMITTED snapshot。此為技術建議，尚待 SQL review 驗證。
- Request registry 的成功紀錄不應在 TRIP 刪除時自動 cascade 刪除，否則舊 request_id 可能失去冪等證據；建議保留 tombstone 式 request 證據。若舊 request 對應 TRIP 已刪除，重送應回傳明確的 `REQUEST_RESULT_TRIP_DELETED`／結果已刪除狀態，不得重新建立。保留期限及人工清理程序仍待定案，不在 V1 增加自動清理工作。
- RPC 的 request registry 不是一般查詢式狀態表；採同一 transaction 內原子競爭 INSERT。先完成 Super Admin 驗證，再嘗試取得 request_id；衝突分支使用下一個 SQL statement 讀取既有 fingerprint／trip_id。只有取得新 request row 的呼叫才繼續 Trip 建立；同 fingerprint 的已完成 request 回傳 `ALREADY_CREATED`，不同 fingerprint 回傳 `REQUEST_ID_CONFLICT`。registry row 不設 `ON DELETE CASCADE`，須保留刪除後的冪等證據。
- RPC 成功回應應包含 `request_id`、`trip_id`、`title`、`departure_date`、以及前端更新 UI 所需的雲端權威欄位。特殊資訊列已在同一交易成功建立；前端仍可在成功後讀取雲端 Trip／Other Info，確認資料完整再更新本機。
- 若請求逾時／連線中斷：先以同一 request UUID 查詢雲端建立結果；若找到同 fingerprint 的完成結果，視為成功；若查詢失敗、結果仍不可確認或 fingerprint 不符，顯示「建立結果待確認」，保留同一提交識別，不可另產生 Trip ID／request UUID 盲目重建。
- 明確拒絕或交易回滾且可確認未建立時，可回報失敗；連線恢復後由使用者重新確認是否以同一 request ID 重試。
- 不新增持久化快照子系統；不得用前端 localStorage 單獨作為雲端提交成功的證據。

### 8.7 執行順序與本機快取界線

1. 第一層：僅 Super Admin 顯示並可進入 Excel 建立入口；入口離線時阻止操作。
2. 第二層於最終確認提交時執行：檢查當下 Supabase Session／登入憑證／目前帳號及線上狀態；必要時依 Supabase Auth 正常更新 Session。無 Session、更新失敗、帳號不符或無法確認即停止，不啟動第二次 Google OAuth。
3. 讀取當下 `getAdminProfiles()` 權威預設參與者名單及新增表單預設幣別。
4. 解析／驗證整份 Excel，建立預覽及目前系統設定摘要。
5. 使用者明確確認幣別及建立內容；最終提交前重新讀取預設幣別，若有變更則更新預覽並要求重新確認。
6. 產生並固定 Trip ID、request UUID，呼叫唯一 Excel RPC；RPC 以目前請求 JWT、`auth.uid()` 及 `private.tc_is_super_admin()` 執行第三層最終授權。
7. RPC transaction 成功後，以 RPC 回傳／讀取的雲端權威資料更新本機快取、Trip list 及 UI；不呼叫一般 `createTrip()` 後續逐項同步流程。
8. RPC 結果不明時依 8.6 核對；未核實成功前不寫本機權威快取、不切換至新 Trip、不顯示建立成功。

### 8.8 目前已核對的程式／資料庫證據與限制

- `createTripRecord()` 可重用其系統預設資料組裝思路：Trip ID、日期陣列、Sidebar、備忘錄、空 checklist、`otherInfoFolders`、特殊資訊項目及每日卡片資料；不得直接使用一般 `createTripRecordWithCloudSync()` 作為 Excel 的安全提交入口，因其會直接 INSERT `trips`，未具備 Excel 專用 Super Admin／request 冪等／整批 Other Info 保護。TRIP 名稱與日期不作唯一判定。
- 現有 `public.trips` INSERT RLS 允許 `tc_is_super_admin()` 或 `tc_is_trip_editor(id)`；不得將此通用政策宣稱為 Excel-only Super Admin 安全保護。
- 現有 `tc_is_super_admin()` 以目前 JWT email 對照 `admin_users.role=super_admin`；現有 `tc_delete_trip()` 展示了登入身分、私有 helper、`SECURITY DEFINER`、固定 search_path 的安全 RPC 模式。
- 歷史正式 DB 唯讀查詢（2026-11-03）：當時查得 6 筆 TRIP、0 筆 trim 後 `title + departure_date` 重複，且沒有該組合唯一索引。此為當時的結構觀察，不構成建立名稱日期唯一索引的理由；依 2026-11-03 最新產品決策，未來亦不建立此唯一索引。
- 現有 Trip UI 顯示名稱為 `${title} (${departureDate})`；title 欄位本身保留原始名稱，無獨立正式名稱欄位。
- 現有 `createTrip()` 會在 Trip insert 後另外同步 editor emails 與 `other_info_items`；Excel V1 不指派 editor，但必要特殊資訊項目必須併入同一 RPC 交易。
- 2026-11-03 透過 Supabase 唯讀查詢正式專案 `omnnmpcbcicpltkkobae`，確認 `trips_guard_visibility_and_email_map` 與 `trips_purge_participant_emails` 實際存在；`private.trip_participant_email_maps` 亦存在，現有 6 筆 TRIP 對應 6 筆 private mapping，`trips.content` 沒有殘留 participantEmailMap。雖然 repository migration header 仍標示該 migration NOT APPLIED to production，正式 DB 實際狀態已由 catalog／資料統計查詢確認；後續以正式 DB 現況為準，Excel RPC 不得重複自行寫入 mapping。
- 既有 tombstone trigger 會拒絕已永久刪除的 Trip ID；Excel RPC 不得繞過。

### 8.9 仍需技術驗證（不重新開放產品決策）

- **TRIP ID 唯一性**：確認 `trips_pkey(id)`、`trip-<UUID>` 產生器與 tombstone trigger 的行為；人工注入相同 ID 時應拒絕，ID 不同時即使 title／departure_date 完全相同也應允許建立。不得增加名稱日期唯一索引或去重邏輯。
- **Request registry**：確認 request UUID PK 唯一性、fingerprint canonicalization、RLS／trigger 可見性、直接權限撤銷、與 Trip／Other Info 同交易 rollback、無 ON DELETE CASCADE，以及舊 request 對應 TRIP 已刪除時仍回傳 `REQUEST_RESULT_TRIP_DELETED` 而不重建。保留期限與人工清理程序須在 SQL review 定案；不得增加通用匯入紀錄系統。
- **RPC 權威結果回傳**：確認 `CREATED`／`ALREADY_CREATED` 均回傳同一份可供前端使用的雲端權威 Trip row 與 special Other Info 欄位；不可回傳 `participantEmailMap` 私有內容。若同 request 的 trip 已 tombstoned，回傳 `REQUEST_RESULT_TRIP_DELETED`，不可重新建立。正式 DB participant mapping trigger 已由 catalog 唯讀查詢確認存在；實際 insert transaction 行為仍待本機驗證。
- **特殊 Other Info 資料庫契約**：正式 DB 已確認 `other_info_items` 的 INSERT RLS 要求 authenticated 且 `tc_can_edit_other_info(trip_id)`，唯一索引 `other_info_items_one_client_item_per_trip` 存在。正式 DB 亦確認 `other_info_items` 與 `trips` 均由 `postgres` 擁有、RLS enabled 但 `FORCE ROW LEVEL SECURITY=false`；因此以 postgres owner 執行的 SECURITY DEFINER RPC 不可假設 INSERT RLS 自動替函式呼叫者執行完整授權判斷。RPC 必須自行驗證 Super Admin、目標 trip_id 等欄位白名單，並只建立本次 Trip 專屬的 deterministic special item；`created_by` 明確使用 `auth.uid()`，唯一衝突必須使整筆交易 rollback。仍待本機 Supabase／SQL review 驗證函式擁有者、欄位預設與完整 rollback 行為。
- **整批建立失敗**：確認 PostgreSQL transaction rollback 涵蓋 Trip、特殊 Other Info 與 participant mapping。
- **名稱／日期非唯一鍵驗證**：確認資料庫不含名稱／日期唯一索引或 trigger；相同 `title + departure_date`、不同 UUID/request 的建立應成功，後續修改成相同名稱與日期亦可保存。此項是允許重複的相容性驗證，不是新增去重保護。

## 9. 明確不在 V1 範圍內

- 新 TRIP Excel 建立不匯入系統產生的 TRIP ID、卡片 ID、建立／更新時間、Place ID、座標、天氣快取、照片／Storage 路徑、路線估算結果或其他系統管理欄位。
- 不匯入移動方式、交通估算、路線距離與時間；匯入過程不呼叫地圖搜尋或地點候選確認。
- 照片與其他資訊模組不透過本次 Excel 建立流程匯入。
- 依卡片內容自動比對重複項目並個別保留／略過。
- 不修改既有通用 `trips` INSERT RLS，不擴建通用同步／快照子系統；Excel 專用安全 RPC 及其最小必要 migration 屬 V1 必要實作範圍。

## 10. 範本版本相容性與提交結果

- V1 僅有一張可見「新增 TRIP」工作表；固定 `template_version=1` 存放於工作簿隱藏的系統 metadata，不建立「使用說明」工作表。匯入端只接受明確支援的版本；metadata 缺少、空白、格式錯誤或不支援時拒絕匯入，不以欄位猜測版本，也不自動改寫使用者檔案。
- 匯入端仍須驗證工作表名稱、固定欄位標題、必要欄位與資料格式；即使 `template_version=1`，若必要欄位缺少、標題重複／改名或工作表結構不符，也要拒絕匯入並指出位置。
- 雲端提交若明確失敗且確認沒有提交，保持原有雲端資料且不清理照片。若請求逾時或連線中斷，無法判斷雲端是否已提交，須重新讀取雲端核對；若仍無法確認，顯示「建立結果待確認」，不可宣稱成功或失敗，也不得清理其他既有照片資產。此處不新增持久化快照或匯入交易子系統。
- 雲端建立成功後，立即以雲端回傳的權威資料更新本機快取與 UI；其他設備沿用既有 Trip workspace reconciliation 取得最新資料。目前查證到的 Trip 主資料刷新觸發點是啟動／重新協調、網路恢復、視窗 focus 與頁面回到 visible；目前未找到 `trips` 主資料表的 Realtime 訂閱，因此不能承諾其他設備在仍停留於前景時立即收到事件。**已選方案 A（2026-10-19）：V1 沿用既有刷新機制，不增加 `trips` Realtime 訂閱，也不另建同步子系統。** 其他設備若一直停留在前景，可能不會立即刷新；此為 V1 接受的同步時效限制，不列為本次阻擋項。成功訊息只在確認雲端資料已建立後顯示。

## 11. 最小驗收矩陣（V1）

| 情境 | 預期結果 |
|---|---|
| 有效 V1 範本、資料完整 | 顯示差異預覽及系統當下預設幣別／符號；提醒匯入者依本次旅程目的地明確確認幣別；最終提交前再次核對設定，必要時要求重新確認；確認後整批雲端提交成功才更新 UI |
| 缺少 `template_version`、空白或未知版本 | 拒絕匯入，資料完全不變，指出範本版本錯誤 |
| 欄位標題缺少、改名、重複或工作表結構錯誤 | 拒絕匯入，指出工作表／欄位位置，不修改資料 |
| 新增 TRIP 時選擇 Excel 建立 | 依最新精簡 Excel 欄位契約驗證；系統預設補齊 App 必要資料；不要求先建立空白 TRIP |
| Excel 輸入欄位少於手動新增表單 | 這是 V1 刻意採用的精簡輸入方式；只要最新 Excel 欄位通過驗證，系統預設資料補齊後仍須建立完整有效 TRIP，不得誤要求補填已決定由系統預設的欄位 |
| 進入匯入入口時離線或雲端不可達 | 不開放匯入流程，提示連線問題，不讀取 Excel、不建立 Trip、不寫本機、不更新 UI |
| 匯入預覽中的系統預設幣別 | 顯示目前新增 TRIP 表單使用的幣別代碼與符號，提醒匯入者依本次旅程目的地確認；未明確確認不得提交 |
| 預覽期間系統預設幣別變更 | 最終確認前重新取得目前系統預設幣別；若與預覽不同，更新幣別與符號、清除先前確認狀態，要求匯入者重新確認後才可提交 |
| 上傳／預覽期間網路中斷 | 停止後續匯入操作；最終確認前再次預檢，連線未恢復且雲端讀取不可用時不得提交 |
| 最終確認時離線或雲端服務不可達／無法確認建立可用性 | 停止建立，不寫本機、不更新 UI、不清理照片；恢復連線後須重新確認服務可達與 Super Admin 權限，再由使用者重新確認是否提交 |
| 雲端明確拒絕提交 | 保留原資料、不更新 UI、不清理照片，回報失敗 |
| 提交逾時且結果不明 | 重新讀取雲端核對；仍不明則顯示「結果待確認」，不宣稱成功或失敗 |
| 匯入成功 | 確認雲端提交後更新本機 UI／快取；其他設備沿用啟動、重新協調、網路恢復、focus／visible 刷新，前景即時推送目前未保證；不新增同步子系統 |
| 最大卡片日序大於 1 | 依卡片最大「第幾天」推導天數並建立完整日期資料；中間沒有卡片的日子仍保留為空白日 |
| 匯入不提供地點欄位 | 工作簿沒有地點名稱、地址、`location` 或 `location_address` 欄；匯入不做地圖搜尋／候選確認、不設定 Place ID／座標、不觸發天氣或路線；卡片建立後由使用者在 App 內自行設定地圖地點 |
| 天氣欄位未勾選／V1 匯入 | 不匯入天氣資料，不因匯入觸發天氣更新 |
| 匯入預覽中的系統預設幣別 | 顯示目前新增 TRIP 表單使用的幣別代碼與符號，提醒匯入者依本次旅程目的地確認；未明確確認不得提交 |
| 預覽期間系統預設幣別變更 | 最終確認前重新取得目前系統預設幣別；若與預覽不同，更新幣別與符號、清除先前確認狀態，要求匯入者重新確認後才可提交 |

## 12. V3.11.0 審查與定案工作流程

> 本節是 V3.11.0 新增 TRIP Excel 建立功能的唯一逐項審查與定案工作清單。後續討論、產品決策、技術核對、測試及實作均沿用本節，不另行建立平行流程或重複規劃。
>
> **執行原則：先確認前置定義，再確認後續設計；前一階段未定案或未通過，不得把依賴它的後續項目標記為可執行／通過。** 可以預先整理測試案例，但不得以尚未定案的規格作為測試通過依據。
>
> 本流程目前是規劃與審查階段，不代表已授權開始程式實作、正式資料庫變更或發布。逐項定案完成後，再由 Product Owner 明確決定進入實作。

### 12.1 階段與依賴關係

| 階段 | 工作內容 | 進入條件 | 完成條件／交付物 | 未完成時禁止進行 |
|---|---|---|---|---|
| 0. 產品契約定案 | Excel 範本版本、單一工作表及區塊配置、欄位名稱、型別、必填／選填、下拉允許值、欄位語意與匯入範圍 | 依 2026-11-03 已定案精簡契約整理，不重新開放產品決策 | 形成唯一完整的單工作表 V1 欄位契約與標準範本定義；仍需明確化的格式細節逐項標示 | 不得開始正式解析驗收，也不得自行猜測欄位語意 |
| 1. 程式資料契約核對 | Excel 欄位到 `ItineraryItem` 的映射、中文 category 到內部 `type`、`typeColor` 權威來源、`daysData` 日期鍵、排序、時間正規化、UUID ID 產生規則 | 階段 0 完成 | 產生可供解析器、預覽、資料庫寫入及測試共用的明確資料映射表 | 不得宣稱解析結果正確，不得進行正式整批寫入 |
| 2. Excel 解析與資料驗證（IM01–IM03） | 有效範本解析、範本／工作表／標題錯誤、資料列／時間／天數／類別驗證 | 階段 0、1 完成 | 有效檔案輸出符合資料契約；錯誤檔案拒絕且無任何 Trip／本機權威資料變更；錯誤定位可辨識 | 不得進行 Supabase 整批寫入測試 |
| 3. 新 TRIP 建立與提交安全設計（IM04–IM06） | 新 TRIP 建立權限、雲端可用性、Trip ID 主鍵防碰撞、request registry 冪等性及整批寫入原子性 | 階段 0、1 完成；階段 2 的有效解析輸出及建立預覽契約確認 | 新 TRIP 建立流程的狀態轉移、權限、ID 唯一性、request 重送與失敗結果明確；允許不同 request 建立同名同日期 TRIP；確認整批建立完整性可被測試 | 不得執行正式資料庫整批建立驗收 |
| 4. 本機 Supabase 整批建立與失敗處理（IM07–IM08） | 使用隔離的本機測試資料驗證建立新 TRIP 與每日卡片成功提交、明確失敗、逾時結果不明、雲端權威資料與本機快取更新順序 | 階段 2、3 均完成；已確認僅連線本機 Supabase，且具備本次專用測試資料及清理方案 | 整批建立成功才更新本機 UI／快取；失敗不留下部分 TRIP／卡片；結果不明能重新核對；新建 TRIP 資料完整性符合規格 | 不得宣稱整批建立完整性通過或進入整體驗收 |
| 5. 地點欄位排除與既有功能相容性（IM09–IM10） | 確認 Excel 不含地點／地址欄位、不觸發地圖、天氣、路線、照片副作用；其他裝置沿用既有 workspace reconciliation | 階段 0、1、2 完成；IM08 成功建立路徑可供驗證 | 確認匯入只建立 TRIP 與每日卡片，App 原有地點功能及其他模組／同步規則不被改動；不新增 Realtime／同步子系統 | 不得宣稱整體功能驗收完成 |
| 6. 最終審查與實作授權 | 彙整所有定案、測試證據、未解問題與不在 V1 範圍的項目 | 階段 0–5 完成，所有必測項目有結果 | 提交完整審查摘要，由 Product Owner 決定是否進入實作 | 未取得明確實作授權，不得開始程式實作或資料庫變更 |

### 12.2 固定測試清單（IM01–IM10）

| ID | 測試項目 | 測試目的與通過條件 | 前置依賴 |
|---|---|---|---|
| IM01 | 有效 V1 單一工作表解析與欄位映射 | 有效範本可解析；TRIP 區兩個欄位與卡片區六個欄位正確映射；預覽的最大日序推導天數、卡片數及每日分布正確 | 階段 0、1 |
| IM02 | 範本版本、單一工作表及欄位結構錯誤 | 隱藏 metadata 缺少／空白／未知 `template_version`、可見工作表數量或名稱錯誤、TRIP／卡片區標題缺少／改名／重複時拒絕；指出具體位置；資料完全不變 | 階段 0 |
| IM03 | 資料列、型別、時間、日序與類別驗證 | 必填／選填、HHMM 時間格式、第幾天 1–30、最大日序推導、空白中間日保留、類別下拉固定允許值等均依定案契約驗證；錯誤檔案不得進入可提交狀態 | 階段 0、1 |
| IM04 | 精簡 Excel 輸入與完整 TRIP 資料模型一致性 | Excel 只要求最新契約欄位，但建立後的 TRIP 必須具備 App 所需完整資料結構；參與者與其他設定由系統預設產生，不要求先建立空白 TRIP | 階段 0、1：完成欄位映射及系統預設資料核對 |
| IM05 | TRIP ID 唯一性、相同名稱日期可重複建立與三層權限保護 | 兩個不同建立 request 即使 `title + departure_date` 完全相同，也都可成功建立；兩筆資料的 TRIP ID 必須不同且各自可正確讀取。相同 request ID 不得當成另一個新建立請求（由 IM06 驗證）。只有實際 ID 主鍵衝突或 tombstone ID 重用才拒絕；非 Super Admin 不得看見／進入匯入入口；確認提交時 Session 缺失／更新失敗／帳號不符須停止；即使繞過前端直接呼叫 RPC，非 Super Admin 仍不得建立 | IM04；P01；UUID 產生規則及 `trips_pkey` |
| IM06 | 建立提交冪等性與整批原子性 | 相同 request UUID／Trip ID／canonical payload 重送只回傳同一筆建立結果；同 request UUID 不同 payload 拒絕；同 request 併發只建立一筆；Trip、每日卡片、request registry、participant mapping trigger 或特殊 Other Info 任一環節失敗時整筆交易回滾。Trip 刪除後同 request 重送保留 request tombstone 證據，不得重建 | IM04、IM05；request registry／fingerprint 契約及交易設計 |
| IM07 | RPC 明確失敗、拒絕及逾時結果不明 | 明確失敗時不更新 UI／本機快取；逾時或斷線時使用相同 request UUID 查詢；查到相同 fingerprint 的完成結果視為成功，仍無法確認則顯示「建立結果待確認」，不得換新 ID 盲目重建或誤報成功／失敗 | 階段 3 的 RPC 回傳、冪等及錯誤契約 |
| IM08 | 成功建立後雲端與本機資料完整性 | 核對 TRIP 基本資料、旅程天數與日期、每日卡片、唯一新 ID、時間／類別／排序及系統預設資料；只有雲端整批建立成功後才更新本機權威快取／UI，不得出現部分成功 | IM01–IM07；本機隔離測試環境 |
| IM09 | 地點欄位排除與既有功能隔離 | 驗證範本不含任何地點名稱／地址欄位，不匯入 `location`、`location_address`、Place ID 或座標；匯入不觸發地圖、天氣、照片或路線副作用；建立後仍可在 App 手動設定地點 | 階段 0、1、2 |
| IM10 | 建立後其他裝置透過既有刷新機制取得新 TRIP | 雲端新 TRIP 建立成功後，另一裝置透過啟動／重新協調／網路恢復／focus／visible 等既有觸發取得最新資料；不要求前景即時推送，不新增 Realtime 訂閱或同步子系統 | IM08；既有 reconciliation 契約 |

### 12.3 測試項目與階段的對應

| 階段 | 對應測試 | 說明 |
|---|---|---|
| 0–1 | 測試案例準備，不宣告通過 | 先定義檔案與資料契約 |
| 2 | IM01、IM02、IM03 | Excel 解析及驗證 |
| 3 | IM04、IM05、IM06 | 新 TRIP 權限、UUID 唯一性、同名同日期多筆建立、同 request 重送冪等及整批原子性 |
| 4 | IM07、IM08 | 整批寫入、錯誤處理及完整性 |
| 5 | IM09、IM10 | 地點欄位排除與既有同步相容性 |
| 6 | 全部 | 最終審查與是否授權實作 |

### 12.4 固定停止規則與執行紀錄

1. 每次只處理目前階段尚未定案的項目；完成後記錄決策與證據，再進入下一個依賴階段。
2. 前置定義不完整時，可以整理問題與測試案例，但不得自行補猜規格，也不得將依賴後續階段的測試標記為通過。
3. 若實作過程發現規格矛盾，先回到本文件相應階段修訂並取得 Product Owner 確認；不得私下改變已定案產品規則。
4. 本機 Supabase 測試只能使用明確標記、可識別及可清理的專用測試 Trip；不得 reset 資料庫、修改正式環境或碰觸既有資料。
5. 每項測試記錄：狀態（未開始／待定案／可測試／通過／失敗／阻塞）、前置條件、環境、操作、預期結果、實際結果及證據。未執行不得標記通過。
6. 本計畫不納入 V3.10.12 的 TC01–TC14 舊版同步驗收重測；除非 V3.11.0 實作實際修改相關程式路徑，且能指出具體受影響行為，才新增最小範圍的回歸項目。
7. 本文件的產品決策及範圍限制優先於測試便利性；不得為了通過測試而擴大 V1 範圍。

### 12.5 目前階段狀態（2026-11-03 核對）

| 項目 | 狀態 | 備註 |
|---|---|---|
| 階段 0：產品契約定案 | 主要產品欄位已定案／範本細節待收斂 | 2026-11-03 已定案單一可見工作表、兩項 TRIP 欄位、六項卡片欄位及必填／選填、類別下拉選單、最大日序推導天數、系統預設與幣別確認流程。仍須完成範本固定區塊／標題位置、隱藏 metadata 實作方式及正式範本定義；不得重新開放已定案欄位。 |
| 階段 1：程式資料契約核對 | 主要映射已核對；RPC 權限／交易仍待 SQL 驗證 | 已核對 `createTripRecord` 系統預設與 ID、參與者權威來源、六類及 typeColor、日期資料與空白日、時間格式、TRIP／卡片 ID、一般建立服務與通用 RLS。Excel 類別中文值直接映射到 `ItineraryItem.type` 的同名中文值；`typeColor` 取 `ItineraryPage.tsx` 既有 `ITINERARY_TYPE_OPTIONS`。`daysData` key 為 `String(day)`；卡片 ID 使用現有 `createItineraryItemId()`；每日匯入列維持工作簿列順序，不自行按時間排序（既有手動編輯保存時才會依時間穩定排序）。Excel 嚴格 `HHMM` 驗證後，保存值正規化為 App 現有 `HH:mm`。已透過正式 Supabase 唯讀查詢確認 participant mapping trigger／private table 已啟用，6 筆既有 TRIP 均有 mapping；`other_info_items` 欄位、RLS、唯一索引及 postgres owner／RLS bypass 特性已核對。request registry 僅為技術建議，尚未實作／測試；名稱／日期不設唯一索引，依本輪決策允許重複。RPC SECURITY DEFINER 權限、完整交易 rollback 與特殊 Other Info 寫入仍待本機 DB 驗證。P01 使用 Excel 專用安全 RPC，不修改通用 INSERT RLS。 |
| 階段 2：IM01–IM03 | 尚未開始 | 等階段 0、1；沒有執行 Excel 解析測試。 |
| 階段 3：IM04–IM06 | 尚未開始 | 等階段 0–2；沒有執行建立權限／重複提交／原子性測試。 |
| 階段 4：IM07–IM08 | 尚未開始 | 等階段 0–3；沒有執行 V3.11.0 整批建立資料庫測試。 |
| 階段 5：IM09–IM10 | 尚未開始 | 依各自前置條件；沒有執行 V3.11.0 地點隔離或跨裝置驗收。 |
| 階段 6：最終審查 | 尚未開始 | 等階段 0–5；尚未取得實作授權。 |

### 12.6 版本與授權狀態

- **版本建議：V3.11.0（MINOR 主要功能）**，建議範圍為新增 TRIP 的 Excel 建立流程（含 TRIP 基本資料及每日行程卡片匯入）；不包含已捨棄的既有 TRIP 卡片匯入／覆蓋。
- 2026-11-03 技術審查補充：遠端正式 DB 唯讀盤點顯示 6 筆 TRIP、0 筆 trim 後 title/date 重複、無 title/date 唯一索引；participant mapping trigger 與 6 筆 private mapping 已存在。公司端本機 Supabase 因 Docker Engine 未啟動，`npx supabase status`／`migration list --local` 無法連線，故本次沒有本機 DB 驗證或任何 DB 寫入。遠端查詢僅為 SELECT／catalog 讀取，未執行 migration、DDL 或資料修改。
- 2026-11-03 延續 SQL 契約審查（歷史方案，已被本日後續產品決策取代）：原先曾建議以 request registry 處理同 request 重送，並以 expression unique index 限制 title/date；本日後續決策已取消名稱＋日期防重複，request registry 僅保留同一提交的冪等性，詳見 P05-01-04 與 8.3。正式 DB postgres owner／RLS bypass、participant mapping trigger、特殊 Other Info 與整批 rollback 的安全要求仍有效，需於本機 SQL 驗證。
- 2026-11-03 產品決策更新：取消 TRIP 名稱＋出發日期防衝撞。唯一性只由 `trip-<UUID>`／`trips_pkey(id)` 保證；不同建立 request 可以建立相同名稱及日期的多筆 TRIP。同一 request 的重送仍須冪等，不得重複建立。此決策已同步 P05-01-04、8.1、8.3、8.5、8.8、8.9、IM05、階段依賴與狀態紀錄。
- 本次更新僅涉及本權威規格文件；沒有修改程式碼、資料庫或 migration，沒有執行 commit／push。名稱＋日期唯一索引及 `TRIP_DUPLICATE_TITLE_DATE` 錯誤碼已明確取消；request registry 仍屬技術審查建議，尚未授權實作。
- 本文件目前只作規格審查與定案管理；**尚未授權程式實作、執行資料庫 schema／migration 變更或發布**。後續正式實作如獲授權，僅可依第 8 節定義的 Excel 專用 RPC 與最小必要 migration 進行，不得擅自修改通用 `trips` INSERT RLS。
- 只有階段 0–6 所需審查完成，且 Product Owner 明確授權後，才進入實作。
- 後續工作一律依本節編號及狀態逐項推進；不得每次對話重新建立不同的測試清單或執行順序。
