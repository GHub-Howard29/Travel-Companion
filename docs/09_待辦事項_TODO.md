# 待辦事項

> 本文件只保留尚未完成或仍需驗證的工作；版本順序與範圍以《02_產品開發路線圖》為準。
>
> 最後更新：2026-08-26
>
> 已發布 App 版本：V3.5.3；V3.5.2 資料庫維護已完成且無獨立 App 發布。

## V3.5.0 iOS PWA 與敏感資訊可見範圍強化（發布前不含 PWA 實機驗證）

### 發布前驗證（同步、權限與離線佇列）

- [x] `haw1971.yahoo@gmail.com` 已完成一般其他資訊、購物卡片及領隊／導遊聯絡資訊同步；同步失敗時可按手動重試。
- [x] 另一台管理者裝置新增其他資訊後，原裝置可重新載入；共同／私人同步不受影響。
- [x] `trip_editor` 欄位與刪除權限、`super_admin` 管理權限及敏感卡片可見範圍已完成角色回歸。
- [x] 離線資料與同步佇列已完成驗證，資料可保留於本機並於連線後同步。

### 發布後補驗證（Android／Chrome PWA）

- [x] ✅ 已通過（2026-08-26）：以 V3.4.11 作為基準升級至 V3.5.0，強制更新只需按一次、更新後非空白頁、提示不可稍後、資料仍在，未儲存表單警語正常。
- [x] ✅ 已通過（2026-08-26）第 2 項 Android／Chrome PWA 啟動與版面：Android 維持 V3.4.11 原生 Splash 流程，管理／編輯欄位聚焦與關閉後維持正常寬度；電腦 Chrome PWA 可由米白底正常進入 App，未停在空白頁。

> 第 1 項強制更新與第 2 項 Android／Chrome PWA 啟動／版面均已通過；iOS PWA 實機驗證仍未測試。同步、權限與離線佇列已於發布前完成驗證。

#### 實機驗證項目 2、3 的修改邊界

- 針對上述第 2、3 項進行定案修改時，只能變動為本次新增或必要的修正部分。
- 原 APP 既有文案與小圖示不得變動、替換或重新設計。

### 畫面模擬圖門檻

- [x] 已完成「一般資訊／新增敏感資料」新增／編輯卡片模擬圖；Product Owner 已確認。
- [x] 已完成 App 首頁分享入口模擬圖；入口位置與浮動視窗大方向已確認。

### 敏感資訊卡片權限

- [x] 自駕／租車、領隊／導遊及一般其他資訊維持第二層卡片；一般資訊不顯示可見範圍選項，敏感快捷入口自動設定管理者限定。
- [x] 一般資訊對 Guest、User、`trip_editor`、`super_admin` 顯示；既有受限制卡片編輯時維持敏感模式。
- [x] 敏感資料只對目前 Trip 的 `trip_editor` 與 `super_admin` 顯示；Guest、User 與其他 Trip 的編輯者完全看不到卡片、數量或存在提示。
- [x] 沿用 `allowed_roles`，完成前端過濾、RLS migration、Data API 方案、複製／排序／編輯保留權限的程式補全。
- [x] 卡片改為限制後，未授權帳號成功刷新時移除舊快取；登出後不沿用管理者敏感快取。
- [x] 敏感快捷入口加入全中文自動套用文案，並在儲存敏感資料時顯示二次提醒。
- [x] 已套用 `docs/sql/013_v350_other_info_security_scheme.sql`（migration `20260825082245`）；角色回歸已通過。
- [x] 已套用 `docs/sql/014_other_info_sync_deleted_rows.sql`（migration `20260825082258`）；管理者帳號的其他資訊／領隊導遊同步與手動重試已通過。
- [x] `trip_editor` 參與者與登入 Email 欄位不可編輯、不可刪除整個旅程；其他旅程編輯功能維持可用。

### V3.5.0 納入 V3.4.11 BUG024 修正

