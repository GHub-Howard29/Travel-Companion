# 正式 Supabase 資料庫 Migration 與部署流程

> 本文件只規範正式 Supabase schema／Migration 的權威來源、兩台開發電腦的 Migration 同步及正式部署安全。**不規範合成測試資料 fixture 同步**；測試資料請依《[本機測試資料庫同步流程](83_本機測試資料庫同步流程.md)》及《[雙電腦測試資料生命週期設計](archive/supabase-sync/82_雙電腦測試資料生命週期設計.md)》辦理。

## 1. 三種資料庫狀態

- **Git migration 檔案**：schema 變更的唯一版本控制來源；已套用正式環境的 migration 不可回寫，後續修正一律新增 migration。
- **各電腦的本機 Docker DB**：彼此獨立。Git pull 只更新檔案，必須另外檢查並套用 migration。
- **正式 Supabase**：正式資料與 migration history 的權威環境。正式寫入／部署只可在檢查、測試、審查及明確核准後執行。

Migration history 對齊不等於 schema 完全一致；正式部署前仍須檢查 schema diff。

## 2. 新增 schema 變更

1. 由當次指定的開發來源電腦建立 migration；同一項 schema 變更不可由兩台電腦各自建立。
2. 使用 `npx supabase migration new <description>` 建立新檔，採 forward-only，不修改已套用正式環境的舊 migration。
3. 在來源電腦本機審查並驗證：
   ```sh
   npx supabase migration up --local
   npx supabase db lint --local
   npm run lint
   npm run build
   ```
   再執行相關 regression tests。
4. 檢查 migration list、Git diff 與工作樹；migration SQL 與依賴程式碼一起納入 Git。只有使用者明確要求時才 commit／push。
5. 第二台電腦安全 fast-forward 取得同一份 migration，再依風險審查後套用到自己的本機 DB。

## 3. 本機 Migration 安全

- 操作前檢查 `npx supabase status`、`npx supabase migration list --local`，審查所有待套用 SQL。
- 可能刪除／重建資料、改型別／主鍵、刪欄位／索引、改寫資料或影響附件關聯的 migration，須先建立可辨識且可還原的本機備份；無法確認備份／還原或涉及 Storage 物件時停止。
- Migration 失敗時保存錯誤並盤點資料。不得用 `db reset`、刪 Docker volume 或 `migration repair` 略過問題。
- 本機乾淨重建只限明確要求且已確認資料可丟棄／備份的驗證；不是日常同步指令。

## 4. 正式部署停止線

先執行並審查：

```sh
npx supabase migration list --local
npx supabase migration list --linked
npx supabase db diff --from linked --to local --schema public,private,storage
```

逐項區分真正 schema 差異、CLI／角色權限雜訊及函式差異。不得直接執行自動產生的 diff SQL。

部署前確認：
- migration 已納入 Git 且 SQL 經人工審查；
- 沒有不明遠端版本或本機缺檔；
- 破壞性變更有資料影響分析及備份／回復方案；
- 本機測試、lint、build 及相關 regression 通過；
- CLI dry-run 可用且輸出可審查；否則停止並採唯讀檢查。

只有使用者明確核准正式部署後，才可執行 `npx supabase db push --linked`。

## 5. 禁止事項

- 不可把 Git pull 或 migration list 對齊當成資料庫同步／schema 相同的證明。
- 不可任意執行 `migration repair`；僅在確認 SQL 已套用而只缺 history 記錄時評估。
- 不可在正式環境執行 `db reset`。
- 不可把 db diff 輸出直接部署，亦不可用 Docker volume／資料庫 dump 作為兩台電腦的日常同步媒介。
- 正式資料庫寫入／部署必須取得明確核准；測試 fixture 的交接口令不等於正式部署授權。

## 6. 目前 schema 基準與歷史注意事項

正式 Supabase 既有 schema 是目前基準。已套用正式環境的 migration 不可回寫；新增差異須以新 migration 向前修正。歷史 schema 對齊 migration、費用表主鍵、admin_users 欄位、函式定義及 CLI 角色 grant 差異，仍依原有專案紀錄與逐項審查處理，不得為消除 diff 而直接套用自動產生 SQL。
