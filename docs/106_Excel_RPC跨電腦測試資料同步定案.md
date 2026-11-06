# Excel RPC 跨電腦測試資料同步定案

> 本文件只定義 Excel RPC 測試案例集如何在 A（公司端）與 B（家用端）之間獨立傳遞，以及如何在目的端以本機登入狀態重建 RPC 測試。一般測試 TRIP fixtures 的同步範圍、標記方式及批次規則一律依 `docs/83_本機測試資料庫同步流程.md`；每個一般 fixture 目錄包含一筆 TRIP，但可有多個 fixture 一次上傳／下載。Excel RPC 案例集與一般 TRIP fixtures 是兩種獨立資料集，互不作為對方的前置條件。本文件不使用 baselineAt、version、parent、checksum 或 applied state 作為傳輸門檻。

## 1. 最終目標（已定案）

A、B 任一端新增或修改 Excel RPC 合成案例輸入後，另一端取得 Git 最新版本並明確執行下載，即可取得相同案例定義；目的端再使用自己的本機登入狀態呼叫 RPC，重建相同測試情境。單一 RPC 案例集可包含多個案例及多筆預期建立的 TRIP 輸入；這不代表直接同步已建立的 TRIP、Auth 或 RPC registry。一般測試 TRIP 的跨機資料同步則依 `docs/83`，可由多個各自含一筆 TRIP 的 fixtures 批次處理。

「重現」以相同測試輸入、相同業務內容、相同預期結果為準；不要求不同電腦的 Auth UUID、RPC request UUID、TRIP 隨機主鍵、DB trigger timestamps 或本機 session 相同。

Excel RPC 案例集與一般 TRIP fixtures 均可透過 Git 在 A、B 間取得，但採各自獨立的資料格式與流程。不得以一般 fixture「每個目錄一筆 TRIP」的結構，限制 RPC 案例集可保存的案例數或預期輸入；也不得把 RPC 案例集的多筆預期輸入解讀為一般 fixture 單一目錄可包含多筆 TRIP。

## 2. 同步資料與本機資料的分界

### 2.1 必須跨電腦版本化的資料

- 明確標記的合成測試案例及其穩定案例 ID。
- 建立測試 TRIP 所需的輸入：標題、出發日期、幣別、卡片陣列；保留日序、時間、離開時間、卡片標題、類別、描述及空白日等業務輸入。
- 測試案例預期產生的行程內容、每日卡片、必要的 Other Info 內容及驗收斷言。
- 測試案例生命週期（active、regression_pending、released、archived、deleted）與來源稽核欄位。manifest 可保留 version、baselineAt、checksum 等欄位作為資訊，不得當成同步許可條件。
- 可由上述輸入確定性重建的合成參數。若測試目的是驗證同一 request 重送，案例需保存「同案例重送」操作與預期冪等結果，而非保存某一台電腦已經產生的 request UUID。

### 2.2 嚴禁直接跨機複製、必須在目的端重建的資料

- 所有使用者帳號與所有參與者資料，一律不跨機複製、不寫入 fixture／案例檔；不區分測試帳號或真實帳號。
- `auth.users`、`admin_profiles`、`admin_users`、登入 session、access／refresh token、密碼、本機 Auth UUID、管理員身分與權限設定；各電腦僅使用本機既有帳號與權限。
- `private.trip_participant_email_maps` 的所有 Email map，以及任何參與者姓名、Email、電話、使用者 ID 或其他參與者欄位；目的端不從 fixture 重建參與者，測試需要登入時只使用目的端既有帳號。
- `private.tc_trip_excel_create_requests` request registry 的已完成 row、`user_id`、request UUID、response payload 與 pending 狀態。它們是本機 RPC 冪等及授權狀態，不是跨機業務 fixture。目的端執行測試時產生自己的 request UUID 與 registry row。
- `created_by`、owner、私有附件識別、Storage 檔案本體、環境設定、secret、token 及任何非合成或可識別個資。

不可使用資料庫整體 dump、Docker volume 複製或遠端／正式資料庫作為傳輸媒介。

## 3. Excel RPC 的重建方式

