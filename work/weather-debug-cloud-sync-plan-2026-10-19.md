# Travel-Companion 本機除錯資料庫雲端延續計畫

盤點日期：2026-10-19（Asia/Taipei）

目的：把目前本機正在使用的除錯 Supabase 資料庫，完整且可恢復地同步到一個新的、獨立的雲端 Supabase 除錯／開發專案。之後換電腦時直接使用這個雲端除錯資料庫繼續工作，不需重新建立或重複編輯除錯資料。

目前狀態：尚未建立雲端專案、尚未上傳資料、尚未部署 Edge Function、尚未修改正式專案。

## 1. 同步邊界

資料來源只有目前本機除錯資料庫：

- 本機 schema、migration、RPC、索引、約束、RLS 設定
- 本機目前的除錯資料與測試行程
- 本機除錯流程需要的相關 Storage 結構（若實際盤點確認需要）

正式專案 `travel-companion-db`：

- 不是同步來源
- 不會被覆寫
- 不會向其上傳或套用本次同步內容
- 只作為隔離邊界確認，不參與資料合併或資料挑選

本機目前盤點到：

| 項目 | 本機除錯資料庫 |
|---|---:|
| weather_place_coordinates | 4 筆 |
| weather_daily_forecasts | 13 筆 |
| route_estimate_cache | 0 筆 |
| trips | 2 筆 |

## 2. 雲端延續資料庫的目標

新雲端專案應盡可能保留本機除錯資料庫的：

- schema 與 migration 結構
- 天氣座標／預報快取資料
- RPC、索引、約束與 RLS
- 本機測試行程與重現天氣問題所需的資料關係
- 必要的 Storage bucket 結構與除錯用檔案（只有確認需要時才納入）

不納入：

- 正式專案資料
- 正式專案 Secrets、Vault 值、service role key 或 Auth token
- 不屬於本機除錯資料庫的帳號與資料
- 與天氣問題及目前除錯流程無關的正式快取或歷史資料

若本機資料含有非測試個資，先在本機匯出階段做遮罩或替換；除錯資料的內容與關係要保留，但不把 Secrets 或不必要個資帶上雲端。

## 3. 建議同步方式

1. 先從本機除錯資料庫產生 schema 與資料的可重跑匯出產物。
2. 對匯出產物做 allowlist、個資／Secret pattern 掃描與 checksum。
3. 在新雲端 Supabase 專案建立同等 schema。
4. 匯入本機除錯資料，保留必要 ID 與資料關係，避免換電腦後重建資料。
5. 驗證本機與雲端的表格、資料筆數、RPC、RLS 與天氣重現流程。
6. 之後將應用程式的除錯環境改指向新雲端專案；正式環境設定不變。
7. 保留同步產物與驗證紀錄，日後可在新電腦重新設定或回復。

除錯專案預設不啟用正式排程、不部署正式函式、不放入任何正式 Secrets；若天氣重現確實需要 Edge Function，再另行確認部署內容與測試設定。

## 4. 既有本機天氣結構

本機最近的相關 migration 包含：

- `20261015090000_v3101_weather_cache`
- `20261015120000_v3101_weather_coordinate_integrity`
- `20261016140000_v3101_weather_refresh_schedule`
- `20261017100000_v3101_weather_scheduled_refresh_acl_fix`
- `20261018100000_v3101_weather_source_url`
- `20261018140000_v3101_weather_release_lock_order`

正式專案的 migration 歷史不作為本次同步依據；本次以本機實際 schema、migration 與資料為準。

## 5. 建立雲端專案前需要確認

在任何雲端建立或上傳前，需要確認：

- 新專案名稱
- 建立於組織：目前可見組織為 `GHub-Howard29`
- region
- plan，以及是否接受可能的持續費用
- 是否同意把本機除錯資料上傳到這個新專案
- 是否需要部署除錯用 `weather-forecast`；預設為不部署

確認上述項目後，才查詢建立成本；只有使用者明確同意報價後，才建立專案並開始同步。

目前沒有任何雲端建立、資料上傳、正式資料修改、Secrets 暴露或 Git commit/push。
