# ADR-001-S4：提示、整合驗收與結案條件


### P3 更新提示簡化決策

- 每日詳細行程的提示只保留兩類：**編輯鎖提示**（取得失敗、持有者資訊、續期／失效狀態）及**資料更新提示**（有其他資料更新，需要時主動取得最新資料）。
- 取消每日詳細行程「預覽變更」使用者流程、變更分類／統計計數及其專用呈現；不得為保留不存在的預覽畫面而繼續維護專用 preview baseline、journal 摘要計算或確認流程。相關程式、資料契約及 migration 是否可刪除，須在實作審查中確認依賴及其他功能用途後才能決定；本決策不直接授權刪除共用資料表或其他功能依賴。
- 正常瀏覽期間不持續輪詢編輯鎖或完整 Trip 更新資料。Realtime 可保留輕量狀態通知；收到更新事件時只提示，不自動執行完整 Trip／Journal 讀取或預覽計算。
- 使用者進入每日詳細行程管理／編輯時，主動原子取得 Trip Edit Lock，並在允許編輯前取得必要的最新資料／版本狀態；使用者主動要求更新時才重新讀取最新資料。
- 編輯／保存期間仍必須在伺服器端驗證鎖所有權及版本。Realtime 事件可能因斷線、休眠或事件遺失而漏失，因此「未收到通知」不得視為「資料未更新」；操作時補查及伺服器端 CAS 是必要保護。
- 以上 P3 簡化只適用每日詳細行程；其他功能的 revision、Realtime、同步、提示及驗證行為不隨之更動。

## 2026-11-24 核准新增範圍（原 S4 Exit 之後）

原 S4 已於 2026-11-22 依當時核准範圍 Exit PASS；以下不是回溯變更原 S4 測試結果，而是新增範圍的後續驗收要求：

- 同一 TRIP 的「管理卡片」與「編輯旅程」共用既有 Trip Lease，A→B 及 B→A 兩種入口互斥。
- 編輯旅程開啟時取得 Lease，表單期間續租；送出前重驗 Lease，失效／他端持有／無法確認時禁止提交旅程基本資料。
- focus／頁面恢復只查詢 Lease，不主動解除鎖提示；切換 TRIP 依 `trip_id` 重新查詢。
- 驗證正常離開／保存後釋放 Lease、非正常中斷租約到期恢復，以及其他功能同步完全不變。
- 刪除旅程仍使用既有編輯旅程入口及 `super_admin` 權限，不新增刪除專用 Lease／DB enforcement。
- 新增範圍的實作與驗收完成前，不得宣稱本次 ADR-001 擴大範圍已 Exit PASS。

### 2026-11-24 新增範圍實作紀錄
- `src/App.tsx`：Edit Trip 入口先以既有 `tc_claim_itinerary_trip_edit_lease` 取得 `__trip__` Lease；取得成功才刷新旅程並開啟 Modal。編輯期間每 15 秒續租；focus／visibility 恢復時只讀取 `tc_list_itinerary_trip_edit_leases`，確認 owner 不符或查詢失敗即停止續租並阻止提交，不主動解除其他端鎖定。
- 提交前再次執行 Lease renew + owner/client readback，確認仍由目前 user/client 持有後才呼叫 `updateTrip`；保存成功、Modal 正常關閉及既有刪除流程結束時釋放原旅程 Lease。刪除 API／DB enforcement 未擴張，仍沿用既有 super_admin UI 權限。
- `src/hooks/useTripWorkspace.ts`：`daysData` 不變的 metadata-only Cloud update 現在也須 claim 同一 Trip Lease；Edit Trip Modal 已持有 Lease 時透過本端 ownership marker 保留該 Lease，避免 Repository update 途中提早 release、破壞表單 heartbeat。`daysData` 變更時原 Save RPC／CAS／version 流程不變；standalone update 仍自行 claim/release。
- `src/services/itineraryCardEditLeaseService.ts`：新增本端 Modal Lease ownership marker，僅供同一 App update 流程避免巢狀 release；伺服器 Lease RPC 仍是唯一權威，不建立第二套鎖。
- `scripts/verify-adr001-s3-app-integration.mjs`：擴增 Edit Trip entry claim、heartbeat、submit revalidation、focus-only query、normal close 與 metadata-only Lease contract assertions。
- 驗證：`tsc -p tsconfig.app.json --noEmit` PASS；`tsc -p tsconfig.node.json --noEmit` PASS；`verify:adr001-s3-app-integration` PASS（含本次新 assertions）；`test:adr001-cloud-save-service` PASS；`test:trip-workspace-recovery-lifecycle` PASS；完整 `npm run build` PASS（全部 repository regression gates、Vite production build、PWA precache、Browser Security、Weather Bundle）；`git diff --check` PASS。
- ESLint 目標檔案：本次新增的 `App.tsx` 與 `itineraryCardEditLeaseService.ts` 無新增 lint diagnostics；`useTripWorkspace.ts` 報告 2 個既有 errors（`localSaved` useless assignment、caught error 缺 `cause`）與 1 個既有 hook dependency warning（`refreshItinerarySyncState`），均在本次變更以外的原有位置，未為本次範圍擴大修正。
- 本次未修改 DB／migration、未執行 linked／正式 Supabase 寫入、未操作測試旅程、未 commit／push。新增範圍目前程式與自動化驗證通過；尚未完成人工雙入口互斥、非正常中斷 TTL 恢復的實際 UI 驗收，故新增範圍狀態為 **IMPLEMENTED／AUTOMATED PASS／MANUAL ACCEPTANCE PENDING**，不得標記新增範圍 Exit PASS。

