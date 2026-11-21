# ADR-001-S2：Cloud Save 整合與 Repository 接線


### Save RPC 整合架構審查紀錄（2026-11-20）

本輪核對既有 migration／trigger 契約，確認：

- V3.5.2 database function hardening 已建立 private schema helper、API role 權限撤銷、固定空 search_path 與 public tc_ SECURITY DEFINER 禁止基準；新 RPC／helper 不得降低此基準。
- V3.6.2 historical Trip trigger 是既有 shared-data 寫入限制，依 stored Trip 與 authenticated role判定；Save RPC 不得以 SECURITY DEFINER、Lease 或受控授權豁免此限制。
- itinerary history trigger 在 content 更新時精準比較 daysData，並使用 advisory transaction lock及歷程保存；RPC 必須正常經過此 trigger，不得停用／bypass。
- visibility/email-map trigger亦會在 trips 更新時執行。Save RPC只更新 daysData並以DB當下content精準替換，需保留此trigger契約與其拒絕／正規化行為。
- 既有歷史限制與其他欄位trigger屬各自原有資料安全／功能契約，不等同將其他功能納入 Trip Edit Lock；ADR-001的鎖仍只保護每日詳細行程。

**整合方案補充（審查基準，非實作授權）：** Save RPC須在同一交易中依固定順序鎖定及驗證 Lease、version，之後更新 Trip 的 daysData，讓既有 Trip row locking、history trigger/advisory lock及其他 trigger自然執行；失敗一律交易rollback。所有新增SECURITY DEFINER入口需空 search_path、schema-qualified reference、明確REVOKE／GRANT，且不得直接暴露私有helper。正式驗收仍須驗證實際Supabase role／auth context及兩個獨立Auth context。

**本輪結論：** 未發現需變更ADR-001核心決策的證據；上述既有Trigger契約已明確列入Save RPC整合驗收。尚未進行正式RPC或正式資料庫實作。

詳見文件 116 的 SR-01 至 SR-12 Acceptance Matrix 與施工藍圖；此處只保留 Cloud／Repository 接線的階段進入及退出條件。

## 2026-11-21 S2 接線執行紀錄

### 切片 1：Cloud Save RPC service 與 Repository 入口

**範圍**
- 新增 `src/services/itineraryCloudSaveService.ts`：封裝唯一 `tc_save_itinerary_days` RPC 呼叫、參數映射、回應格式驗證、版本衝突錯誤及成功確認時間。
- `src/services/tripRepository.ts` 新增 `saveItineraryDaysWithCloudSync()`，向上提供專用保存入口；不改動原通用 Trip save 行為。
- 新增 `scripts/test-adr001-cloud-save-service.mjs`，並於 `package.json` 增加 `test:adr001-cloud-save-service`。

**驗證環境與結果**
- 專案：Travel-Companion，分支 `develop`；主機 `TPEPC-TM7503-01`／`NICE-GREEN`，使用已確認的公司端專案 Node 路徑 `C:\\nvm\\v22.23.2`，Node `v22.23.2`、npm `10.9.8`。
- 執行：`node --experimental-strip-types --no-warnings scripts/test-adr001-cloud-save-service.mjs`。
- **PASS**：有效 RPC 成功回應與欄位 mapping、CAS loser 轉成 `ItineraryCloudVersionConflictError`、RPC error 傳遞、錯誤回應格式拒絕、缺少更新確認時間拒絕、無效 expected version 拒絕。
- 輸出：`ADR-001 S2 Cloud Save RPC service contract tests passed.`，exit code 0。
- 工作樹原有變更：`package.json`、`src/services/tripRepository.ts` 為 modified；`scripts/test-adr001-cloud-save-service.mjs`、`src/services/itineraryCloudSaveService.ts` 為 untracked。本輪保留這些既有工作，未 commit／push。

**完成判定**
- **切片 1：PASS（service contract／Repository adapter 層）。**
- 切片 1 結束時尚未接入 App callers，`saveItineraryDaysWithCloudSync()` 沒有呼叫端；Checklist、Other Info、Trip editor、Pending 自動同步及 conflict resolution 仍共用舊保存入口。此為切片 1 當時的狀態，切片 2 已完成 Checklist／Other Info folders 分流。
- 本切片只測 mock Supabase RPC contract，未連 local Supabase，未驗證實際 RPC/Auth/Lease/DB；非 itinerary caller 隔離由切片 2 另行驗證。

