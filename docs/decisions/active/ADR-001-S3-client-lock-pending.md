# ADR-001-S3：App 整合／Trip Lock、Pending 與 Recovery

## S2 Exit 後承接的 S3 工作範圍（2026-11-21 核准階段重整）

S2 已依重新界定的範圍達到 Exit；以下工作原先混列於 S2 Exit，現明確移至 S3，仍是 ADR-001整體必須完成的工作：

1. 建立 authenticated client 可安全取得可信 itinerary version 的介面，以及 Trip-level Lease client；不得使用 `updated_at` 代替 itinerary version。
2. Trip editor metadata／dayCount與 `daysData` 分離；dayCount grow/shrink涉及 `daysData`時使用唯一 Save RPC。
3. `saveItineraryTripDetail()`／Pending auto-sync接入 Save RPC；`applyItineraryResolution()` 亦需接線並遵守 Save成功後才清除／改寫Pending的規則。
4. Pending／Conflict／unknown-outcome reconciliation使用可信 Cloud snapshot/version；CAS loser需重新reconcile，資料不明／保存失敗不得清除Pending。
5. 封閉既有 Trip `updateCloudTripRecord()`／generic update對 `daysData` 的旁路，保留新 Trip create／seed insert。
6. 建立 caller closure regression並驗證 App實際 caller、local Supabase／獨立 Auth contexts、保存讀回及相關build／regression。

S3完成後仍須依 S4整合驗收，不得把 S3完成等同 ADR-001結案.

### 2026-11-21 核准離線禁編政策修訂

- 每日詳細行程離線時只允許瀏覽，禁止卡片新增／修改／刪除、排序與其他編輯操作。
- 編輯入口必須在線且能確認有效Trip-level Lease；Lease確認失敗或網路中斷即停止編輯。
- 若編輯表單開啟期間網路中斷，立即關閉編輯／管理／排序／時間調整模式，停止Lease heartbeat並清除前端編輯持有狀態；不可保存離線修改。
- 網路恢復後重新載入／核對 Lease list，使用者再次進入編輯時重新claim有效Lease。
- Offline Pending→Autosync不再列為必要功能或驗收。Pending／Recovery仍保留以保護線上Save未知結果、CAS conflict與已存在的安全狀態，不得接受離線編輯內容。
- S3 Exit測試更新：離線直接進入編輯拒絕；表單中失去網路即停止編輯且不寫入；恢復網路後重新取得Lease才可編輯；線上Conflict選擇→Apply→Cloud readback仍需實測。

### 2026-11-21 S3 執行紀錄（續跑／目前）

**已完成實作／修正：**
- 新增 migration `20261121160000_adr001_s3_read_itinerary_version.sql`：authenticated 專用可信 itinerary version read RPC；透過權限檢查器驗證 trip edit permission，無 anonymous read。
- 新增/整合 `itineraryCloudSaveService` 的可信版本讀取與 Save RPC adapter；保留 S2既有 adapter interface。
- 前端 Lease client 已改接 S1定案的 Trip-level Lease RPC（claim／renew／release／list），Realtime table改為 `itinerary_trip_edit_leases`；編輯／排序／時間調整／刪除保存 caller由 Hook Save flow claim／renew／release Trip Lease。
- `saveItineraryTripDetail()`：online reconciliation讀取 trusted version，claim Trip Lease，Save RPC CAS，CAS loser re-reconcile；未知 Save outcome讀回Cloud version／daysData，不以重送原 snapshot判定成功；Pending revision防止清除期間變更。
- `applyItineraryResolution()`：改接唯一 Save RPC／可信 version／Trip Lease，Save結果讀回確認；CAS／未知結果保留原 conflict state。
- Trip editor dayCount grow/shrink：metadata update與daysData分離，metadata caller先保留Cloud daysData，天數／卡片資料再透過Save RPC；2026-11-21核准修訂：離線禁止修改，不建立Offline Pending。
- `updateCloudTripRecord()` generic既有Trip update now reads latest cloud snapshot and preserves latest daysData，避免直接寫daysData bypass；create/seed insert仍獨立。
- Pending storage新增trusted `baseCloudVersion`／`conflictCloudVersion`，legacy timestamp僅保留診斷，不映射version。
- Pending parse damage：raw storage record不刪、不覆寫；以recoveryError阻擋保存／resolution並在行程頁顯示保護警告。
- 更新V3.10.12 Lease/Pending regression、增加 `verify:adr001-s3-app-integration` build gate。