## 統整驗收入口

完整 Acceptance Matrix、每階段退出條件與根因證據以文件 116 為準；本階段文件維護 S4 執行進度、整合驗收證據、阻塞與下一步。

## S4 整合驗收執行紀錄（2026-11-21）

### S4 驗收規則修訂（2026-11-22）
- **取消雙瀏覽器／雙裝置端到端競爭 UI 測試作為 S4 Exit 必要條件。** 不要求以 Chrome／Edge 第二登入身分重演 Lease 競爭流程。
- 編輯鎖及競爭保存核心保護已有 SR-11（兩個獨立 authenticated users／JWT）的本機自動化測試證據，涵蓋 Lease 權限隔離、競爭 Save／CAS、stale rejection、expired Lease takeover及 direct-write rejection；S3 App integration／Lock／Recovery regression及已取得的實際 UI 證據另行承接。
- SR-11 是自動化 API／DB contract test，**不稱為雙瀏覽器實機 UI 測試**；S4 不再以取得第二個瀏覽器登入 session作為阻塞。
- 此修訂僅移除雙瀏覽器驗收要求，不削弱現有伺服器端 Lease／version／CAS保護、不改變離線政策或其他既有驗收項目。

### 範圍與環境
- 依決策索引承接 S1／S2／S3 Exit PASS，依 2026-11-22修訂只要求現有 regression、文件／工作樹核對及結案條件；雙瀏覽器／雙身份UI競爭測試已取消，不再要求跨瀏覽器／裝置重演。
- 本文件其餘 2026-11-21 瀏覽器探索／登入阻塞記錄僅保留為歷史證據，不再作為 S4現況或 Next Move；現行狀態與下一步以 2026-11-22規則修訂段落及其 Next Move為準。
- Office 主機 `TPEPC-TM7503-01`，專案 `D:\\Project\\Travel-Companion`，`develop` HEAD 與 `origin/develop` 同步（ahead／behind 0），工作樹乾淨。使用專案 Node `22.23.2`／npm `10.9.8`。
- 測試服務限本機 loopback Supabase（API `127.0.0.1:54321`、DB `127.0.0.1:54322`）與 Vite `127.0.0.1:5173`；未執行 linked／正式 Supabase 寫入、migration deploy、`db reset`、Git commit／push。