### 切片 2：Checklist／Other Info 非行程卡片保存隔離

**範圍**
- 新增 `src/services/nonItineraryTripCloudSave.ts`，以純 service contract 分離非行程欄位的 read-latest／merge／CAS 流程。
- `src/services/tripCloudService.ts` 新增 `updateCloudTripNonItineraryFields()`，只允許 `checklistData`、`otherInfoFolders` patch；先讀取最新 Cloud Trip，再保留該筆最新 `daysData` 組成更新資料，以原 Cloud `updated_at` 作 row CAS。
- `src/services/tripRepository.ts` 新增 `saveTripNonItineraryFieldsWithCloudSync()`，保留既有離線本機保存行為；線上時使用專用非行程欄位入口。
- `useTripWorkspace.saveCurrentTripDetail()` 的目前兩個 callers 已分流：Checklist 明確傳入 `"checklist"`，只送 `checklistData`；Other Info folders 明確傳入 `"other-info-folders"`，只送 `otherInfoFolders`。不再使用布林值推斷更新類型，也不再呼叫通用 `saveTripRecordWithCloudSync()`。

**驗證**
- 專用測試：`node --experimental-strip-types --no-warnings scripts/test-adr001-cloud-save-service.mjs`。
- **PASS**：Save RPC adapter 欄位 mapping／成功／CAS loser／RPC error／malformed response；非行程 patch allow-list；拒絕空 patch 與 `daysData` patch；保留 read-latest 的雲端 `daysData`；傳遞讀取到的 `updated_at` 至 CAS adapter；缺少 Cloud row 時不執行 CAS；CAS 競態錯誤向上傳遞。
- 輸出：`ADR-001 S2 Cloud Save and non-itinerary Repository contract tests passed.`，exit code 0。
- 完整 `npm run build`：exit code 0；既有 verify scripts、`tsc -p tsconfig.app.json --noEmit`、`tsc -p tsconfig.node.json --noEmit`、Vite production bundle、PWA generation、postbuild browser-security 與 weather-bundle checks 全部通過。
- 第一次 build 因純 service 泛型與 `StoredTripRecord` 型別不相容而失敗；修正為使用具名 `StoredTripRecord` 後重跑，完整 build PASS。第一次失敗已留在本輪執行紀錄中，最終以修正後 exit code 0 為準。
- 沒有執行 Supabase migration、local DB write、正式資料庫操作或部署；沒有 commit／push。

**完成判定與限制**
- **切片 2：PASS（Checklist／Other Info folders caller 分流與 Repository contract）。**
- 非行程保存改用雲端最新 `daysData` 做 payload，讀取至寫入之間若 itinerary Save 已推進 Trip row `updated_at`，CAS 會失敗而不覆寫卡片；此情況目前不自動重試，保留 conflict 讓 caller 處理。線上保存成功後，Hook 也改採 repository 已回寫的最新本機快取更新畫面狀態，避免將舊 `daysData` snapshot 再放回 UI。
- 此切片並未涵蓋一般 Trip metadata／`dayCount` 編輯；`updateTripRecord()` 會依 dayCount 裁切 `daysData`，不可當純 metadata 更新。
- 既有 Trip 的非版本 upsert 分支已封鎖；`saveTripRecordWithCloudSync(..., enforceVersion=false)` 現在明確拒絕，不再呼叫 Cloud upsert。新建 Trip 維持獨立 `insertCloudTripRecord()` insert，沒有受到影響。契約測試驗證拒絕舊分支及保留 create insert；完整 `npm run build` exit code 0。
- callers 盤點後尚有三個版本化舊保存 caller：Trip editor（包含 dayCount grow/shrink）、Pending 自動同步、衝突解決。均為既有 itinerary `daysData` 寫入，不可轉成 metadata 更新；尚待接上 Save RPC。
- 目前測試使用純 service contract／mock adapter，未連 local Supabase 驗證實際 RLS／Trigger／Auth／CAS；亦未做真實 App 多裝置競態驗收。

### 2026-11-21 核准的 S2／S3 階段責任修訂

**修訂理由：** 原 S2 Exit 將完整 App caller closure、Trip-level Lease／可信 version client、Pending／Conflict／Recovery整合納入門檻；但這些工作本質上屬於 S3 client integration，造成階段順序倒置，要求 S2先完成 S3基礎能力才能 Exit。經使用者核准，重新界定階段責任，不改變 ADR-001核心安全／資料契約。