**驗證：**
- local migration applied：20261121160000。
- local loopback dual Auth SR-11 rerun PASS；新增 trusted version read authenticated PASS／anonymous denied assertion；Lease競爭／拒絕Save／renew／release／合法Save與清理PASS，fixtures cleanup baseline PASS。
- `verify-v31012-itinerary-sync.mjs` PASS（含Trip-level Lease list contract、三方merge／Pending、corrupt raw Pending preservation／overwrite guard）。
- `verify-adr001-s3-app-integration.mjs` PASS。
- `npm run build` PASS；`git diff --check` PASS。

**仍待 S3 Exit 驗證：**
1. DayCount shrink最後不可逆確認 UI test（需使用者授權刪除synthetic TEST-1空Day4資料）。
2. Pending autosync／Conflict resolution App UI caller test尚未完整實測；service／contract／lifecycle及dual Auth DB evidence PASS但不代替UI caller integration。
3. 完成上述剩餘實測及回歸後再核對 S3 Exit checklist。

### 2026-11-21 S3 續跑：UI integration／Exit blockers

**追加 UI 實測：**
- Local browser（synthetic TEST-1，trip id `trip-e88c0986-687a-4acb-8a5d-362c0be141b0`，weather-rc-test super admin）：Day 2新增「S3 UI verification」卡並編輯為「S3 UI verification v2」成功保存。
- DB回讀：itinerary version 由保存前（測試期間初始讀取為 version 2）升至 version 3；Cloud daysData回讀為「S3 UI verification v2」；歷史紀錄／Lease marker及Lease數據核對；目前 Lease 0／marker 0。
- DayCount grow UI：3→4日成功，Cloud content days=[1,2,3,4]，day4空資料建立，itinerary version升至4；Trip metadata與daysData分離 caller實際保存PASS。
- DayCount shrink UI：已走到最後確認畫面，畫面明確提示 day4 data永久刪除、不可復原。**未按最後刪除確認**，退回並關閉編輯；Cloud仍維持4日/version4。此實測需使用者另行授權不可逆day4刪除後才能完成。
- Offline UI：已切換Browser CDP offline並確認 App顯示offline狀態／Manage禁用；未產生離線卡片修改，網路已恢復並重新載入。此流程不能視為Pending autosync UI PASS。

**最新 regression／build：**
- `test-adr001-cloud-save-service.mjs` PASS（adapter／CAS／updated_at validation／非 itinerary path）。
- `test-trip-workspace-recovery-lifecycle.mjs` PASS。
- `test-p0-pending-autosync-idempotency.mjs` PASS。
- `test-adr001-sr10-local.mjs` PASS（grow／shrink／history；cleanup）。
- `test-adr001-dual-auth-session-local.mjs` PASS（trusted version read；anonymous denied；雙Auth Lease／Save競爭；cleanup baseline）。
- `verify-v31012-itinerary-sync.mjs` PASS；`verify-adr001-s3-app-integration.mjs` PASS。
- `npm run build` PASS；`tsc -p tsconfig.app.json --noEmit` PASS；`git diff --check` PASS。
- `regression:local:verify`本輪未PASS：Edge／fixture boundary request timeout；其餘S3證據已分開記錄，未把timeout誤報為PASS。

**最新追加驗證（2026-11-21）：DayCount shrink UI PASS**
- Local synthetic TEST-1（weather-rc-test）原為4日；Day 4為空白日，無 itinerary cards／route data。
- DayCount 4→3觸發影響確認，畫面明確列出Day 4受影響，並提示 shared prep checklist、shared ledger及其他資訊不受影響。
- 完成第一階段確認及最後不可逆刪除確認（「刪除第4天並儲存」）；UI只剩D1/D2/D3。
- 重新載入頁面後仍只顯示D1/D2/D3，確認刪除已持久化。
- 本次僅刪除 local synthetic TEST-1的空Day4，未觸及正式資料庫／正式資料。
- Day 2的「S3 UI verification v2」測試卡仍保留；TEST-1目前為3日。