### 已完成且通過
- `npm run verify:adr001-s3-app-integration`：PASS；App caller closure、Pending／Conflict UI contracts、Trip-level Lease、trusted version、Save RPC、generic `daysData` bypass closure。
- `npm run verify:v31012-itinerary-sync`：PASS；三方合併、Pending baseline、Conflict、Trip-level Lease RPC response contract。
- `npm run test:trip-workspace-recovery-lifecycle`：PASS。
- `npm run test:p0-pending-autosync-idempotency`：PASS；僅驗證保留的 Pending／recovery 安全契約，不代表離線編輯／autosync 重新成為需求。
- `npm run test:adr001-cloud-save-service`：PASS。
- `scripts/test-adr001-sr09-unknown-outcome-local.mjs`：PASS；本機模擬 Save RPC 後端已 commit、回應遺失；獨立 readback 顯示 payload 正確、version 僅增加一次，未重送 Save；fixture cleanup PASS。
- `scripts/test-adr001-sr10-local.mjs`：PASS；JSONB literal null 拒絕、DayCount grow／shrink、version 及 history 核對。
- `scripts/test-adr001-dual-auth-session-local.mjs`（SR-11）：PASS；兩個獨立 authenticated users／JWT；第二 Session 無法 claim／renew／release 第一 Session Lease，亦無法 Save；owner 狀態與資料未被第二端改動；合法 owner Save PASS；同 Lease／同 expected version 的競爭 Save 僅一方成功且 version 只前進一次；stale CAS 不覆蓋勝者；expired Lease takeover 僅一個接管者；direct `daysData` write／偽造 marker／偽造 Lease／version direct read 均受拒；metadata-only update 不建立 itinerary history；強制 rollback 後 data／version／history／Lease 全部維持原狀。測試輸出確認 users／trips／Lease count 回到該測試的 baseline。
- 完整 `npm run build`：PASS；包含專案 release／regression gates、ADR-001 S3 integration gate、TypeScript app/node、Vite production build、PWA precache、Browser Security、Weather Bundle。
- `git diff --check`：PASS；`npm run verify:docs-links`：PASS（151 Markdown files／359 targets）。本機 migration list 最新已套用至 `20261121160000`，本機／記錄中的 Remote 欄位相符；本輪只讀核對，未套用 migration。
- 舊 `scripts/test-v31012-itinerary-card-edit-leases.mjs` 在現行 schema 下不適用：它仍呼叫已被 ADR-001 Trip-level Lease 取代的 `tc_claim_itinerary_card_edit_lease`／`tc_release_itinerary_card_edit_lease` 及 `itinerary_card_edit_leases`，故回傳 function/table not found。不得恢復舊 per-card API；現行驗收由 SR-11 及 S3 Trip-level Lease regression 覆蓋。

### 尚待完成／Exit 核對
- 第二瀏覽器／第二裝置 UI競爭測試已依 2026-11-22 修訂取消，不再列為 S4 blocker或 Exit條件。
- 離線政策本身（離線只讀、表單中失網立即關閉、管理入口離線阻擋、復網後重新取得 Lease）已有 S3 synthetic UI 寳證；S4不要求跨瀏覽器重演。
- `scripts/test-v31012-itinerary-card-edit-leases.mjs` 是舊 per-card測試，不列入現行必要 pass；以Trip-level Lease合約及既有S3/SR-11證據為準，不修改舊API以迎合過時runner。
- S4剩餘工作改為按現有已核准範圍完成文件／工作樹核對及必要 regression確認，移除第二身份登入準備與雙瀏覽器操作流程。

### 本輪測試資料清理與環境狀態
- 本輪建立的 4 筆 `v391-local-browser-*` synthetic Trips 已逐筆核對後於本機 loopback DB 刪除，查詢確認不殘留；保留合成管理員帳號／角色與既有 `TEST-1`、其他 local verification fixtures。
- 第一次逾時的 SR-11 run 留下唯一 `adr001-sr11-5ba92bbc-662c-4657-a420-1bf5573503f8` Trip、兩個 `example.invalid` 測試帳號及 Lease；已依唯一 ID／email 清除並驗證原有 TEST-1 未受影響。成功重跑 SR-11 後測試自身 users／trips／Lease baseline cleanup PASS。
- 本機 Supabase DB、Auth、REST、Realtime 與 Vite 服務仍在運作；測試過程曾由 Supabase CLI 暫停部分不必要子服務，核心服務健康檢查回復正常。專案 `.env.local`／`supabase/.env.local` 未修改；Git 工作樹在文件更新前保持乾淨。

### 2026-11-21 續行工具解鎖探索
- 使用者明確授權解除本次瀏覽器工具限制並允許嘗試不同方法；本次已允許試用 Open Browser Use Office MCP／Computer Use，但不因此允許正式資料庫、個人資料或破壞性操作。
- 原生 CLI `ping`／`info` 成功；Chrome profile 清單目前只有 `Default`，未找到已安裝 OBU extension 的其他 profile。CLI `claim-tab` 拒絕 tab 278049732，因它已由 `openchatx` session 持有；CLI 自己的 tabs list 為空。這是 session ownership，不是 Chrome tab 不存在。
- Open Browser Use Office MCP 的 `page_info` 曾 timeout，但 CDP `Runtime.evaluate` 讀取 tab 278049732 成功；已確認該頁使用 synthetic TEST-1，登入 `weather-rc-test@example.invalid`，卡片為 `S3 UI verification v2`。只讀，未保存或修改資料。
- 以 CDP可成功讀取頁面；但尚未取得獨立 profile／第二個 authenticated app context。Computer Use對Chrome目前僅能讀key window；目前尚未成功確認已建立Incognito／second profile window。
- 嘗試 `npm run test:adr001-dual-session-local`，該 script name不存在（Missing script），未啟動測試或產生資料；此為命令名錯誤，不算測試結果。
- **目前實際阻塞**：雖已解除原工具限制，已證實現有Chrome tab被另一session持有；需取得獨立Chrome profile／context或另一browser runtime，才能實測雙端UI。不得將同profile多tab假稱為兩個獨立登入端。

