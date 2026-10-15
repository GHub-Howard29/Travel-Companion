# Supabase Migration 雙電腦同步流程

> 適用專案：Travel-Companion。此流程把 Git 原始碼、各電腦的 Docker 本機資料庫，以及正式 Supabase 分開管理。Git 同步不會自動更新本機資料庫。

## 1. 不可混淆的三種狀態

- **Git migration 檔案**：唯一應納入版本控制的 schema 變更來源；每筆已套用正式環境的 migration 都不可回寫。
- **本機 Docker 資料庫**：每台電腦各自獨立。git pull 只同步檔案，必須另外執行 migration up --local。
- **正式 Supabase**：獨立資料與 migration history。只有經過檢查、測試與明確發布核准後才可部署 migration。

migration list 對齊只代表版本紀錄一致，不保證資料庫結構完全一致；schema diff（結構差異比較）仍是必要的發布檢查。

## 2. 每次開始工作前：AI 自動核對與同步

本節同時是 `AGENTS.md` 的執行細則。AI 每次開始專案任務都必須先核對 Git；涉及資料庫時，再核對本機 Supabase。不可因任務看似只改文件就略過 Git 核對。

### Git 檢查與安全拉取

    git status --short --branch
    git branch --show-current
    git fetch origin
    git status --short --branch
    git log -1 --oneline

- 只有在工作目錄乾淨、目前分支是 `develop`，且 `origin/develop` 僅比本機領先、沒有分歧時，AI 才可自動執行 `git pull --ff-only origin develop`，並再次確認狀態與最新 commit。
- 若有已修改、已暫存或 untracked 檔案，或目前分支不是 `develop`，不可自動切分支、stash、覆寫或 reset；先保留現況並回報。
- 若本機領先遠端、雙方分歧、upstream 不明或 fetch 失敗，停止自動拉取，先查明狀態。

### Supabase 本機資料庫檢查

僅在任務涉及 Supabase、migration 或需要執行資料庫測試時執行：

    npx supabase status
    npx supabase migration list --local

確認 Docker／本機 Supabase 正常後，先讀取並審查所有待套用 migration SQL。純新增且不破壞既有資料的 migration，可在風險確認後執行 `npx supabase migration up --local`，再執行 `npx supabase db lint --local` 及相關測試。

若 migration 可能刪除／重建資料、改變欄位型別或主鍵、刪除欄位／索引、改寫資料或影響附件關聯，必須先建立可辨識且可還原的本機資料備份，確認備份檔存在且非空，再考慮執行。若無法確認備份及還原方式，或變更涉及 Supabase Storage 物件，先停止並回報。不可假設資料庫備份會一併備份 Storage 中的檔案。

若 migration 因資料檢查而中止，先保存完整錯誤訊息並盤點資料；不可用 `db reset`、刪除 Docker volume 或 `migration repair` 略過問題。任何正式 Supabase 寫入／部署操作都必須取得使用者明確核准。

## 3. 新增 schema 變更的標準流程

1. 在唯一一台正在開發的電腦建立 migration：

       npx supabase migration new add_weather_cache

2. 編輯新產生的 SQL，採向前修正（forward-only），避免修改已套用正式環境的舊 migration。
3. 先在本機套用並驗證：

       npx supabase migration up --local
       npx supabase db lint --local
       npm run lint
       npm run build

   再執行本次功能相關的 regression／驗證腳本。

4. 檢查 migration 清單與 Git 差異：

       npx supabase migration list --local
       git diff --check
       git status --short

5. 將 migration SQL 與依賴它的程式碼一起提交；使用繁體中文 commit 訊息。只有在使用者明確要求時才 commit／push。

**禁止兩台電腦各自建立同一個 schema 變更。** 先在一台建立並推送 Git，另一台拉取同一份 migration 檔案，再各自套用到自己的本機資料庫。

## 4. 第二台電腦接手