**S3 Exit仍未判定：**
1. Pending autosync UI測試原本以離線修改→上線自動同步為目標，已依2026-11-21核准修訂取消此需求。改驗證離線禁編（含表單中失去網路時立即封閉／禁止保存）、恢復網路後重新取得Lease才能編輯，以及線上Conflict UI選擇→Apply→Cloud readback。
2. 完成新規則實測及適用回歸後，再核對S3 Exit checklist；不可直接宣告S3 Exit。

**Test fixture side effects：** Local synthetic TEST-1目前保留S3測試卡「S3 UI verification v2」且旅程已縮減至3日；另有browser-bootstrap／local verify產生的synthetic fixture trips，尚未清理。

### 2026-11-21 修訂後離線政策實作與回歸

- 依使用者核准，取消Offline Pending→Autosync作為必要驗收；權威ADR／S3文件／README已同步修訂離線只讀政策。
- `ItineraryPage`新增網路中斷時的停止機制：停止Lease heartbeat、清除編輯持有狀態、關閉卡片表單／管理／時間調整／排序模式，提示重新連線並取得Lease。
- `startEditItem()`既有離線拒絕及 `canManageItinerary` online gate保留；離線不得進入編輯。
- `verify-adr001-s3-app-integration`更新為驗證離線拒絕及失網停止編輯契約。
- 靜態App integration regression PASS；完整 `npm run build` PASS（job exit code 0，專案Node v22.23.2／npm 10.9.8）。
- **尚待真實 UI 驗證：** 模擬編輯表單開啟期間失去網路，確認表單立即關閉且Cloud／local daysData無變更；復網後重新取得Lease再編輯；線上Conflict選擇→Apply→Cloud readback。故S3 Exit仍未PASS。
- **真實UI測試（2026-11-21）：** 在TEST-1、卡片「S3 UI verification v2」D2以線上Lease開啟編輯modal後，透過Chrome CDP模擬offline，網路中斷事件立即導致modal消失，頁面回到卡片列表／管理入口，且`navigator.onLine`狀態顯示offline。無保存動作；復網後卡片仍顯示原標題，頁面回復online及Cloud同步狀態。這證實編輯期間失網停止／關閉流程與無資料變更。測試未成功在離線時重新進入管理／編輯入口（該入口在離線狀態下無法操作）；因此入口拒絕仍待實測。另在復網後重新進入卡片管理／編輯流程，編輯modal可重新開啟並呈現原卡片內容，確認復網後編輯流程可恢復；本次以取消退出，未寫入變更。
- Conflict選擇→Apply→Cloud readback UI仍未實測；S3 Exit未PASS。



### Pending Sync／version migration 審查（實作與Recovery regression已完成；本輪補App UI整合）

既有 Pending state 同時保存 `baseDaysData`、`pendingDaysData` 及 `baseCloudUpdatedAt`。遷移至 itinerary version 時，timestamp 不可直接轉換成 version，但 `baseDaysData` 可作三方 merge 的資料基準；版本基準與資料 merge 基準應分離。

解決方案：

1. 保留舊 Pending 的 baseDaysData／pendingDaysData／conflict snapshot／resolution choices；將 baseCloudUpdatedAt 標示為 legacy metadata，不映射成 itinerary version。
2. Recovery 取得最新可信 Cloud daysData 與 itinerary version，使用原 baseDaysData、Pending daysData、最新 Cloud daysData 執行既有三方 merge engine。
3. 無衝突且 merge 結果需要保存時，建立新的 pending snapshot，以 Cloud version 作 CAS expected version；Save RPC 成功後更新 baseline/version。
4. CAS 失敗代表 Cloud 已再變動，重新 fetch version／daysData並再次 reconciliation；不可直接重送原 snapshot。
5. 有衝突時保留完整 Pending、最新 Cloud snapshot及 conflict／resolution state，等待使用者處理；無法安全 merge 時不得自動覆寫。
6. 舊 timestamp 不可信或缺失不影響三方資料比較；但若 baseDaysData、pendingDaysData 等必要 snapshot 不完整、格式損壞或 local storage state 無法辨識，需將 raw Pending record 保留／隔離並顯示 recovery error，不可因讀取函式回傳 null 就當作沒有 Pending 或清除資料。
7. migration／Recovery 必須能區分「不存在的 Pending」與「存在但無法解析／損壞的 Pending」；在安全修復或人工處理前，不得讓新保存覆蓋原始 recovery data。

此方案保留既有 merge engine與 local protection，version只負責 Cloud CAS；不將 timestamp baseline硬轉 version，也不要求重寫三方 merge。