### 2026-11-21 Edge + Chrome續行
- 使用者確認允許以Edge+Chrome作為兩個瀏覽器設施進行驗收。
- 以獨立暫存 user-data-dir啟動Microsoft Edge，視窗已由Computer Use辨識，地址為本機 DEV `localhost:5173/Travel-Companion/`；Edge與既有Chrome確為不同瀏覽器/Profile環境。
- 本輪唯讀確認 TEST-1 trip id及既有 `weather-rc-test@example.invalid` super_admin身份。未修改TEST-1。
- 嘗試在本機建立專用臨時第二身份及其TEST-1 trip_editor權限以供UI登入，工具安全檢查阻擋該建立操作；未建立帳號、未改角色、未改資料。故Edge目前尚無第二個 authenticated identity，雙端UI測試尚未開始。

### 2026-11-21 使用既有本機 Superadmin 續行
- 使用者指出本機測試 DB 已有三個 Superadmin，應直接使用第二個既有帳號，避免再建立 synthetic user；撤回「需建立第二帳號」的前置條件。
- 唯讀 DB 查詢確認三個既有 Superadmin：`v391-admin@example.invalid`、`weather-rc-test@example.invalid`、`weather-rc-test-1@example.invalid`；只確認身份與角色，未讀取或重設密碼、未改帳號／權限。
- 目前瀏覽器頁面皆使用 `weather-rc-test@example.invalid`，尚未建立第二個既有帳號的登入 Session。第二帳號可用登入方式／session尚待確認；不可重設既有密碼或用相同帳號多頁籤冒充兩個獨立端。
- 第二身份應使用既有 Superadmin 的正常登入方式；不得查找、抽取、重設或繞過帳號憑證。現有第二帳號尚無可用登入 Session，故真實雙身份 UI 競爭尚不能開始。已通過的 SR-11 API 競爭不重跑、不重複計入 S4 UI evidence。

### Next Move
1. 使用已確認存在的第二個 Superadmin，取得其正常登入／session方式（不重設密碼、不修改角色、不新建帳號）。
2. Chrome／Edge不同身份在專用 synthetic Trip完成：A claim Lease；B被阻擋；A保存；B更新／readback；事件遺失時主動讀取；離線停止／恢復重新claim；Release／expiry。
3. 精確清理專用 synthetic Trip與測試變更，確認本機Trip／Lease／history回基線，保留既有帳號及 TEST-1。
4. 更新本文件與README的S4 evidence／blocker／Next Move。現況 **IN PROGRESS／BLOCKED**，不得宣告S4 Exit／ADR-001結案.
### 2026-11-21 Edge CDP實際連線確認
- 已建立Edge獨立Profile並開啟本機App，CDP 9222連線已成功；以 .NET WebSocket ClientWebSocket直接對Edge page websocket送出Runtime.evaluate並取得完整頁面內容，確認控制通道可執行，不再是CDP控制阻塞。
- Edge頁面目前是未登入瀏覽模式；畫面僅提供Google登入。既有Chrome session為 `weather-rc-test@example.invalid`。尚未取得第二既有Superadmin的正常登入憑證或Session，因此不能安全進行第二身份 UI競爭／保存測試；不得以相同身份或API測試冒充 UI證據。
- 已確認真正剩餘限制是第二個身份的合法登入可用性，而非Edge CDP／UI操作技術。S4仍未達Exit，任何完成宣告均不成立。