第二台電腦同樣先完整執行第 2 節的 Git 核對。只有工作目錄乾淨且目前位於 `develop`、遠端只有可 fast-forward 的新提交時，才自動拉取；不可為了同步而自動切分支或覆蓋未提交工作。

Git 同步後，依第 2 節核對本機 Supabase 狀態與 migration 清單。檢視待套用 SQL 並依風險規則決定是否執行 `npx supabase migration up --local`，之後再執行：

    npx supabase db lint --local
    npm run lint
    npm run build

若 migration 失敗，不要重建資料庫來「求同步」。先判斷是本機舊資料不符合新約束、migration 缺漏，還是環境版本差異，再用向前修正處理。需要搬移本機測試資料或執行有破壞風險的 migration 時，先做資料備份並確認還原可用；若無法確認備份與還原方式，先停止並回報。

## 5. 正式環境部署前的停止線

先檢查本機與正式 migration history：

    npx supabase migration list --local
    npx supabase migration list --linked

再產生結構差異供人工審查：

    npx supabase db diff --from linked --to local --schema public,private,storage

這個 diff 可能包含 Supabase CLI 版本、函式權限或資料庫角色預設權限造成的差異，也可能包含真正的欄位、索引、RLS policy（資料列安全政策）、trigger（觸發器）差異。必須逐項分類；**不可直接把產生的 SQL 當成部署腳本執行**。

正式部署前必須確認：

- 所有本機新增 migration 都已納入 Git，且 SQL 已人工審查。
- 沒有不明的遠端 migration 版本或本機缺檔。
- 任何型別轉換、刪欄位、刪索引、權限變更都有明確原因、資料影響分析及備份／回復方案。
- 本機測試、lint、build 與相關 regression 均通過。
- 先執行 CLI 支援的 dry-run（預演）並檢查預計執行內容；若 CLI 不支援或輸出不清楚，停止並改用唯讀檢查。
- 只有使用者明確核准正式部署後，才可執行 npx supabase db push --linked。

### 重要禁則

- 不可把 git pull --ff-only 當成資料庫同步完成。
- 不可把 migration list 對齊當成 schema 相同的證明。
- 不可為了讓清單變綠而任意執行 migration repair；只有確認 SQL 已實際套用、且只缺 history 記錄時，才可評估修復。
- 不可在正式環境執行 db reset，也不可用刪除本機 Docker volume 來解決未知差異。
- 不可把 db diff 的輸出直接推到正式環境；先區分結構差異、功能差異與環境權限雜訊。
- 不可把本機資料庫檔案或 Docker volume 當成兩台電腦間的同步媒介。

## 6. 本專案目前的 schema 基準

正式 Supabase 的既有資料結構是目前基準。migration 20261016100000_v3101_production_schema_alignment.sql 與 20261016103000_v3101_production_schema_alignment_followup.sql 用來讓乾淨本機 migration 建立的 schema 對齊正式環境的歷史表結構與相關物件；第一筆 migration 已套用後不可再回寫，後續修正一律新增 migration。

- 正式環境的 public.expenses.id 是 bigint identity；早期本機 bootstrap 曾建立為 UUID。
- 對 UUID 本機資料庫執行轉換時，若發現附件物件或附件 metadata，migration 會中止，避免附件路徑失效。若沒有附件，既有費用欄位資料會保留，但本機測試用主鍵會重新編號；穩定同步識別碼是 client_item_id。
- 正式環境的 admin_users 包含 created_at、備註，且部分欄位允許 NULL。
- tc_current_email() 的大小寫正規化與 tc_touch_updated_at() 的時間戳取值，屬於目前 migration 程式碼與正式環境的函式行為差異；兩個識別保護函式也可能因定義文字差異出現在 diff。不得為消除 diff 而直接套用自動產生的 SQL，應先比較函式內容與權限再評估。
- Supabase CLI 產生的角色預設權限／系統角色 grant 差異需人工判讀，不得自動套用。

若未來查到新的正式 schema 變更，先建立可追蹤的 migration，再讓每台電腦各自套用；不要在兩台電腦上各自手動修改資料庫。
