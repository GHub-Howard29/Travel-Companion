# TRIP 清單讀取失敗與資料保護修復紀錄

> 本文件記錄 2026-11-12 公司端本機開發環境發生的 TRIP 清單讀取異常、根因、修正與驗證。
>
> 本次屬既有 V3.10.12 正式版之後的未發布修復，不代表新版本已發布或部署。
>
> 最後整理：2026-11-12

## 1. 使用者回報與影響

使用者先回報離線問題已解決，但 Excel 匯入後仍無法正常讀取 TRIP；接著發現原本可見的多筆旅程縮減成只剩一筆。

本次調查確認問題不在匯入資料建立失敗，也不是 Supabase RLS 將資料撤權，而是讀取雲端 TRIP 清單時，資料清理流程無法處理合法的 daysData metadata，造成整批清單轉換失敗。

## 2. 根因分析

### 2.1 直接根因

雲端 7 筆可讀取的 Trip 資料中，有 6 筆 `content.daysData` 同時包含每日行程陣列及 `mode: "guided"` 之類的 metadata。

每日欄位（例如 `"1"`、`"2"`、`"3"`）是陣列；`mode` 則是合法字串 metadata。舊版 sanitizer 以 `Object.entries(content.daysData)` 遍歷所有值，未區分每日陣列與一般 metadata，直接對每個值呼叫 `.map(...)`。

因此遇到字串值時拋出：

```
TypeError: items.map is not a function
```

### 2.2 錯誤如何擴大成只剩一筆

1. `getCloudTripRecordsStrict()` 讀取雲端資料後，經 `toTripRecord()` 與 `sanitizeStoredTripRecord()`。
2. `removeExpiredTravelEstimates()` 及 `sanitizeItineraryCoverPhotos()` 對非陣列 metadata 呼叫 `.map()`，使整批資料轉換失敗。
3. `getCloudTripRecords()` 的 soft-failure 包裝捕捉錯誤後回傳空清單。
4. `getTripMetas()` 因此只剩靜態 seed／快取資料。
5. 舊的 reconciliation 判斷又把「某次 cloud list 缺席」當成撤權證據，清除了本機快取中的其他 Trip。

所以使用者看到的「只剩一筆」是讀取失敗後被錯誤清理本機資料所造成的次級影響，不是資料庫中其他 Trip 被刪除。

### 2.3 已排除事項

- Local Supabase RLS 可見 trips 共 7 筆。
- 7 筆 participant Email map RPC 均成功。
- 7 筆資料的必要欄位與結構有效。
- 不是 Excel 匯入過程額外建立大量重複 TRIP 所造成。
- 本次恢復過程沒有刪除或新增任何 local DB rows。

## 3. 修正內容

### 3.1 Sanitizer 僅處理宣告的每日陣列

檔案：`src/utils/itineraryCoverPhoto.ts`

- `sanitizeItineraryCoverPhotos` 改為只處理 `content.days` 宣告、且 `daysData[day]` 確認為 array 的每日欄位。
- 其他 metadata（例如 `mode`）原樣保留。
- 舊格式若缺少 `content.days`，採 safe no-op，不再因缺少日數資訊而拋錯。

檔案：`src/utils/itineraryTravel.ts`

- `removeExpiredTravelEstimates` 採相同的每日陣列範圍限制。
- 不再遍歷並處理一般 metadata。
- 缺少 `days` 的 legacy record safe no-op。

### 3.2 TRIP 內容驗證允許合法 metadata

檔案：`src/services/tripCloudService.ts`

- `isTripContent()` 改以 `content.days` 宣告的日期逐一檢查對應 `daysData[String(day)]` 是否為 array。
- 不再要求 `daysData` 的所有 values 都必須是 array。
- 合法 metadata 不會被誤判成無效 Trip。

### 3.3 避免不完整清單觸發本機整筆清除

檔案：`src/services/tripReconciliation.ts`

- 移除「某次 cloud list 沒有回傳某 Trip，就視為 access revoked」的危險判斷。
- 只有明確 permanent tombstone，或既有明確的 pending cleanup IDs，才可作為整筆 local Trip 清理依據。
- 某次 RLS-filtered cloud list 暫時缺席，不能單獨作為刪除或撤權證據。
- 此保護原則與 V3.8.1 tombstone 設計一致：清單缺席不等於永久刪除，永久刪除應以明確 tombstone 為依據。