**S2 保留並以此判定 Exit：**
1. Save RPC service／Repository adapter contract 已建立且 contract test PASS。
2. 非 itinerary Checklist／Other Info save path 已分流、allow-list／read-latest／CAS保護 contract測試 PASS。
3. 舊有既有 Trip 非版本 upsert bypass 已封鎖，專用新 Trip create insert保留，並有 contract regression證據。
4. S2所需既有 sync／recovery／非 itinerary regression、local DB SR-10 grow/shrink、SR-11 dual Auth DB驗證證據完成核對，且不得將 DB基礎證據誤稱為 App integration PASS。
5. S2 Exit不要求 App caller已全部接線、Trip-level Lease／可信 version client、Pending／Conflict Save RPC整合、Recovery／UI或跨瀏覽器整合驗收；這些移至 S3，仍不得繞過唯一 daysData Save RPC／Lease／version核心契約。

**移交 S3 的未完成項（仍是 ADR-001 必須完成的工作，不是取消）：**
- Trip editor metadata／dayCount與 daysData拆分；dayCount grow/shrink走唯一 Save RPC。
- `saveItineraryTripDetail()`／Pending auto-sync與 `applyItineraryResolution()` 接線到 Save RPC，並以可信 version及Trip-level Lease client協調。
- Pending／Conflict／unknown-outcome lifecycle：Save明確成功才清除／改寫Pending；CAS loser或未知結果保留資料並reconcile。
- 封閉既有 Trip `updateCloudTripRecord()`／generic update daysData寫入旁路，保留 create／seed insert。
- caller closure regression、實際 App／local Supabase整合測試及相關 build／回歸。

S2 Exit僅依以上 S2保留範圍逐項核對，不因 S3移交項未完成而阻塞或預先宣告 S3 PASS。

### 2026-11-21 S2 未完成驗證續跑紀錄

**執行環境**
- 主機 `TPEPC-TM7503-01 / NICE-GREEN`；Node.js `22.23.2`（`C:\\nvm\\v22.23.2`）、npm `10.9.8`。
- Local Supabase loopback `http://127.0.0.1:54321` 正常；migration list 顯示至 `20261120140000` 的現行 migrations 已套用。未連正式 Supabase、未執行 migration、未部署。
- 開始時 Git `develop...origin/develop`，HEAD `93f7d56`，工作樹乾淨；本輪沒有程式碼修改、沒有 commit／push。

**本輪重新執行結果**
- **S2 service／Repository contract：PASS。** `node --experimental-strip-types --no-warnings scripts/test-adr001-cloud-save-service.mjs` exit 0；覆蓋 Save RPC adapter 參數與回應、CAS loser、錯誤格式、非 itinerary patch allow-list、read-latest 保留最新 daysData 及 CAS 競態傳遞。
- **Pending auto-sync idempotency：PASS。** `scripts/test-p0-pending-autosync-idempotency.mjs` exit 0。
- **Workspace recovery lifecycle：PASS。** `scripts/test-trip-workspace-recovery-lifecycle.mjs` exit 0；Session Ready、offline guard、event trigger、in-flight 去重、failure pending retention、success clearing、cleanup 通過。這是既有生命週期契約測試，不等於 S3 應用層 Pending→Save RPC 已接線。
- **Itinerary sync contract：PASS。** `scripts/verify-v31012-itinerary-sync.mjs` exit 0；merge、pending baseline、conflict、Lease RPC response 契約通過。
- **Trip version recovery：PASS。** `scripts/verify-v398-trip-version-recovery.mjs` exit 0。
- **非 itinerary regression：PASS。** `scripts/verify-v3917-rc2-sync-boundaries.mjs` 及 `scripts/verify-v3917-rc3-sync-authority.mjs` 均 exit 0。
- **SR-10 local Supabase grow/shrink：PASS。** `scripts/test-adr001-sr10-local.mjs` exit 0；isolated fixture 的 daysData grow 使 itinerary version `1→2`、shrink `2→3`，讀回內容一致，history 共 3 筆；JSONB literal null 被拒絕。這證明現有 DB Save RPC 支援 grow/shrink 的 daysData payload，不代表 App Trip editor caller 已接線。
- **SR-11 dual Auth local integration：PASS。** `scripts/test-adr001-dual-auth-session-local.mjs` exit 0；本輪實際建立兩個獨立 Auth user/JWT context，A 取得 Trip Lease、B 無法 Claim／Save／Renew／Release，A 合法 Save 成功；結果 `result=PASS`、`SR-11 cleanup PASS`。先前一次 30 秒前景等待轉 durable job 後未取得 stdout，隨後在確認 fixture 已不存在及基線回復後，重新以 120 秒前景預算成功完成。本次最終 DB 基線：Auth users 4、Trips 3、Leases 0、itinerary versions 3、authorization markers 0；既有 history 1，沒有本輪殘留 fixture。