- 測試來源電腦以受控測試案例定義保存輸入資料，不匯出已完成的本機 registry row 或 participant Email map。
- 公司端 2026-11-05 唯讀盤點的 4 筆既有 Excel RPC 測試 TRIP 已轉成案例輸入：`Excel RPC test rollback`（2030-01-02，09:00–10:00）、`Excel RPC same title different request`（2030-01-05，11:00–12:00），以及兩筆 `Allowed duplicate title date`（2030-01-06，13:00–14:00）。這些舊 row 的 `daysData` 卡片 type 實際存為 `??`（非 RPC 接受類別），共享案例為使 RPC 可重建，將 type 正規化為允許的 `其他`；日期、時間、標題及描述仍保留其已核對內容。rollback 命名案例只代表原有測試命名／輸入；真正交易 rollback 仍須另外執行故障注入測試，不可把成功建立該案例當成 rollback 驗收。
- 目的端必須使用該台電腦有效的本機已登入使用者 Session 與本機已套用的 Excel RPC migration，重新呼叫同一個 `tc_create_trip_from_excel` RPC；不得以 service_role JWT 取代使用者登入身分，也不得繞過 RPC 直接寫入正式業務路徑來假裝完成 RPC 驗收。
- 此 RPC 有兩個不同層次的限制：PostgREST 函式 EXECUTE 僅授予 `authenticated`；函式內再以 `auth.uid()` 確認呼叫者已登入，並以 `private.tc_is_super_admin()` 確認登入者 email 對應 `public.admin_users.role='super_admin'`。因此一般登入者不夠；管理者以一般登入流程取得的使用者 JWT 才符合條件。service_role JWT 雖具資料庫管理能力，但不代表一個已登入的管理者使用者，且目前函式明確不授予 service_role EXECUTE。
- 每次重建使用目的端新產生的 request UUID；同一案例的重送測試在該目的端重用同一 request UUID，驗證冪等；不同 request UUID 同名同日期應建立不同 TRIP。
- 本機 RPC 自行依目的端 Auth／admin 設定產生 participants、private Email map 及 request registry。若目的端缺少可用 Super Admin 使用者、有效使用者 Session、migration 或必要 schema，須明確報錯停止，不得複製來源端 Auth 身分或降低授權。
- TRIP 的隨機 ID 由 RPC 產生，不要求跨機相等。比較應使用穩定案例 ID、測試輸入與業務欄位；必要時將本機產生的 TRIP ID 存在本機測試執行紀錄，不得寫回共享 fixture。
- 若要測試既有 RPC 產物（包含卡片時間欄位），同步案例輸入必須完整保存原始時間文字及日期序號，不可只保存 TRIP title 或只保存卡片數量。

## 4. 版本化資料集格式與相容性

- Excel RPC 測試案例以獨立資料集管理，不併入既有 `tc-test-sync-example` fixture；不改寫該 fixture 的檔案內容。
- 每個資料集有穩定 `datasetId`，與實際 TRIP UUID 解耦；manifest 保留 `schemaVersion`、`datasetId`、`status`、資料表／案例清單及選擇性 counts。version、parent、baselineAt、sourceHost、checksum 皆為非必要 metadata。
- manifest 的 version、baselineAt、parent、checksum 等若保留，只作資訊紀錄；內容是否上傳／下載以案例 JSON 正規化後的實際內容比較決定，案例 schema、日期時間、私有欄位與資料關聯檢查仍須通過。
- Excel RPC 的 `cases.json` 可包含多個測試案例；單一案例可描述 RPC 輸入、預期結果及必要的多筆建立情境。目的端逐案例呼叫 RPC，由 RPC 在本機建立 TRIP。這是 RPC 案例集格式，不是一般 TRIP fixture 的資料結構；一般 fixture 每個目錄一筆 TRIP，多個目錄可批次同步，詳見 `docs/83`。
- 舊 `tc-test-*` fixture schema 與資料內容維持相容；Excel RPC 案例同步程序不得修改一般 fixture 的資料檔。
- Excel RPC 案例集的上傳／下載以案例內容直接比較；本機副本不存在時可首次建立，既有副本不同則依 Git 快照更新。此流程只傳遞案例定義，不直接建立或覆蓋任何 TRIP，也不傳遞 Auth、request registry 或 Email map。一般 TRIP fixtures 的 DB 匯入／更新依 `docs/83`，與 RPC 案例集下載分開處理。