### 3.4 既有離線恢復與 Excel 建立修正

本次保留先前同一工作樹中的離線恢復及 Excel 建立相關修正，沒有回退或覆蓋：

- `src/hooks/useTripWorkspace.ts`：Supabase health probe、連線恢復後重新 reconciliation。
- `src/App.tsx`、`src/components/TripEditorModal.tsx`、`src/services/tripExcelCreateService.ts`、`src/services/tripExcelCreateRetry.ts`：Excel 新增 TRIP 流程與結果不明 recovery 相關工作。
- 相關測試檔持續保留，詳見 Git 工作樹狀態。

## 4. 資料恢復與 UI 驗證

修正前實際呼叫 Vite source 的 `getCloudTripRecordsStrict(client)`，可重現：

```
TypeError: items.map is not a function
```

修正後：

- `getCloudTripRecordsStrict(client)`：成功回傳 7 筆，無轉換錯誤。
- `getTripMetas(client, '/Travel-Companion/')`：回傳 8 個選項（7 筆 cloud Trip，加上 1 筆額外 static seed）。
- 使用專案既有 local repository helper 將 cloud cache 從 1 筆恢復為 7 筆；未清空 localStorage。
- 瀏覽器重新載入後，Trip 選單顯示 8 個選項；目前選取的 Test TRIP 可正常顯示 D1–D3 行程。
- UI offline banner 為 false，`navigator.onLine` 為 true。

資料中有兩筆同名 Test TRIP，為既有兩筆不同 ID 記錄；本次沒有新增第三筆：

- `trip-ac0468ec-51dd-44b8-a8dc-162c43188911`
- `trip-f475a522-6629-4cb5-9777-a50f905062f8`

## 5. 自動化驗證

下列檢查均已通過：

- `npm run verify:trip-lifecycle`
- `node scripts/verify-v3926-access-revocation.mjs`
- `npm run verify:trip-excel-rpc`
- `npm run verify:trip-excel-import`
- `npm run test:trip-excel-create-service`
- `npm run verify:itinerary-travel`
- `npm run verify:v390-place-photos`
- `npx tsc -p tsconfig.app.json --noEmit`
- 完整 `npm run build`：exit code 0；1,940 modules；PWA 65 precache entries；Browser Security 與 Weather bundle 檢查通過。

本次已新增／更新的回歸涵蓋：

- daysData metadata 保留。
- legacy record 缺少 days 時 sanitizer 不拋錯。
- 無 tombstone 的 cloud list absence 不清除 local Trip。
- 有明確 tombstone 才執行整筆清理。
- cover photo 清理不影響 mode metadata。

## 6. Git 與環境操作界線

- 工作分支：`develop`。
- 工作目錄保留多筆既有未提交變更，包含本次修正及先前 Excel／離線工作。
- 本次沒有執行 Git commit 或 push。
- 本次沒有部署 GitHub Pages 或 Edge Function。
- 本次沒有修改正式 Supabase DB、Migration 或 Secrets。
- 操作範圍為公司端 local Supabase 與本機瀏覽器。
- 正式部署版本仍以《14_專案現況總覽》部署狀態為準（V3.10.12）；本文件不代表已發布版本更新。

## 7. 後續注意事項

1. 維持 sanitizer 的資料邊界：只處理 `content.days` 宣告的每日 array，不可假設 `daysData` 每個 key 都是每日陣列。
2. cloud list 查詢或解析失敗時，必須保留既有 local Trip；不得將一次不完整清單當作撤權或刪除指令。
3. 永久刪除及撤權清理需使用明確且可驗證的 tombstone／cleanup 證據。
4. 後續 Excel RPC／跨裝置測試應持續使用合成測試資料與 local loopback DB，不可因本次讀取修正而擴大操作到正式資料庫。
5. 本次工作樹尚未 commit／push；應先檢視完整 diff，確認與其他未提交工作一致後，再依使用者指示決定後續 Git 動作。
