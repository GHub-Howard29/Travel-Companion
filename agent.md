# Travel Companion 專案作業指引

## 目前狀態

- 目前版本、部署／發布狀態與目前開發目標，唯一以 `docs/14_專案現況總覽.md` 為準。
- 未來版本順序與範圍見 `docs/02_產品開發路線圖.md`；未完成工作見 `docs/09_待辦事項_TODO.md`。
- 已發布版本的完整帳冊與專屬文件位於 `docs/archive/`，不是預設必讀範圍。

## AI 助理互動與 API 呼叫安全規範 (Rate Limiting & Exponential Backoff)

- 當 Cline 進行多檔案讀寫、指令執行或外部 API 互動時，必須嚴格遵守流量控制與容錯重試機制，避免觸發 Rate Limit (429) 或配額超標：
  1. **批次操作節流 (Rate Limiting / Throttling)**：當需連續執行多個獨立的讀取、搜尋或驗證指令時，應適度交錯執行，避免零秒瞬間並發大量請求。
  2. **指數退避重試 (Exponential Backoff)**：當遇到指令失敗、網路逾時或 API 回傳 `429 Too Many Requests` / `503 Service Unavailable` 時，絕對禁止無延遲原地無限迴圈重試；必須採用指數退避機制（例如：等待 10 秒 $\rightarrow$ 20 秒 $\rightarrow$ 30 秒，最多重試 3 次），並在日誌或回應中明確告知使用者冷卻狀態。
  3. **靜默與平滑輸出**：在處理大量資料或跑迴圈測試時，應避免不必要的冗長輸出，保持終端機與對話紀錄的整潔。

## 開發與安全規則

- 使用繁體中文溝通及撰寫 commit message。
- 新功能先討論範圍與風險，經 Product Owner 確認後實作。
- V3.5.0 維持現行 Guest、User、`trip_editor`、`super_admin` 權限制度，不開發 Trip 公開／私人介面或 `is_public` migration。
- V3.5.0 所有新增或調整畫面都必須先提供模擬圖，經 Product Owner 確認後才能修改程式；未確認模擬圖不得先行實作 UI。
- 正式 migration、已發布版本與版本歷史不可回寫；問題只以向前修復處理。
- 不得自行合併、部署、推送或對正式 Supabase 執行 migration，除非 Product Owner 明確要求。
- 未經 Product Owner 明確指令，不得自行建立、修改或推送 Git commit；完成修改後維持未提交狀態並回報差異。
- 修改完成後至少執行與風險相稱的 lint、TypeScript、build 或專項測試。

## 版本與發布

- 採 `MAJOR.MINOR.PATCH`：Major 為產品世代／大規模不相容變更；Minor 為主要新功能；Patch 為修正、維護及小型改善。
- `FORCE_UPDATE` 與版號分開決定，預設為 `false`；V3.5.6 起另以 `minimumSupportedVersion` 作為新客戶端的必要更新依據，橋接期間 `forceUpdate` 保留供舊客戶端相容判斷。
- 資料不相容、安全修正、Supabase schema／RLS、同步或 Pending Queue 重大資料風險，才建議強制更新。
- Product Owner 確認版本號、發布日期、更新內容與是否強制更新後，才同步更新 `src/config/appVersion.ts`、`public/app-version.json`、`src/config/versionHistory.ts`、`package.json`、`package-lock.json` 與發布文件。
- `public/app-version.json` 不得被 PWA precache，確保更新檢查取得真正最新版。

## 文件責任

- `docs/README.md`：文件入口與專案簡介。
- `docs/02_產品開發路線圖.md`：未來版本順序、編號與範圍；已發布版本只保留精簡索引。
- `docs/archive/07_版本更新紀錄.md`：完整的已發布版本帳冊。
- `docs/03_Bug修正紀錄.md`：未修正、待補驗與近期修正；已結案詳細紀錄搬入 `docs/archive/bug-history/`。
- `docs/09_待辦事項_TODO.md`：只記錄未完成工作；完成項應移出，不長期累積 `[x]` 歷史。
- `docs/14_專案現況總覽.md`：目前部署版本、正式發布狀態、目前開發目標與必要風險的唯一權威來源。
- `docs/archive/README.md`：版本文件搬遷索引與歸檔門檻。
- 每次文件整理前先依上述責任去重；同一事實只指定一個權威來源，其他文件以連結引用，不複製整段內容。
- 尚未排入近期實作的方案與預覽一律標示「草案／尚未定案」；需求或範圍改變時，舊預覽改標「先前方案草案」，不得繼續當作核准依據。
- 版本專項測試在行為穩定後應改為領域名稱或合併至固定測試套件，不得讓 `build` 永久累積每個版號的驗證腳本。
- 架構、資料庫、權限與當前專屬功能規格分別留在對應文件；歷史細節由 Git 與版本更新紀錄保存，不再建立累積式「新對話交接文件」。

## 文件維護觸發與強制 Checklist

- 使用者說「整理文件」或明確同義指令時，AI 必須盤點權威來源、待搬文件、斷鏈與未完成 Checklist，並逐項回報。
- 進入「發布前停止線」時，必須預檢版本號、發布候選文件、連結映射、路線圖狀態、權威狀態欄與 archive 目標；未發布文件不得歸檔。
- 使用者回報「已發布」或「已部署」時，必須驗證版本檔、`main` 合併、annotated tag、部署結果與發布後 smoke；證據不全時只能標示待補。
- 發布後必須更新 `14_專案現況總覽`、將路線圖版本移入精簡索引、更新 archive 帳冊，再以 `git mv` 搬遷該版本專屬文件。
- 搬檔後必須執行 `npm run verify:docs-links`、`git diff --check`、檔案數量／位置比對，並在全數通過後才能回報文件整理完成。
- 文件觸發只授權文件盤點與維護，不授權 commit、push、合併、部署或正式 Supabase 操作。