- [x] 其他資訊同步改為先 UPDATE、無對應資料列才 INSERT，並加入失敗提示右側的手動重新同步按鈕。
- [x] `trip_editor` 不可修改參與者／登入 Email，也不可刪除整個旅程；`super_admin` 仍保有原管理權限。
- [x] `docs/sql/014_other_info_sync_deleted_rows.sql` 已加入 V3.5.0 候選發布內容。
- [x] V3.5.0 候選版採 `FORCE_UPDATE = true`；理由為 RLS／敏感資料快取隔離與同步流程修正需前端及 migration 一起生效。
- [x] `013`、`014` migration 已套用正式 Supabase 專案；`haw1971.yahoo@gmail.com`、`trip_editor`／`super_admin` 角色回歸已完成。
- [x] 候選 build 已同步更新 `appVersion.ts`、`public/app-version.json`、`package.json`、`package-lock.json` 與 `versionHistory.ts` 為 V3.5.0；`FORCE_UPDATE = true`。

### 分享、離線與待確認範圍

- [x] App 分享規格、模擬圖與修改邊界已確認；功能尚未納入 V3.5.0，移至 V3.5.1 實作與驗證。
- [x] Guest 不提供離線行程內容；登入帳號的離線資料依帳號與權限隔離。
- [x] 已決定 V3.5.0 候選版的 `FORCE_UPDATE = true`；PWA 舊版升級流程改列發布後補驗證，不作為發布前阻擋項目。

### 發布後補驗證（iOS）

> ⏭ 2026-08-26：目前沒有 iOS 實機設備，本大項保留未驗證並暫時跳過；不判定失敗，也不回溯阻擋已發布的 V3.5.0。

- [ ] iOS standalone PWA 啟動時顯示專案圖示，不得只有純色底圖。
- [ ] iOS 聚焦管理／編輯欄位及退出後維持正常寬度，不需兩指縮小，也不可左右移動。
- [ ] iOS Safari／standalone 回歸行程、共同／私人清單、其他資訊、旅程編輯、更新提示與同步。
- [ ] iOS Google 登入、拍照／相簿附件及附件重試回歸。

### V3.5.0 發布後驗證結案

- [x] ✅ 第 4 項已通過（2026-08-26）：V3.5.0 發布後驗證正式結案；第 1、2 項通過，第 3 項 iOS 因無設備保留未驗證，BUG026 與 App 分享移入 V3.5.1。

## 後續版本

- [x] V3.5.1：已於 2026-08-26 發布並結案；程式與正式 Supabase migration、雙端跨裝置即時刷新、角色、多帳號同筆競態、宜蘭附件與 Storage 四角色 RLS 回歸均已通過，且未新增敏感附件可見層級。
- [x] V3.5.3：前端瀏覽器安全防護已於 2026-08-26 發布。
  - [x] 範圍與 Patch 版號重新確認；不改 schema、RLS、角色或同步資料流。
  - [x] CSP、Referrer Policy、URL／外部視窗及 OAuth DOM 安全修正。
  - [x] lint、正式 build 與 postbuild 瀏覽器安全規則驗證。
  - [x] 一般瀏覽器 Google OAuth 實機回歸；iOS standalone PWA OAuth 改列日後補驗證。
  - [x] Service Worker 安裝／離線、附件、Excel、分享及外部連結實機回歸。
  - [ ] 補驗證 V3.5.3 正式站的新版本更新提示：以舊版快取或既有 PWA 開啟正式站，確認可偵測 `3.5.3`、顯示正確更新內容，並可完成非強制更新。
  - [ ] 補驗證 iOS standalone PWA Google OAuth：建立可由 iPhone／iPad 存取的 HTTPS 測試站，在 Supabase Redirect URL 加入該站精確的 `/Travel-Companion/` 回呼網址；以 Safari 加入主畫面後完成 Google 登入，確認可回到 App、登入狀態正確且沒有白畫面或停留在等待頁；驗證完畢後移除暫時 Redirect URL。
