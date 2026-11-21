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

### 目前 S2 未完成項

1. 一般 Trip metadata／Trip editor 的保存必須從既有 itinerary payload 分離；其中 dayCount grow/shrink 一旦改動 `daysData`，必須走唯一 Save RPC，且不能以 `updated_at` 偽裝 itinerary version。
2. `saveItineraryTripDetail()` 接上 `tc_save_itinerary_days`；現有 S1 migrations 未提供 authenticated client 讀取 `itinerary_trip_versions` 的 RPC，而該表撤銷 authenticated 權限；需依 S3 client 整合提供可信 version 來源及 Trip-level Lease client。
3. `applyItineraryResolution()` 接到唯一 Save RPC，Pending／Conflict 的刪除或改寫必須等到 Save 明確成功；CAS loser／未知結果保留原 Pending 與衝突資料。
4. 盤點並關閉通用 Cloud upsert／update 對既有 Trip `daysData` 的全部寫入旁路；保留新 Trip create／seed 初始資料插入流程。
5. 使用 local Supabase／獨立 Auth context 驗證實際 Save RPC、metadata-only update、Trigger/history 互動與 CAS 競態，補齊應用程式 caller closure 回歸測試。
6. 完成全部受影響 callers、非 itinerary 功能回歸及上述整合驗收後，才能判定 S2 Exit；S3 Pending／unknown-outcome lifecycle 不提前宣告為 S2 PASS。

**當前 S2 狀態：進行中；切片 1、切片 2 PASS，尚未達到 S2 Exit。**