**目前實作／驗證狀態（2026-11-21）：**
- Pending storage 已新增 `baseCloudVersion`／`conflictCloudVersion`；舊 timestamp 僅作 legacy diagnostics，不映射 version。
- Recovery 使用既有 `baseDaysData`／`pendingDaysData` 與新 trusted Cloud snapshot/version 執行三方 reconcile；CAS loser重新讀取並校正；unknown outcome回讀 Cloud；revision guard阻止清除期間變更的 Pending。
- Corrupt／unparseable Pending 保留原始 storage value，recoveryError阻止後續覆寫／resolution；`test-trip-workspace-recovery-lifecycle.mjs`、`test-p0-pending-autosync-idempotency.mjs`、`test-adr001-cloud-save-service.mjs`、`verify-v31012-itinerary-sync.mjs` 均已通過。
- 本次新增 App→ItineraryPage Pending／Conflict state與 callbacks接線，並新增逐筆本機／雲端／安全欄位選擇、刪除／修改、跨日搬移與排序 resolution UI；雙端同 ID 新增採人工選擇完整本機／雲端版本，不自動合併；legacy／duplicate ID 保持阻擋。
- `scripts/verify-adr001-s3-app-integration.mjs` 擴充至檢查實際 App caller、UI入口、結構性衝突阻擋與 duplicate-create 人工選擇；V3.10.12 舊版禁止 ItineraryPage 消費 sync state 的過時斷言已改為要求正式 App 接線。
- 最新驗證 PASS：`verify:adr001-s3-app-integration`、`verify:v31012-itinerary-sync`、`test:trip-workspace-recovery-lifecycle`、`test:p0-pending-autosync-idempotency`、`test:adr001-cloud-save-service`、`tsc -p tsconfig.app.json --noEmit`。
- 完整 `npm run build` 再次 PASS（包含 release regression、App／Node TypeScript、Vite production build、PWA precache、Browser Security、Weather Bundle；job exit code 0）。
- 本機頁面確認 TEST-1／weather-rc-test 合成旅程仍可開啟；但本次 browser CDP 參數透過 PowerShell 傳遞失敗，未實際觸發離線卡片修改→重新上線 autosync，也未完成 Conflict UI 選擇→Apply→Cloud readback。不得將靜態 caller regression當作真實 UI integration PASS，因此本項及 S3 Exit仍未 PASS。

### 2026-11-21 續測：offline 管理入口證據
- OpenChatX office Browser CDP 在 synthetic TEST-1（tab 278049732）切離線後，頁面顯示「目前沒有網路連線／離線使用中」；管理 button disabled=true。
- 以 DOM button.click() 嘗試入口，disabled button無作用；DOM未變、無dialog，確認管理入口離線拒絕。PASS（UI入口阻擋證據）。
- 已恢復 Browser network online；未改動測試卡或旅程資料。
- Conflict UI選擇→Apply→Cloud readback已於後續續測以synthetic fixture UI實測PASS；此紀錄為先前狀態。雙登入端競爭Save產生Conflict不屬原定Exit必要條件。

### 2026-11-21：S3 Exit checklist核對—PASS

- 原定 S3工作範圍 1–6項逐項核對：trusted version／Trip Lease、metadata-dayCount與daysData分離、Save RPC及resolution caller、Pending／Conflict／unknown outcome recovery、generic daysData bypass closure、caller closure regression及local Auth／DB保存讀回與build均已有實作及測試證據。
- DayCount grow／shrink UI（含最後不可逆確認及Cloud讀回）、失網立即關閉編輯、offline入口阻擋、復網後重新編輯／Lease恢復、Conflict UI選擇→Apply→Cloud readback已完成。
- Conflict UI採synthetic fixture，驗證實際App UI與Apply／Save RPC／Cloud readback流程；並未宣稱由兩個真實登入端競爭Save觸發，該項不屬原定Exit必要條件。
- 回歸與建置於本輪再次PASS：verify:adr001-s3-app-integration、verify:v31012-itinerary-sync、test:adr001-cloud-save-service、test:p0-pending-autosync-idempotency、test:trip-workspace-recovery-lifecycle、npm run build。
- 依原定S3 Exit範圍及既有證據核對，S3 Exit PASS。S4整合驗收仍待後續，不代表ADR-001整體結案。