## 5. 回歸測試與資料生命週期

- Excel RPC 所有 active／regression_pending 案例必須隨獨立案例集提交 Git，供 A、B 取得；一般 TRIP fixtures 則依 `docs/83` 的生命週期及批次規則管理。
- 最少涵蓋：單筆建立、同 request 重送、建立交易失敗 rollback、特殊 Other Info 衝突 rollback、不同 request UUID 同名同日期建立多筆、日期／時間／多日序及必要卡片內容保留。
- 每台電腦使用本機 Auth／Super Admin 獨立執行；非 Super Admin、缺少管理員、結果不明等案例依本機測試能力明確記錄 pass／fail／skipped，不得以來源端 registry row 假冒目的端驗收。
- active／regression_pending 不可由一般同步程序清除。released 必須明確解除；archived 不得日常重新載入；deleted 必須依共同生命週期與兩端確認規則處理。
- 任一端新增／修改 Excel RPC 案例後，透過 `/上傳資料庫` 發布案例集；另一端先安全 fast-forward Git，再透過 `/下載資料庫` 取得案例定義，之後才可依本文件第 7.2 節在目的端重建 RPC。一般 TRIP fixtures 同樣使用明確的 upload／download 命令，但其候選搜尋、內容比較及 DB 批次匯入依 `docs/83`。兩種資料集彼此獨立；不以 revision／parent／checksum 判斷衝突。

## 6. 命令與安全界線

- 一般 Git commit／push 與資料庫 upload／download 仍是分離操作。
- `/上傳資料庫` 只執行 `npm run testdata:upload`；`/下載資料庫` 只執行 `npm run testdata:download`。不得因 Git 操作自動觸發資料庫上傳／下載。
- 所有查詢、匯入及 RPC 重建只允許目前節點 loopback Supabase；不可使用 `--linked`，不可操作正式／遠端共享 DB。
- 不執行 `db reset`、清除 Docker volume、清理既有測試 TRIP 或刪除 registry；本次新增重建流程不得順便清除使用者已建立的測試資料。
- Node 命令遵守根目錄 `AGENTS.md`：先確認主機及該主機專案 Node 22.23.2，在同一程序 PATH 前置後執行。

## 7. 操作方式（目前程式入口）

### 7.1 檢視與修改案例

- `npm run excel-rpc:dataset:validate`：檢查 Git 版案例集的結構、案例欄位與必要 counts；checksum 若存在僅供參考，不作為驗證門檻。
- `npm run excel-rpc:dataset:prepare`：在目前節點建立 `supabase/.temp/excel-rpc-test-cases.json` 編輯副本；若副本已存在，拒絕覆寫。
- 編輯該 `.temp` JSON 後執行 `npm run excel-rpc:dataset:validate-local`：驗證案例欄位、日期、時間、卡片類別及敏感／私有欄位；不以案例 checksum 作為驗證依據。
- 使用者明確輸入 `/上傳資料庫` 時，`testdata:upload` 會獨立檢查 Excel RPC 案例集，並另行搜尋所有符合 `docs/83` 標記規則的一般 TRIP fixtures。RPC 案例內容相同（unchanged）或案例資料集格式驗證失敗，不會取消一般 TRIP fixtures 的候選搜尋與處理；一般 TRIP fixtures 仍依自身驗證結果處理。RPC 案例內容不同且結構／敏感欄位驗證通過時才發布案例集。共享檔案發布階段若發生檔案系統 I/O 或原子替換失敗，仍依安全原則停止整體上傳，不做不完整發布。程式執行時會將適用的 manifest／cases 明確 stage；不以 applied baseline、version、parent 或 checksum 阻擋。
- B／A 另一端先自行安全 fast-forward Git，再明確輸入 `/下載資料庫`；`testdata:download` 分別處理 Excel RPC 案例集與一般 TRIP fixtures。RPC 案例副本不同才更新 `.temp` 案例 JSON，不會因下載案例而自動呼叫 RPC 或建立 TRIP；也不會複製 request registry、Auth 或 Email map。RPC 案例準備或本機案例檔更新失敗會獨立記錄，不會取消已驗證的一般 TRIP fixture DB 匯入；命令整體結果仍會如實回報 RPC 錯誤。一般 TRIP fixtures 的差異會依 `docs/83` 驗證後在單一 SQL transaction 批次匯入。

