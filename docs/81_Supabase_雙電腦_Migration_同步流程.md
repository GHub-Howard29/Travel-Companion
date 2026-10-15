# Supabase Migration 雙電腦同步流程

> 適用專案：Travel-Companion。此流程把 Git 原始碼、各電腦的 Docker 本機資料庫，以及正式 Supabase 分開管理。Git 同步不會自動更新本機資料庫。

## 1. 不可混淆的三種狀態

- **Git migration 檔案**：唯一應納入版本控制的 schema 變更來源；每筆已套用正式環境的 migration 都不可回寫。
- **本機 Docker 資料庫**：每台電腦各自獨立。git pull 只同步檔案，必須另外執行 migration up --local。
- **正式 Supabase**：獨立資料與 migration history。只有經過檢查、測試與明確發布核准後才可部署 migration。

migration list 對齊只代表版本紀錄一致，不保證資料庫結構完全一致；schema diff（結構差異比較）仍是必要的發布檢查。

## 2. 開始工作前：同步 Git 與本機 schema

在要開始工作的電腦執行：

    git status --short --branch
    git fetch origin
    git switch develop
    git pull --ff-only origin develop

    npx supabase status
    npx supabase migration list --local
    npx supabase migration up --local
    npx supabase db lint --local

- 若工作目錄有未提交變更，先確認屬於自己的工作，不可直接覆蓋或重設。
- 若 Docker／Supabase 尚未啟動，先確認 Docker Desktop 正常，再依專案既有方式啟動 Supabase。
- migration up --local 只套用尚未執行的 migration，不會把本機資料庫推送到正式環境。
- 若 migration 因資料檢查而中止，先保存錯誤訊息並盤點資料；不可用 db reset、刪除 Docker volume 或 migration repair 略過問題。

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

在第二台電腦：

    git status --short --branch
    git fetch origin
    git switch develop
    git pull --ff-only origin develop

    npx supabase status
    npx supabase migration list --local
    npx supabase migration up --local
    npx supabase db lint --local
    npm run lint
    npm run build

若 migration 失敗，不要重建資料庫來「求同步」。先判斷是本機舊資料不符合新約束、migration 缺漏，還是環境版本差異，再用向前修正處理。需要搬移本機測試資料時，先做資料備份並確認還原可用。

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