**Caller／旁路 closure 核對結果（尚未通過）**
- `src/hooks/useTripWorkspace.ts` 的 `updateTrip()`（Trip editor，包含 dayCount grow/shrink）仍呼叫 `saveTripRecordWithCloudSync()`。
- `saveItineraryTripDetail()` 的線上 reconcile/save 路徑仍呼叫舊 `saveTripRecordWithCloudSync()`；pending auto-sync effect 仍呼叫此入口，因此舊 timestamp row CAS 還在實際 itinerary pending 路徑。
- `applyItineraryResolution()` 仍呼叫 `saveTripRecordWithCloudSync()`，沒有連到 `tc_save_itinerary_days`。
- `src/services/tripCloudService.ts` 的 `updateCloudTripRecord()` 仍把整個 Trip payload（包含 daysData）經 `trips.update()` 寫回；目前 `src/services/tripRepository.ts` 的舊 versioned path 仍能呼叫它。`upsertCloudTripRecord()` 本體仍存在，雖目前只保留專用新建流程／非版本既有 Trip 分支已拒絕，但通用寫入 API 的既有 Trip daysData 旁路尚未完全收斂。
- `src/services/itineraryCardEditLeaseService.ts` 仍是 card-level lease client；尚未找到 Trip-level Lease client。`itinerary_trip_versions` 已 REVOKE authenticated 讀取權限，也未找到可信 itinerary version read adapter。不能使用 `updated_at` 作替代版本。
- 因以上證據，三個 itinerary caller、dayCount metadata/data 分離、通用 daysData 旁路封閉及 caller closure regression test 均仍未完成。S3 必要的 trusted version／Trip-level Lease client 是明確相依，不得於本輪以 mock／時間戳代替實作或宣稱通過。

**S2 Exit 判定**
- **原始紀錄（修訂前）：S2 尚未達 Exit。** 此判定由 2026-11-21 核准的階段責任修訂取代；原始證據不刪除。
- 未執行完整 `npm run build`：本輪沒有程式修改；先前切片 2 build PASS 證據仍有效，但不代替日後 caller 接線後的整合 build。
- 未進行真實兩個瀏覽器 UI profile 操作；未驗證整合後 App 的新增／修改／刪除、Pending 自動恢復及 conflict resolution。

**原始 Next Move（階段修訂前，已取代）**
1. 先完成 S3 提供的可信 itinerary version read 與 Trip-level Lease client，另行驗證讀取權限、身份綁定及 lease lifecycle。
2. 回到 S2 完成 Trip editor metadata/dayCount 與 daysData 拆分，將 `saveItineraryTripDetail()`／Pending save 及 `applyItineraryResolution()` 接到唯一 Save RPC。
3. 關閉既有 Trip 的 `updateCloudTripRecord()`／generic update daysData 寫入旁路，同時保留新 Trip insert；建立 caller closure 測試，證明舊路徑無法寫 daysData。
4. 對上述修改執行完整 build、S2／非 itinerary regression，並以 local Supabase／獨立 Auth contexts 實測 metadata-only update、Save RPC、Trigger/history、CAS 及保存後讀回；完成後才判定 S2 Exit。

**S2 Exit：PASS（2026-11-21，依使用者核准重新界定的 S2 範圍）。** S2 service／Repository contract、非 itinerary save隔離、既有 Trip 非版本 upsert bypass封鎖及create insert保留已具備測試證據；既有 sync／recovery／非 itinerary regression、SR-10 grow/shrink、SR-11 dual Auth local DB證據核對完成。未完成 App callers／Trip-level Lease／可信 version／Pending／Conflict／Recovery整合及 daysData旁路closure明確移交 S3，不表示已實作或PASS。