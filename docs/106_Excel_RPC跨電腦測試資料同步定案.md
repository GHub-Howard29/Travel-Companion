# Excel RPC 跨電腦測試資料同步定案

> 本文件定義 Excel RPC 測試案例如何在公司端、家用端及其他開發電腦重現。本文件只補足案例輸入與本機私有狀態的邊界；同步方向一律遵循 docs/83 的現行內容直接比較規則，不使用 baselineAt、version、parent、checksum 或 applied state 作為傳輸門檻。

## 1. 最終目標（已定案）

任一台電腦建立或修改的合成測試資料，其他電腦取得 Git 最新版本後，必須能在各自的本機 Supabase 重現相同測試情境。資料範圍不限於單一行程，也包含多筆測試 TRIP、每日行程卡片的日期／時間／內容及其必要的 Other Info。

「重現」以相同測試輸入、相同業務內容、相同預期結果為準；不要求不同電腦的 Auth UUID、RPC request UUID、TRIP 隨機主鍵、DB trigger timestamps 或本機 session 相同。

此要求適用所有本機自動化／人工測試資料，包括 Excel 匯入 RPC，不得再以現有 `tc-test-*` 單行程 fixture 的範圍，推定其他測試資料不需要跨機重現。

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
- 目的端必須使用該台電腦既有、有效的本機 Super Admin Session 與本機已套用的 Excel RPC migration，重新呼叫同一個 `tc_create_trip_from_excel` RPC；不得繞過 RPC 直接寫入正式業務路徑來假裝完成 RPC 驗收。
- 每次重建使用目的端新產生的 request UUID；同一案例的重送測試在該目的端重用同一 request UUID，驗證冪等；不同 request UUID 同名同日期應建立不同 TRIP。
- 本機 RPC 自行依目的端 Auth／admin 設定產生 participants、private Email map 及 request registry。若目的端缺少可用 Super Admin、migration 或必要 schema，須明確報錯停止，不得複製來源端 Auth 身分或降低授權。
- TRIP 的隨機 ID 由 RPC 產生，不要求跨機相等。比較應使用穩定案例 ID、測試輸入與業務欄位；必要時將本機產生的 TRIP ID 存在本機測試執行紀錄，不得寫回共享 fixture。
- 若要測試既有 RPC 產物（包含卡片時間欄位），同步案例輸入必須完整保存原始時間文字及日期序號，不可只保存 TRIP title 或只保存卡片數量。

## 4. 版本化資料集格式與相容性

- Excel RPC 測試案例以獨立資料集管理，不併入既有 `tc-test-sync-example` fixture；不改寫該 fixture 的檔案內容。
- 每個資料集有穩定 `datasetId`，與實際 TRIP UUID 解耦；manifest 保留 `schemaVersion`、`datasetId`、`status`、資料表／案例清單及選擇性 counts。version、parent、baselineAt、sourceHost、checksum 皆為非必要 metadata。
- manifest 的 version、baselineAt、parent、checksum 等若保留，只作資訊紀錄；內容是否上傳／下載以案例 JSON 正規化後的實際內容比較決定，案例 schema、日期時間、私有欄位與資料關聯檢查仍須通過。
- fixture 需能包含多筆合成 Trip 的測試輸入及其跨表關聯；匯入器不可假設一個資料集只能有一筆 Trip。
- 舊 `tc-test-*` fixture schema 與資料內容維持相容；Excel RPC 案例同步程序不得修改一般 fixture 的資料檔。
- 測試資料集的上傳／下載以案例內容直接比較；本機副本不存在時可首次建立，既有副本不同則依 Git 快照更新。下載不得影響任何本機 TRIP、Auth、request registry 或 Email map。

## 5. 回歸測試與資料生命週期