### 7.2 在目的端本機重建 RPC 測試

- `npm run excel-rpc:dataset:validate`：先確認 Git 版案例集有效。
- 執行 `npm run excel-rpc:dataset:rebuild`：以目前節點的本機 Super Admin JWT 呼叫 loopback REST RPC，第一次建立時產生本機 request UUID 與 TRIP ID，並回讀 TRIP、每日卡片日期／時間及特殊 Other Info。
- 目前 runner 的 `TC_LOCAL_SUPABASE_ACCESS_TOKEN` 仍以「Super Admin JWT」為必要輸入，但程式實作其實只是把該值放進 `Authorization: Bearer`，沒有自動登入、也沒有取得或驗證使用者 Session。不得把 Supabase service_role JWT 填入此變數冒充管理者登入；本次實測正是因使用 service_role token 呼叫而收到 HTTP 403 `permission denied for function tc_create_trip_from_excel`。
- 正確測試方式應先由受控本機測試流程建立一個短生命週期的臨時 Auth 使用者，使用本機管理 API 將該使用者 email 加入 `public.admin_users` 並授予 `super_admin`，再以 anon key + 該測試帳號 email/password 呼叫 Auth `signInWithPassword` 取得使用者 access token；RPC 及回讀驗證均使用這個使用者 token。測試結束須在 `finally` 清除本次建立的測試行程／相關 registry、Other Info、private map，以及本次建立的 `admin_users` 權限列和 Auth 使用者；清理僅限本次測試建立且以隨機識別值精確定位的資料，不得碰觸既有使用者或既有測試行程。若無法保證完整清理，先停止並回報，不可留下臨時管理者。
- 目前 `.env.local` 僅確認有 loopback URL 與 anon key；本次沒有從設定檔找到可用的本機 service_role 測試變數，也沒有建立臨時帳號。後續先檢查 Supabase CLI 是否可在本機安全取得 service_role key，且確認只作用於 `127.0.0.1`；不可輸出、保存或記錄該 key。若可用，修改 runner 讓它在單次程序內用 service_role 僅負責建立／清理臨時測試帳號及管理列，另以 password sign-in 取得一般使用者 JWT 執行目標 RPC；不能把 service_role token 直接傳給目標 RPC。若 CLI 無法安全提供該憑證，改由使用者在本機已登入的管理者 UI 取得正常 Session，或明確回報需要的安全輸入。
- token、password 及臨時 Auth 身分均不得寫入 `.temp` 執行紀錄、fixture、Git 或 log。專案 `.env.local` 的 URL 必須是 loopback，並提供本機 anon key。缺少必要條件、權限不足、migration 不存在或 API 非 loopback 時，停止且不寫入。
- `npm run excel-rpc:dataset:rebuild` 會重用本機執行紀錄內的 request UUID，因此重跑為冪等重播，不會持續新增相同行程。
- `node scripts/excel-rpc-test-dataset.mjs replay <caseId>`：使用本機已記錄 request UUID 重送，要求 RPC 回傳同一 trip_id 及 `idempotent_replay=true`。
- `node scripts/excel-rpc-test-dataset.mjs new-request <caseId>`：為同一案例產生新 request UUID，並確認 RPC 回傳不同 trip_id。這是會新增本機測試行程的明確操作。
- 本機 request UUID／trip_id 執行紀錄只存 `supabase/.temp/excel-rpc-executions.json`；不得跨機複製或提交 Git。

以上 RPC rebuild 命令實際寫入目前節點 loopback Supabase；一般 validate／prepare／validate-local 不寫入資料庫。執行 rebuild／replay／new-request 前，請確認目前使用的是測試資料庫，並確認本次測試可安全清理其建立的資料；Git 工作樹是否有其他修改不影響測試執行。本次未執行任何真實 rebuild、清理、upload 或 download。

## 8. 完成條件

