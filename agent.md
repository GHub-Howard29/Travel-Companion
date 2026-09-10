# Travel Companion 專案作業指引

## 目前狀態

- 已發布版本：V3.7.4。
- V3.5.2「Supabase 資料庫權限函式硬化」已完成；正式 migration、advisors 與角色回歸通過，Product Owner 確認不建立獨立 App build／tag，App 顯示版本維持 V3.5.1。
- V3.6.0「地點間預估移動資訊」已於 2026-08-30 合併、建立 `v3.6.0` tag 並部署；正式 Supabase、Google Cloud 與 GitHub Pages 已驗證。完整角色矩陣、正式站 OAuth 自動化登入及 Android／iOS 實機仍保留發布後補驗證。
- V3.6.1「Android 記帳金額欄位與 PWA 更新流程修正」已於 2026-09-01 合併至 `main`、建立 `v3.6.1` tag 並部署。Android 手機已驗證更新提示一次點擊即可完成，記帳金額輸入欄位不再變形或超出畫面；更新後介面顯示偏慢已由 V3.6.5 正式版完成改善。
- V3.6.3「V3.6.2 發布後前端修正」已於 2026-09-03 合併至 `main`、建立 `v3.6.3` tag 並部署；採一般更新，正式 metadata 與主程式資產已驗證。桌面、Android 實機及登入後管理者流程均通過；僅 iOS Safari／standalone PWA 的更新提示、版本資訊、交通圖示及縮短天數雙階段確認保留發布後補驗。
- V3.6.4「歷史唯讀參與者與跨裝置資料變動提醒」已於 2026-09-07 完成 production logical backup、migration、兩階段 GitHub Pages 部署與正式站登入 smoke；採必要更新。iOS、Android 與兩台實體裝置指定流程保留發布後補驗。
- V3.6.5「PWA 更新後介面顯示效能改善」已於 2026-09-08 完成同機 V3.6.4／V3.6.5 各五次桌面量測、全部自動驗證、`v3.6.5` 與 GitHub Pages 部署；正式 metadata／資產與登入 smoke 通過，採一般更新。Android、iOS 與兩台實體裝置保留發布後補驗。
- V3.7.0「當日後續行程時間連動調整」已於 2026-09-08 完成全部自動驗證、`v3.7.0` 與 GitHub Pages 部署；正式 `app-version.json` 與首頁新版資產已確認，採一般更新。桌面、Android、iOS、實際大眾運輸、離線快取及跨裝置競態指定流程保留發布後補驗。
- V3.7.1「Day 日期顯示修正」已於 2026-09-08 完成 Day 2、跨年、閏年與無效日期專項、全部自動驗證、`v3.7.1` 與 GitHub Pages 部署；正式 `app-version.json` 與首頁新版資產已確認，採一般更新。
- V3.7.2「農曆日期與 Day 配色」已於 2026-09-08 完成全部自動驗證、`v3.7.2` 與 GitHub Pages 部署；正式 `app-version.json` 與首頁新版資產已確認，採一般更新。
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
- `docs/02_產品開發路線圖.md`：未來版本順序、編號與範圍；不再追加已發布版本的實作流水帳。
- `docs/07_版本更新紀錄.md`：精簡的已發布版本帳冊。
- `docs/09_待辦事項_TODO.md`：只記錄未完成工作；完成項應移出，不長期累積 `[x]` 歷史。
- `docs/14_專案現況總覽.md`：只記錄目前正式版、有效能力、當前開發與下一步；不得保留過期的「最新版本」章節。
- 每次文件整理前先依上述責任去重；同一事實只指定一個權威來源，其他文件以連結引用，不複製整段內容。
- 尚未排入近期實作的方案與預覽一律標示「草案／尚未定案」；需求或範圍改變時，舊預覽改標「先前方案草案」，不得繼續當作核准依據。
- 版本專項測試在行為穩定後應改為領域名稱或合併至固定測試套件，不得讓 `build` 永久累積每個版號的驗證腳本。
- 架構、資料庫、權限與當前專屬功能規格分別留在對應文件；歷史細節由 Git 與版本更新紀錄保存，不再建立累積式「新對話交接文件」。