- 所有 active／regression_pending 案例必須隨 Git fixture 一起供其他節點取得。
- 最少涵蓋：單筆建立、同 request 重送、建立交易失敗 rollback、特殊 Other Info 衝突 rollback、不同 request UUID 同名同日期建立多筆、日期／時間／多日序及必要卡片內容保留。
- 每台電腦使用本機 Auth／Super Admin 獨立執行；非 Super Admin、缺少管理員、結果不明等案例依本機測試能力明確記錄 pass／fail／skipped，不得以來源端 registry row 假冒目的端驗收。
- active／regression_pending 不可由一般同步程序清除。released 必須明確解除；archived 不得日常重新載入；deleted 必須依共同生命週期與兩端確認規則處理。
- 任一節點新增／修改測試案例後，依 docs/83 內容比較流程上傳；其他節點安全取得 Git 快照後下載／重建。只在案例 schema、敏感資料或私有狀態檢查失敗時停止，不依 revision／parent／checksum 判斷衝突。

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
- 使用者明確輸入 `/上傳資料庫` 時，`testdata:upload` 直接比較本機案例副本與 Git `cases.json`；內容相同為 unchanged，內容不同且案例結構／敏感欄位驗證通過即可發布。程式執行時會將 manifest／cases 明確 stage；不以 applied baseline、version、parent 或 checksum 阻擋。
- 其他電腦先自行安全 fast-forward Git，再明確輸入 `/下載資料庫`；`testdata:download` 直接比較本機 `.temp` 案例副本與 Git `cases.json`，不同才更新案例副本，不會自動建立任何 TRIP，也不會複製 request registry、Auth 或 Email map。

### 7.2 在目的端本機重建 RPC 測試

- `npm run excel-rpc:dataset:validate`：先確認 Git 版案例集有效。
- 執行 `npm run excel-rpc:dataset:rebuild`：以目前節點的本機 Super Admin JWT 呼叫 loopback REST RPC，第一次建立時產生本機 request UUID 與 TRIP ID，並回讀 TRIP、每日卡片日期／時間及特殊 Other Info。
- 必須在該次命令程序以環境變數 `TC_LOCAL_SUPABASE_ACCESS_TOKEN` 提供目前節點有效的本機 Super Admin access token；token 不得寫入 `.temp` 執行紀錄、fixture、Git 或 log。專案 `.env.local` 的 URL 必須是 loopback，並提供本機 anon key。缺少有效 token、權限不足、migration 不存在或 API 非 loopback 時，停止且不寫入。
- `npm run excel-rpc:dataset:rebuild` 會重用本機執行紀錄內的 request UUID，因此重跑為冪等重播，不會持續新增相同行程。
- `node scripts/excel-rpc-test-dataset.mjs replay <caseId>`：使用本機已記錄 request UUID 重送，要求 RPC 回傳同一 trip_id 及 `idempotent_replay=true`。
- `node scripts/excel-rpc-test-dataset.mjs new-request <caseId>`：為同一案例產生新 request UUID，並確認 RPC 回傳不同 trip_id。這是會新增本機測試行程的明確操作。
- 本機 request UUID／trip_id 執行紀錄只存 `supabase/.temp/excel-rpc-executions.json`；不得跨機複製或提交 Git。

以上 RPC rebuild 命令實際寫入目前節點 loopback Supabase；一般 validate／prepare／validate-local 不寫入資料庫。執行 rebuild／replay／new-request 前，請確認目前使用的是測試資料庫且工作樹乾淨。本任務未執行任何真實 rebuild、清理、upload 或 download。

## 8. 完成條件

1. 文件已明確定義上述資料同步與本機重建邊界。
2. 程式可版本化、驗證及傳輸多案例／多筆 Trip 的 Excel RPC 合成測試輸入，不再受單一 `tc-test-*` Trip 限制。
3. 目的端能以本機 Super Admin RPC 重建案例及每日時間資料；request registry 與 Email map 均為本機新產生。
4. 有純函式／SQL 生成／安全邊界測試，證明不會匯出 Auth、Email map、request registry、owner 或 secret。
5. 原有 `tc-test-sync-example` V5 歷史 fixture 檔案內容不由 Excel RPC 案例同步程序改寫；其同步判斷仍依 docs/83 的內容比較規則。
6. 完成相關測試、TypeScript／build（受影響時）、文件連結與 diff 檢查。
7. 未執行未授權的資料庫 upload、清理、commit、push 或正式 DB 操作。雙機真實端到端驗收未執行前，不得宣稱已完成實機跨機驗收。

## 9. 2026-11-05 B → C 下載驗收紀錄

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