1. 文件已明確定義上述資料同步與本機重建邊界。
2. Excel RPC 獨立案例集可版本化、驗證及傳輸多個案例與多筆預期 TRIP 輸入；目的端逐案例以本機登入狀態呼叫 RPC 重建。一般 TRIP fixtures 每個目錄仍是一筆 TRIP，但可有多個 fixtures 批次上傳／下載，規則依 `docs/83`。
3. 目的端能以本機 Super Admin RPC 重建案例及每日時間資料；request registry 與 Email map 均為本機新產生。
4. 有純函式／SQL 生成／安全邊界測試，證明不會匯出 Auth、Email map、request registry、owner 或 secret。
5. 原有 `tc-test-sync-example` V5 是一般 TRIP fixture 的歷史案例；保留其相容性，不代表現行 TRIP ID、命名或每批筆數限制。Excel RPC 案例集不得改寫該 fixture；一般 fixtures 的同步仍依 `docs/83`。
6. 完成相關測試、TypeScript／build（受影響時）、文件連結與 diff 檢查。
7. 未執行未授權的資料庫 upload、清理、commit、push 或正式 DB 操作。雙機真實端到端驗收未執行前，不得宣稱已完成實機跨機驗收。

## 9. 2026-11-06 本機 Excel RPC 併發測試進度與交接

### 9.1 本次已完成檢查

