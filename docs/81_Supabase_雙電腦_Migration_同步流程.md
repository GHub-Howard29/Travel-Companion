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

## 7. 本機測試資料版本控制與重建基準

### 7.1 原則與目前狀態

- **Migration 管理結構與資料庫權限；Seed／fixture 檔案管理可重現的標準測試資料。** 兩者都必須納入 Git，不能把本機 Docker volume 或資料庫 dump 當作兩台電腦的同步來源。
- git pull 只更新檔案，不會自動更新本機資料庫，也不會自動載入新測試資料。
- 測試資料必須是明確挑選的合成資料或已去識別化資料；不得直接把正式資料庫 dump、真實使用者資料、Auth token、secret 或 Storage 檔案本體放進 Seed／fixture。
- **目前尚未建立可供乾淨重建使用的 Seed 基準。** supabase/config.toml 的 [db.seed] enabled 目前為 false，雖然設定了 ./seed.sql 路徑，但 repository 中尚無 supabase/seed.sql。在建立並驗證標準測試資料之前，不得宣稱 supabase db reset 能載入本專案的標準測試資料。
- 專案現況紀錄曾指出本機 supabase db reset 因容器初始化錯誤連續失敗，之後改以備份 dump 還原本機資料。因此執行任何 reset 前，必須先確認目前本機資料是否需要保留、備份是否有效，以及目標確實是本機 disposable database；不可把 reset 當作日常同步指令。

### 7.2 建立與維護標準測試資料

1. 先依測試需求定義最小且穩定的合成資料集，確認所需資料表、外鍵、RLS、角色／Auth 依賴與 Storage 需求；不可直接複製正式資料作為基準。
2. 將可重現的資料建立 SQL 或 fixture 放在明確、受 Git 管理的位置。若採用 Supabase Seed，使用 supabase/seed.sql，並在驗證完成後才啟用 [db.seed] enabled = true；若資料依賴 Auth 使用者、Storage 物件或外部服務，須另外定義安全、可重現的建立與清理方式，不能假設 Seed 會自動複製這些內容。
3. 修改標準測試資料時，必須同步更新對應的 Seed／fixture 檔案與必要測試，檢查 Git diff，並以乾淨本機資料庫驗證資料能重建；不得只在 Studio 手動改資料，然後認為另一台電腦也會取得變更。
4. 只有在本機資料可丟棄、已確認備份／保留需求，且 Migration 與 Seed 已準備完成時，才執行 npx supabase db reset。驗證 Migration 與 Seed 都成功後，才可將檔案 commit／push；不得在正式環境執行 reset。
5. 測試資料版本變更與相關 Migration／測試一起納入 Git。依專案既有 Git 安全流程提交並推送後，另一台電腦 pull 到相同 commit，才能取得相同的版本控制檔案。

### 7.3 A／B 電腦的日常同步規則

- **同步流程完成前的公司電腦限制：** 目前工作階段的指定作業電腦是公司電腦。每次開始本同步專案的後續工作前，必須先從實際執行環境確認主機識別；目前已確認基準為 Windows `COMPUTERNAME=TPEPC-TM7503-01`、`USERDOMAIN=NICE-GREEN`，專案路徑 `D:\\Project\\Travel-Companion`。若主機名稱／網域或路徑不符、無法確認，立即停止，不得繼續此同步流程，先向使用者確認。
- **解除限制的必要條件：** 標準測試資料版本、Seed／fixture、乾淨重建與驗證流程均已完成、納入 Git 並推送；家裡電腦已 pull 到相同版本，並依流程完成本機 reset／同步與驗證成功。僅文件完成、公司電腦單機測試成功或已 push，都不足以解除限制。完成前每次都要重新確認公司電腦身份。
- **每次開始工作前：** 依本文件第 2 節核對 Git；涉及資料庫時，再檢查本機 Supabase 狀態與 Migration 清單。不要假設 pull 後本機資料庫已更新。
- **只有 schema 有新增 Migration：** 審查待套用 SQL 後，依風險規則執行 npx supabase migration up --local，再跑 lint 與相關測試；一般不需要 reset。
- **只有標準測試資料基準有變更：** pull 後，依該 fixture／Seed 的專用更新與驗證步驟更新本機資料。若目前只有 supabase db reset 能可靠套用整套 Seed，必須先確認本機資料可丟棄或已備份，再 reset。
- **需要驗證完整乾淨重建時：** 在確認安全的本機環境執行 npx supabase db reset，確認所有 Migration 與標準測試資料均成功建立；這是可重現性驗證，不是每次開工必做步驟。
- A、B 不得各自手動建立不同版本的標準測試資料。資料基準的唯一來源是 Git 中經審查的 Migration 與 Seed／fixture；每台電腦各自重建或套用，不直接複製 Docker volume。

**啟用 Seed 的完成條件：** 已建立合成測試資料基準、檢查不含正式資料／秘密、確認 Migration + Seed 可在乾淨本機資料庫成功執行，並驗證必要的 RLS／權限與應用程式測試。完成前維持目前 Seed 關閉，不以 db reset 嘗試碰運氣。