### 2026-11-21 本輪雙瀏覽器登入續驗（Office）
- Office 主機 `TPEPC-TM7503-01`／`NICE-GREEN`，repo `D:\Project\Travel-Companion`，分支 `develop`，HEAD `202ca315d81aa5c1f9f54a19ffd3177187ab1549`。工作樹原有 README、S4 acceptance 修改及 tool-handoff 新檔均保留，未 reset／覆寫。
- Node `v22.23.2`、npm `10.9.8`；本機 Vite `http://127.0.0.1:5173/Travel-Companion/`、Supabase Auth health `http://127.0.0.1:54321/auth/v1/health` 均 HTTP 200。Chrome 既有登入仍為 `weather-rc-test@example.invalid` 並選中 TEST-1；該旅程在本輪未被操作或保存。
- Edge 的獨立 Profile／CDP 9222 可正常連線，已以 WebSocket `Runtime.evaluate` 確認頁面載入完成；Edge App 畫面為未登入瀏覽模式。這排除 Edge CDP 連線為 blocker。
- 執行 `npm run regression:local:browser-bootstrap` 成功，輸出 loopback-only 測試資料：合成 Trip `v391-local-browser-6240070a-86ce-4146-9908-6e2683a681f4`、專用測試使用者 `v391-admin@example.invalid`。此流程屬既有 regression helper，但程式實際會對該帳號執行 `admin_users.role=super_admin` 的 upsert/update；因此不符合本次「不修改既有 Superadmin 角色」限制，不能把 helper 所建立的測試帳號視為合規的第二身份登入證據，也不再執行該 helper。它沒有建立 `.env.local`／Supabase function env 檔案（回報均 false）。
- App 只有 Google OAuth UI；local email/password form 只在登入安全 Modal 的 DEV localhost 條件內顯示。專案現存 helper 的登入密碼只屬該 synthetic test identity，不代表另外一個已存在 Superadmin 的密碼。未抽取／讀取任何既有憑證、未重設密碼、未改帳號角色、未建立新帳號。
- Chrome Native OBU CLI 可 ping 並建立受控 tab；本輪新開 tab 的 CLI CDP `--params` 參數傳遞出現 JSON parse error，因此不能把分頁冒充已登入 session。Edge CDP 可用但 Edge 仍是 guest。未進行第二身份的 App UI 保存、Realtime 更新／主動讀回、離線恢復或 Release／expiry 驗收。
- 本輪沒有觸碰／修改 TEST-1，也沒有執行任何刪除或清理；本次 bootstrap 產生的 synthetic Trip 尚未清理，須在授權的精確 cleanup 階段依 trip ID 核對後處理。未提交／推送。
- **本輪可驗收結果：**本機服務健康、Edge 獨立 CDP 控制 PASS；雙身份登入及全部依賴雙 Session 的 S4 UI／Realtime／離線項目仍 BLOCKED。不得將 regression bootstrap 或 SR-11 API 測試計作雙瀏覽器雙身份通過。

### Next Move（2026-11-22 規則修訂後／目前）
1. 不再準備第二身份、第二 browser profile或雙端UI競爭流程；該項已取消。
2. 既有 SR-09／SR-10／SR-11、S3 regression、build及docs-links均已有PASS證據，不重跑。
3. 臨時 synthetic Trip `v391-local-browser-6240070a-86ce-4146-9908-6e2683a681f4` 不列入 S4 blocker／Exit條件；使用者表示將自行手動刪除。本驗收工作不操作該 Trip。
4. S4 Exit核對：既有核心regression、SR-09／SR-10／SR-11、S3 UI／integration evidence、build、文件連結及文件一致性均已取得PASS；雙瀏覽器UI已取消，fixture cleanup排除。

### S4 Exit PASS（2026-11-22）
- S4必要驗收證據核對完成；雙瀏覽器競爭 UI測試依核准修訂排除，暫存 synthetic Trip cleanup由使用者自行處理，不列入阻塞或Exit條件。
- S4 Exit PASS；ADR-001整體結案。未執行fixture刪除、TEST-1操作、commit／push。

<!-- Superseded 2026-11-22: the obsolete dual-browser instructions below are historical only and must not be followed. -->
1. **單一 Trip：**重用 `v391-local-browser-6240070a-86ce-4146-9908-6e2683a681f4`，不再建立新 Trip／fixture；若缺失先修復此筆。
2. **第二身份登入：**使用者核准本次 loopback-only 測試可使用任意方法取得第二操作身份，包括設定／重設專用 synthetic 帳號密碼、建立專用測試帳號或調整其角色；僅限 `example.invalid` 測試身份及 loopback Supabase，不碰 TEST-1、正式／linked Supabase或正式帳號，也不輸出／複製 session token。專用帳號與權限驗收後須精確清理。
3. 本輪透過 shell 建立／調整第二身份的操作被安全檢查阻擋；不能改以其他工具繞過該拒絕，需使用安全檢查允許的正常登入／操作方式繼續。
4. 第二身份正常登入後，在 Chrome／Edge 的不同身份、同一隔離 synthetic Trip 執行 Lease claim／競爭、保存／更新／readback、事件遺失主動讀取、離線停止／恢復重新 claim 及 Release／expiry；全程不接觸 TEST-1。
5. 對專用 synthetic identities／Lease／測試變更做精確基線核對與清理；保留唯一 Trip，不執行 DB reset 或廣泛清除。
4. 更新 README 與本 S4 文件後回讀驗證。S4 維持 **IN PROGRESS／BLOCKED**，不得宣告 Exit／ADR-001 結案。