- 已確認作用中專案及根目錄為 `D:\\Project\\Travel-Companion`；所有查詢均在此專案內執行。
- `scripts/excel-rpc-test-dataset.mjs` 的 `assertRpcReady()` 讀取 `.env.local` 的 `VITE_SUPABASE_URL`／`VITE_SUPABASE_ANON_KEY`，並要求環境變數 `TC_LOCAL_SUPABASE_ACCESS_TOKEN`；`localRestRequest()`、`invokeExcelRpc()` 會直接將此 token 放入 `Authorization: Bearer`。此 runner 沒有自行登入，也沒有驗證傳入 token 是使用者 Session。
- 本機 `supabase/migrations/20261103150000_v3110_trip_excel_create_rpc.sql` 的 `tc_create_trip_from_excel` 以 `auth.uid()` 要求登入使用者，再呼叫 `private.tc_is_super_admin()`；管理者判斷依 JWT email 對 `public.admin_users.role='super_admin'`。同 migration 明確撤銷 `public`、`anon`、`authenticated`、`service_role` 的 EXECUTE，再只授予 `authenticated`。
- 本次先前以本機 Supabase Service Role JWT 呼叫 RPC，實際收到 HTTP 403：`permission denied for function tc_create_trip_from_excel`。這是 token 身分／函式授權不符，不代表一般登入的非管理者可以呼叫；非管理者即使有登入 Session，仍會被函式內的 Super Admin 檢查拒絕。
- 本機 Auth 服務 health endpoint 回應 HTTP 200（GoTrue v2.196.0），確認登入服務有啟動。
- `.env.local` 已確認只有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`；`supabase/.env.local` 僅見 `COMMONS_PRECISION_TOKEN_SECRET`。這兩個檔案沒有現成的測試登入帳號／密碼或 `V364_*`／`LEASE_TEST_*`／`SUPABASE_*` 測試憑證設定。不得把任何 secret 值寫入本文件或 log。
- 以 anon key 查詢 `admin_users` 回應 HTTP 401／`permission denied for function tc_current_email`，符合管理者資料受保護的設計；本次沒有讀取或輸出管理者 email。
- 專案既有 `scripts/verify-v364-supabase-realtime.mjs` 展示了本機測試模式：管理用 client 建立臨時 Auth 使用者與 `admin_users` 角色列，再以 anon client `signInWithPassword` 取得真正使用者 Session；其 `finally` 會刪除本次建立的 Auth 使用者。不過該腳本還涉及 Realtime／Trip 測試，不可直接整支執行來替代本次 RPC 測試。

### 9.2 本次未完成／未執行事項

- `concurrent multi-day-time-preservation` 測試未成功執行；RPC 沒有成功建立 TRIP，沒有產生新的執行紀錄。
- 沒有修改程式、migration、資料庫權限或 Auth 使用者；沒有新增或刪除 TRIP、registry、Other Info 或 private Email map。
- 未執行資料庫 reset、Docker volume 操作、遠端／正式 DB 操作、Git commit／push。
- 既有 `.temp` 本機案例編輯副本 `supabase/.temp/excel-rpc-test-cases.json` 已存在，必須保留，不得覆蓋；本機執行紀錄 `supabase/.temp/excel-rpc-executions.json` 在此前檢查時尚不存在，後續執行前仍須再確認。

### 9.3 明確下一步（下一位執行者照此順序進行）

1. 先確認 `supabase status -o json` 的 API URL 僅為 `127.0.0.1`／localhost，且 migration `20261103150000` 仍已套用；不得使用 `--linked`。
2. 確認可由本機 Supabase CLI／受控本機流程安全取得 service_role key 供「建立與清理測試帳號」使用；只在記憶體／程序環境內使用，不輸出、不寫檔、不記錄。若無法安全取得，停止並回報，不得改用遠端 key。
3. 以隨機 email／密碼建立一個本次專用、短生命週期的 Auth 測試使用者，並只在本機 `admin_users` 為該 email 加入 `super_admin` 權限列。這是建立本次測試身分，不是調整既有使用者或放寬函式 EXECUTE 權限。
4. 使用 `.env.local` anon key 對本機 Auth `signInWithPassword`，取得該臨時帳號的使用者 access token；先驗證 token 有 `auth.uid()` 且 email／`admin_users` 角色對應本次測試帳號，再將使用者 access token 傳給 Excel RPC runner。service_role key 僅限管理 API 建立／清理，不得傳給 `tc_create_trip_from_excel`。
5. 修正或包裝 runner，讓上述建立帳號、登入、測試、清理流程由單一程序可靠管理；不得把 email、密碼、access token、service_role key 寫入 fixture、`.temp` 執行紀錄、Git 或輸出 log。清理應放在 `finally`，只刪除本次隨機識別的測試 TRIP、其 request registry、Other Info、private map、`admin_users` 權限列與 Auth 使用者；刪除前應以本次建立的 ID／email 精確比對，避免碰觸既有資料。若目標 TRIP／關聯資料清理無法安全完成，不要建立測試資料，先補齊清理策略。
6. 先以 `node scripts/excel-rpc-test-dataset.mjs validate` 驗證案例，再執行 `node scripts/excel-rpc-test-dataset.mjs concurrent multi-day-time-preservation`（目前案例 ID 以 Git fixture 實際內容為準）；驗證兩個併發呼叫共用同一 request UUID、只建立一筆 TRIP，且回讀日期、每日卡片、開始／結束時間及特殊 Other Info 均正確，最後確認清理完成。
7. 完成後回寫本節測試結果（pass／fail、實際案例 ID、建立／清理筆數及錯誤摘要，不包含任何憑證），再更新 `docs/81_AI每日行程卡片Excel匯入規格草案.md` 的進度表；本次文件修訂本身不包含 commit／push。

**停止條件：** 若 local Supabase CLI 無法安全提供本機管理 key、Auth 無法建立／登入臨時使用者、使用者 JWT 仍無法通過管理者檢查，或無法保證測試資料完整清理，立即停止；不得改成授權 `service_role` 執行 RPC，不得使用真實管理者密碼或既有使用者 Session 來繞過測試設計。

## 10. 2026-11-05 B → C 下載驗收紀錄

- **結果：通過。** 使用者確認在 OpenChatX Home 的 `D:\Project\Travel-Companion` 成功執行 `/下載資料庫`。
- 測試資料集：更新 1 組；Excel RPC 測試案例已更新，檔案大小 3,484 bytes。
- 本機資料庫：已完成交易式匯入；匯入後查詢筆數如下：

  | 資料表 | 本機筆數 |
  | --- | ---: |
  | `trips` | 1 |
  | `checklists` | 1 |
  | `checklist_items` | 5 |
  | `expenses` | 0 |
  | `exchange_purchases` | 0 |
  | `other_info_items` | 0 |

- 更新的測試行程 ID：`trip-a2131af0-2e96-43ee-8ea4-e71a27df63ab`。
- Git 工作樹：乾淨；本次未執行 Git commit／push，也未執行資料庫上傳。
- **差異說明：** 本次下載顯示更新 1 組，代表執行前本機案例內容與 Git fixture 不完全一致；已完成匯入。此紀錄僅確認 B → C 下載及本機匯入成功，不代表其他跨機驗收項目已通過。