- [ ] V3.5.4：管理者帳號名稱映射、統一 Trip ID 與新增旅程預帶入（正式 migration、資料庫角色回歸、Super Admin 介面驗收與非強制發布 metadata 已完成；尚未部署、合併或建立 tag）：建立 `admin_profiles`，App 依固定顯示名稱與 Email 預帶入參與者；新 Trip ID 依初始型態與出發開始日期固定為 `free-travel-YYYY-MM-DD` 或 `group-tour-YYYY-MM-DD`，同型同初始日期不可重複；新增 Trip 必須在線並同時檢查本機與 Supabase，既有 Trip 的離線能力不受影響；既有 `admin_users` 僅維持角色／Trip 指派，既有 Trip ID 不修改。
- [ ] V3.6.0：地點間預估移動資訊，依專屬規格開發。

### V3.5.1 已確認新增功能（App 分享）

- [x] 頁首於既有關閉按鈕左側新增小型分享圖示；既有 App 文案與小圖示未變動。
- [x] 浮動視窗顯示本專案圖示、首頁超連結與分享連結；系統原生分享面板依平台以 App 圖示清單呈現，超出時由原生面板滑動。
- [x] 原生分享由使用者選擇通訊軟體頻道或其他系統分享目標；未新增「更多」按鈕。
- [x] 保留原本關閉按鈕，點擊後返回當下 App 主畫面；未建立單一 Trip 分享網址。

### V3.5.1 待修正開發（跨裝置即時刷新）

- [x] 監聽 `other_info_items` 針對目前 `trip_id` 的 Supabase Realtime 事件，涵蓋新增、修改及軟刪除（UPDATE）。
- [x] 監聽 shared `checklists`（`trip_id`、`scope = shared`）及 `checklist_items`（shared checklist ID）的 Supabase Realtime 事件，涵蓋新增、修改、勾選、刪除／軟刪除與排序。
- [x] 收到事件後以 RLS-safe query 重新載入目前行程資料，不直接採用事件 payload。
- [x] 保留 focus／visibility／reconnect 重新載入備援，且 pending／本機 cloud write 期間略過遠端刷新。
- [x] 以兩個不同帳號同時編輯共同清單，最後成功雲端寫入狀態會成為最新資料，完成同步後不回滾；不新增衝突 UI。
- [x] Realtime publication migration 已於正式 Supabase 套用並驗證；Codex 內建瀏覽器與電腦桌面版 PWA 雙端在同步完成後均於 1 秒內顯示更新，跨裝置即時刷新回歸通過，既有 `trip_editor`／`super_admin` 權限矩陣不變。

### V3.5.1 Storage 驗證

- [x] 已建立 private bucket／Storage RLS migration、路徑檢查及 15 分鐘簽名網址檢查。
- [x] `npm run lint`、`npm run build` 與 release history 驗證已通過。
- [x] 正式 Supabase migration 已套用並驗證：private bucket、1 MiB／MIME 限制、四項 Storage RLS policy、三張 Realtime publication table 與 migration history 均正確；既有附件物件為 0。
- [x] BUG027 含中文舊 Trip ID 的附件 key 修正已套用正式 Supabase；UTF-8 hex scope 函式與四項 Storage RLS policy 已驗證。
- [x] 以宜蘭行程的兩筆既有失敗照片按「同步照片」回歸，兩筆均成功上傳。
- [x] 以 anon、其他 Trip editor、所屬 Trip editor、super admin 完成 Storage RLS 回歸（2026-08-26）：以自動 ROLLBACK 的遠端資料庫交易模擬 JWT／Postgres role；讀取／簽名可見性、上傳與更新均符合預期，刪除 policy 已驗證存在。直接 SQL 刪除由 Supabase `protect_objects_delete` 內建觸發器禁止，實際刪除須經 Storage HTTP API 與登入 session 執行。

### V3.5.1 補充實機權限回歸

- [x] Guest、User 的相關操作介面依權限阻擋。
- [x] `trip_editor` 無法建立行程，且只能修改被授權的行程。

## 跨版本待驗證／改善

- [ ] 評估離線刷新約 30 秒才載入既有資料的效能改善。
- [ ] 評估帳本附件管理體驗。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊及外幣換算，不共用單一合併策略。
