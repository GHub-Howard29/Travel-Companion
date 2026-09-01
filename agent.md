# Travel Companion 專案作業指引

## 目前狀態

- 已發布版本：V3.6.0。
- V3.5.2「Supabase 資料庫權限函式硬化」已完成；正式 migration、advisors 與角色回歸通過，Product Owner 確認不建立獨立 App build／tag，App 顯示版本維持 V3.5.1。
- V3.6.0「地點間預估移動資訊」已於 2026-08-30 合併、建立 `v3.6.0` tag 並部署；正式 Supabase、Google Cloud 與 GitHub Pages 已驗證。完整角色矩陣、正式站 OAuth 自動化登入及 Android／iOS 實機仍保留發布後補驗證。
- V3.6.1「Android 記帳金額欄位與 PWA 更新流程修正」程式已完成，commit 為 `08ef857`；Product Owner 已於 2026-09-01 進入手動發布程序。正式發布完成前，App 程式版本現況與已發布版本帳冊仍維持 V3.6.0；收到 Product Owner 發布完成回報後，才另行更新版本現況並建立獨立 commit。
- 版本順序與範圍唯一以 `docs/02_產品開發路線圖.md` 為準；未完成工作以 `docs/09_待辦事項_TODO.md` 為準；目前有效狀態以 `docs/14_專案現況總覽.md` 為準。

## 開發與安全規則

- 使用繁體中文溝通及撰寫 commit message。
- 新功能先討論範圍與風險，經 Product Owner 確認後實作。
- V3.5.0 維持現行 Guest、User、`trip_editor`、`super_admin` 權限制度，不開發 Trip 公開／私人介面或 `is_public` migration。
- V3.5.0 所有新增或調整畫面都必須先提供模擬圖，經 Product Owner 確認後才能修改程式；未確認模擬圖不得先行實作 UI。
- 正式 migration、已發布版本與版本歷史不可回寫；問題只以向前修復處理。
- 不得自行合併、部署、推送或對正式 Supabase 執行 migration，除非 Product Owner 明確要求。
- 修改完成後至少執行與風險相稱的 lint、TypeScript、build 或專項測試。

## 版本與發布

- 採 `MAJOR.MINOR.PATCH`：Major 為產品世代／大規模不相容變更；Minor 為主要新功能；Patch 為修正、維護及小型改善。
- `FORCE_UPDATE` 與版號分開決定，預設為 `false`；V3.5.6 起另以 `minimumSupportedVersion` 作為新客戶端的必要更新依據，橋接期間 `forceUpdate` 保留供舊客戶端相容判斷。
- 資料不相容、安全修正、Supabase schema／RLS、同步或 Pending Queue 重大資料風險，才建議強制更新。
- Product Owner 確認版本號、發布日期、更新內容與是否強制更新後，才同步更新 `src/config/appVersion.ts`、`public/app-version.json`、`src/config/versionHistory.ts`、`package.json`、`package-lock.json` 與發布文件。
- `public/app-version.json` 不得被 PWA precache，確保更新檢查取得真正最新版。

## 文件責任

- `docs/README.md`：文件入口與專案簡介。
- `docs/02_產品開發路線圖.md`：未來版本順序、編號與範圍。
- `docs/07_版本更新紀錄.md`：精簡的已發布版本帳冊。
- `docs/09_待辦事項_TODO.md`：只記錄未完成工作。
- `docs/14_專案現況總覽.md`：只記錄目前有效狀態。
- 架構、資料庫、權限與專屬功能規格分別留在對應文件；歷史細節由 Git 保存，不再建立累積式「新對話交接文件」。
