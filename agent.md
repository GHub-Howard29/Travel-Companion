# Travel Companion Agent Guide

## 最新交接摘要（2026-07-12）

本節是給另一台電腦 / 新 Codex thread 接續用的最新狀態。進入專案後請先讀本節，再依任務查閱 `docs/001 V3-1_Handoff.md`、`docs/002 V3-1_Architecture_Decisions.md`、`docs/04_資料庫設計.md`、`docs/09_待辦事項(TODO).md`。

### 目前 Git 狀態

- Branch：`develop`
- 最新收尾版本：V3.1.3（iOS PWA 登入與照片同步修正）
- 前一個功能 commit：`1fc8e62 保留未同步其他資訊內容`
- 目前只允許留下 `.codex-remote-attachments/` 這類對話附件暫存未追蹤；程式與文件修改完成後應直接建立繁體中文 commit。
- 尚未確認是否已 push 到遠端。
- commit message 規則：使用者已要求「中文 commit」，後續 Codex 完成文件或程式修改後一律直接使用繁體中文 commit message 建立 commit，並回報實際使用的中文 commit message。

### 目前開發進度

V3-1 目前已完成：

- Folder 架構定案為純 tree model。
- Other Info / 參考資訊第一階段本機管理已完成，支援新增、編輯、刪除、URL 轉連結。
- 共同檢查清單已抽成 `ChecklistPage -> useChecklistState -> checklistService -> checklistStorage -> localStorage`。
- 共同檢查清單勾選狀態已依 `tripId` 保存於 localStorage。
- 共同檢查清單權限矩陣已落地：
  - `guest` / `user`：可見、不可勾選。
  - `trip_editor` / `super_admin`：可見、可勾選。
- 私人確認清單本機版已落地：
  - 左上角功能選單中，位於共同檢查清單下方。
  - 未登入使用者不顯示私人確認清單入口。
  - localStorage ownership 為 `userEmail + tripId`。
  - 支援新增、編輯、刪除、勾選與進度顯示。
- 私人確認清單已完成最小雲端同步：
  - `trip_editor` / `super_admin` 可同步自己的私人清單。
  - 使用 `owner_user_id = auth.uid()` 限制雲端 ownership。
  - 使用 `checklist_items.client_item_id` 對應本機 `private_...` item id。
  - UI 顯示同步中、已同步、同步失敗狀態。
- 共同檢查清單已完成最小雲端同步：
  - App 第一次進共同清單時，若 Supabase 沒有 `scope = shared` checklist，會用 Trip JSON `checklistData` 初始化。
  - 共同清單優先讀 Supabase shared checklist。
  - `trip_editor` / `super_admin` 可勾選並同步 `is_checked`。
  - `guest` / `user` 可見不可勾選，且看到乾淨未勾選版本，方便自行對照準備。
- Supabase checklist tables / RLS 已執行並由 Product Owner 人工確認：
  - RLS enabled。
  - policies 已建立。
  - helper functions 已建立。
  - indexes 包含 `checklist_items_one_client_item_per_checklist`。
  - `admin_users` 有 `email`、`role`、`trip_id`。
- `npm run lint` 通過。
- `npm run build` 通過，僅剩 Vite chunk size warning。
- Trip 管理第一階段大架構已完成：
  - App 內新增 / 編輯旅程基本資料。
  - App 內新增 / 編輯 / 刪除每日行程資料第一版。
  - App 內新增 / 編輯 / 刪除共同清單項目第一版。
  - 新增 / 編輯旅程時參與者至少需一位。
  - 可編輯者 Email 不可填入既有 `super_admin`。
  - 預設旅程選擇已支援旅程期間與最近旅程邏輯。
  - 旅程清單改為 JSON seed + Supabase trips + localStorage fallback 合併。
  - `super_admin` 可新增旅程。
  - `trip_editor` 可編輯被指派旅程。
  - 可編輯者 Email 由 `admin_users` 管理。
  - Trip Cloud schema / validation SQL 已透過 Supabase connector 執行並驗證。
  - 已補充 `harden_trip_cloud_grants` migration，移除舊的寬鬆 `admin_users` read policy 並收斂 grants。
  - 已補充 `tune_trip_cloud_advisor_findings` migration，處理 Trip Cloud 的 Supabase advisor findings。
  - 已完成自動化 smoke test：本機 base path / trip JSON 皆回 200；Supabase anon key 可讀 `trips` 且不可讀 `admin_users`。
- V3.1.0 追加修正已完成：
  - 版本資訊分成「本次更新內容」與「版本歷史」，避免重複顯示。
  - 更新提示只在 App / PWA 安裝模式顯示，一般瀏覽器網頁開啟不提示更新。
  - 手機瀏覽器未安裝 App 時顯示安裝建議，3 秒後自動收合。
  - 登入前新增安全提示，說明只使用 Google Email 與登入狀態。
  - 領隊 / 開車特殊資訊頁補上管理入口。
  - 記帳本附件入口改為「拍照」與「相簿」兩個明確入口。
  - 記帳本多人同步加入 Supabase realtime、30 秒輪詢與 focus / online / visibility fallback。
  - 附件同步失敗後重試時保留並復用本機附件暫存。
  - 旅程新增「參與者對應登入 Email」，記帳本付款人可依登入帳號鎖定。
- V3.1.1 已完成：
  - Other Info / 參考資訊接上最小雲端同步基礎。
  - `other_info_items` schema / RLS 已透過 Supabase connector 執行並驗證。
  - Supabase advisors 針對 Other Info 新增 schema 的 `search_path` 與 foreign key index findings 已修正。
  - PWA manifest、`package.json`、`package-lock.json` 與 App 版本設定皆已同步為 V3.1.1。
  - Other Info 雲端資料讀取會和既有 Trip 內容合併，保留尚未同步的本機 / Trip 內容。
- V3.1.2 已完成：
  - iOS PWA Google 登入不再強制 Google 帳號選擇提示，降低安裝版 App 重新驗證失敗機率。
  - iOS 照片附件支援空 MIME、HEIC / HEIF 轉 JPEG 後儲存與上傳。
  - 照片連結開啟改為使用者點擊當下先建立視窗，再填入 signed URL 或 blob URL，避免 iOS 阻擋 async 後開新視窗。
  - 全域表單欄位補 16px 字級與 viewport safe-area 設定，避免 iOS 點選輸入框後自動放大畫面。
  - 登入安全提示移除過長的「會使用」說明區塊。
  - 領隊導遊聯絡資訊 / 自駕租車資訊改用 `special-info-guided` / `special-info-self-guided` 專用資料夾，與一般「其他資訊」分類隔離。
  - 旅程載入時移除舊版 `leader_info` / `custom_info` 側欄入口，避免重複特殊資訊功能。
  - 一般「其他資訊」頁不再使用特殊資訊資料夾作為初始分類，避免分類數量為 0 卻顯示領隊 / 自駕卡片。
  - App 頁首新增旅程性質標籤，顯示「跟團」或「自助 / 自駕」。
  - `src/config/appVersion.ts`、`public/app-version.json`、`src/config/versionHistory.ts`、`package.json`、`package-lock.json` 與文件已同步到 V3.1.2。
- V3.1.3 已完成：
  - iOS PWA Google 登入改為專用 OAuth 開啟流程，降低 YouTube / Google App 兩步驗證後無法接回 App 的機率。
  - 登入提示補上 iOS 兩步驗證操作建議，可改用其他驗證方式或 Safari 網頁模式。
  - iOS 照片同步上傳改為 Blob 重新包裝，失敗時改用 ArrayBuffer 重試。
  - 照片同步失敗提示會顯示實際錯誤原因，方便後續實機排查。
  - `src/config/appVersion.ts`、`public/app-version.json`、`src/config/versionHistory.ts`、`package.json`、`package-lock.json` 與文件已同步到 V3.1.3。
  - 下一步由 Product Owner 手動將 `develop` 合併到 `main`，再執行發布流程。

### 本輪已完成修改

程式：

- `src/permissions/permission.ts`
  - 新增 checklist 權限欄位：
    - `canViewSharedChecklist`
    - `canToggleSharedChecklist`
    - `canViewPrivateChecklist`
    - `canTogglePrivateChecklist`
    - `canEditPrivateChecklist`
    - `canSyncPrivateChecklist`
  - `canSyncPrivateChecklist` 只給 `trip_editor` / `super_admin`。
  - 沒有任何「可讀取所有私人清單」權限。
- `src/hooks/useTripWorkspace.ts`
  - 讀取 Supabase Auth `session.user.id`。
  - 回傳 `userId`、`role`、`permission`、`isAssignedTrip`。
  - 允許 synthetic screen `privateChecklist`。
- `src/app/context/AppContext.ts`
  - 全域 context 補 `userId`。
- `src/App.tsx`
  - 接上 `AppContext.Provider`。
  - 接上 `PrivateChecklistPage`。
  - 以 `currentScreenType` 支援 synthetic screen。
  - 登出時清除 `userId`。
  - 登出或未登入狀態停在私人清單 / 記帳本時會導回行程頁。
- `src/components/layout/AppSidebar.tsx`
  - 登入時在共同檢查清單下方動態插入「私人確認清單」。
  - 未登入不顯示私人確認清單。
- `src/components/ChecklistPage.tsx`
  - 共同檢查清單可見 / 可勾選權限接進 UI。
- `src/components/PrivateChecklistPage.tsx`
  - 新增私人確認清單本機 UI。
  - 顯示私人清單雲端同步狀態。
- `src/types/checklist.ts`
  - 新增 `PrivateChecklist` / `PrivateChecklistItem`。
- `src/storage/privateChecklistStorage.ts`
  - 新增 `userEmail + tripId` localStorage storage layer。
- `src/services/privateChecklistService.ts`
  - 新增私人確認清單本機 service。
- `src/services/privateChecklistCloudService.ts`
  - 新增私人確認清單最小雲端同步 service。
  - 負責建立 / 讀取 private checklist cloud row。
  - 負責以 `client_item_id` 對應本機 item id 並推送新增、勾選、編輯、刪除。
- `src/hooks/usePrivateChecklistState.ts`
  - 新增私人確認清單 hook。
  - 接上進頁同步與本機操作後推送雲端。
- `src/components/OtherInfoPage.tsx`
  - 移除 effect 內同步 setState 的 lint 問題，改由 `App.tsx` 以 `key={selectedTripId}` 重掛載。
- `src/hooks/useExpenseBook.ts`
  - 修正 React Hooks lint 問題，將載入函式改為 `useCallback` 並補 dependencies。

文件：

- `docs/sql/001_checklist_cloud_schema.sql`
  - 新增 Supabase checklist cloud schema / RLS 設計。
  - 建立 `checklists`、`checklist_items`。
  - `checklist_items` 包含 `client_item_id` 欄位。
  - 以既有 `admin_users(email, role, trip_id)` 作為權限來源。
  - 私人清單 RLS 強制 `owner_user_id = auth.uid()`。
  - `super_admin` / `trip_editor` 不可讀取其他使用者私人確認清單。
  - 已執行到遠端 Supabase。
- `docs/sql/002_checklist_cloud_validation.sql`
  - Supabase SQL Editor 執行 schema 後的只讀驗證腳本。
- `docs/001 V3-1_Handoff.md`
- `docs/002 V3-1_Architecture_Decisions.md`
- `docs/04_資料庫設計.md`
- `docs/09_待辦事項(TODO).md`
  - 已同步更新 checklist 權限、私人確認清單本機版、Supabase schema/RLS 狀態。

### 尚未完成事項

最高優先：

- Product Owner 手動合併 `develop` 到 `main` 並發布 V3.1.3。
- 部署後以手機重新安裝 App，確認安裝資訊與 App 內版本皆為 V3.1.3。
- 實機回歸 iOS PWA Google 登入、照片附件上傳 / 開啟、輸入框縮放。
- 實機回歸領隊導遊聯絡資訊 / 自駕租車資訊與一般「其他資訊」分類互不污染。
- 實機測試 `super_admin` 新增旅程、`trip_editor` 編輯旅程。
- Guest 瀏覽旅程已於 2026-07-11 本機 App 驗證通過。
- Other Info / Reference 權限過濾、「管理 / 退出」模式、Supabase schema / RLS 與前端最小雲端同步已完成；下一步是實機回歸。

仍待評估：

- 共同檢查清單是否要支援 App 內新增 / 編輯 / 刪除 item。
- Checklist Pending Queue：離線或同步失敗時暫存待上傳操作的佇列。
- Checklist Conflict Resolution：本機與雲端同一筆清單資料都被修改時的合併或取捨規則。
- 是否要將 `admin_users` 中長期補上 `user_id uuid`。
  - 目前程式與 SQL 仍可沿用 `email + role + trip_id`，新增 `trip_editor` 只需維護 Supabase 表格，不需改程式。
  - 若未來 RLS 想更穩，可再補 `user_id`。
- 其他資訊 / 參考資訊已完成 Supabase schema / RLS 與最小雲端同步；尚未做多人協作衝突處理。
- Vite chunk size warning 尚未處理。

### 重要檔案

Checklist / Permission：

- `src/permissions/roles.ts`
- `src/permissions/roleMapper.ts`
- `src/permissions/permission.ts`
- `src/hooks/useTripWorkspace.ts`
- `src/components/ChecklistPage.tsx`
- `src/components/PrivateChecklistPage.tsx`
- `src/hooks/useChecklistState.ts`
- `src/hooks/usePrivateChecklistState.ts`
- `src/services/checklistService.ts`
- `src/services/privateChecklistService.ts`
- `src/services/privateChecklistCloudService.ts`
- `src/storage/checklistStorage.ts`
- `src/storage/privateChecklistStorage.ts`
- `src/types/checklist.ts`

App / navigation：

- `src/App.tsx`
- `src/app/context/AppContext.ts`
- `src/components/layout/AppSidebar.tsx`

Supabase / docs：

- `docs/sql/001_checklist_cloud_schema.sql`
- `docs/sql/002_checklist_cloud_validation.sql`
- `docs/sql/003_trip_cloud_schema.sql`
- `docs/sql/004_trip_cloud_validation.sql`
- `docs/001 V3-1_Handoff.md`
- `docs/002 V3-1_Architecture_Decisions.md`
- `docs/04_資料庫設計.md`
- `docs/09_待辦事項(TODO).md`

Other Info / lint related：

- `src/components/OtherInfoPage.tsx`
- `src/hooks/useExpenseBook.ts`

Trip Management：

- `src/components/TripEditorModal.tsx`
- `src/services/tripRepository.ts`
- `src/services/tripCloudService.ts`
- `src/storage/tripStorage.ts`
- `docs/12_Trip Cloud 驗證手冊.md`

### 下一步建議

1. 新對話先確認文件是否已同步到共同清單最新狀態。
2. 建議範圍：
   - Product Owner 手動合併 `develop` 到 `main` 並發布 V3.1.3。
   - 使用 `super_admin` / `trip_editor` 帳號完成 Trip Cloud 實機驗證。
   - 使用 `super_admin` / `trip_editor` 帳號完成 Other Info 雲端同步實機回歸。
3. 每次交付前執行：

   ```bash
   npm run lint
   npm run build
   ```

## Commit Message Language

- Codex 完成文件或程式修改並驗證通過後，應直接建立 Git commit；commit message 一律使用繁體中文。
- commit message 應簡潔描述實際變更，例如：`新增其他資訊本機管理`、`修正共同檢查清單名稱`。
- 不要使用英文 commit message，除非使用者在該次請求中明確指定。
- commit 完成後，Codex 必須回報「已使用中文 commit 訊息：`...` 完成提交」。
- 若驗證失敗、仍有阻塞、或工作樹包含不應由 Codex 一併提交的使用者變更，先回報原因並暫停 commit。

## Release Workflow

- 本專案保留 PWA 強制更新能力，但預設關閉。
- `FORCE_UPDATE` 預設為 `false`，因為 Travel Companion 是旅行中使用的 Offline First App，強制更新可能打斷行程查看、記帳或清單操作。
- 只有資料不相容、安全性修正、Supabase schema / RLS 權限規則變更、Sync / Pending Queue 重大資料風險，才建議啟用強制更新。
- 若 Product Owner 說「通過測試」或「測試完成」，Codex 必須主動告知目前版本號，建議下一個版本號，並要求 Product Owner 提供更新內容，或依本次變更提出建議更新內容。
- Product Owner 通過版本號、發布日期、更新內容與是否強制更新後，Codex 才更新 `src/config/appVersion.ts`、`src/config/versionHistory.ts`、`public/app-version.json` 與必要文件。
- 每次發布新版後，若使用者裝置已記錄的版本號與新版不同，App 至少需顯示一次版本更新提示。小更新可稍後，大更新不提供稍後；同版號、第一次瀏覽網站、換瀏覽器或 localStorage 尚未建立版本紀錄時，不得顯示「發現新版本」。
- 更新提示必須說明已儲存資料不會被更新清除，但編輯中尚未儲存的表單內容會因 reload 遺失，需更新後重新建立。
- 發布設定欄位：
  - `APP_VERSION`：目前發布版本。
  - `RELEASE_DATE`：發布日期，格式 `YYYY-MM-DD`。
  - `RELEASE_NOTES`：本次更新內容。
  - `FORCE_UPDATE`：是否強制更新。
- `public/app-version.json` 必須與版本設定欄位一致，並保持不被 PWA precache 快取，讓 Service Worker 偵測更新時可比對真正的最新版版本號。
- 版本設定與文件更新完成、驗證通過並建立 commit 後，Codex 應提醒 Product Owner 執行合併到主分支並部署更新；未經確認不得自行合併或部署。

## Terminology Guidance

- Codex 使用專業術語時，必須附上對應本專案功能的解釋。
- 不要只寫 `RLS`、`Pending Queue`、`Conflict Resolution` 這類工程名詞；第一次出現時要補一句它在 Travel Companion 裡的用途。
- 範例：`RLS` 是 Supabase 資料列權限，用來限制誰能讀寫特定 Trip 或使用者資料。
- 範例：`Pending Queue` 是離線或同步失敗時暫存待上傳操作的佇列，用來避免使用者在 Checklist、Expense、Other Info 裡的修改遺失。
本文件是給 AI agent / coding assistant 進入本專案時的工作入口。請先讀本文件，再依任務需要查閱 `docs/` 內的詳細文件。

## 專案定位

Travel Companion 是一個以旅程 `Trip` 為核心的旅行輔助工具。目標是讓使用者在旅行前與旅行中，可以用同一個 App 管理行程、清單、共同支出、參考資訊與後續擴充工具。

核心原則：

- **Trip First**：所有資料與功能都應該能回到某一個旅程。
- **Offline First**：本地資料與離線可用性優先，雲端同步是加值能力。
- **Tool / Module First**：每個 Travel Tool 應維持自己的 UI、state、business logic、storage 邊界。
- **Foundation First**：Workspace、Current Trip、Current User、Role、Permission、Sync、Storage 這些能力應作為共用基礎，不要散落在各工具內。
- **Simple First**：優先選擇可讀、可維護、低耦合的實作。

## 技術棧

- Frontend：React + TypeScript + Vite
- Styling：目前以 CSS / Tailwind utility class 混用
- Icons：`lucide-react`
- Local data：`localStorage`、IndexedDB 設計方向
- Cloud：Supabase Database / Storage / Auth
- Export：`xlsx`、`exceljs`
- Deploy：GitHub Pages

常用命令：

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

交付前至少執行：

```bash
npm run build
```

若任務改動較大或涉及 TS/React 規則，也執行：

```bash
npm run lint
```

## 重要文件入口

優先閱讀：

- `docs/000 Development Standard.md`：開發標準、角色分工、Build / Git / 文件規則。
- `docs/001 V3-1_Handoff.md`：V3-1 目前交接狀態。
- `docs/002 V3-1_Architecture_Decisions.md`：V3-1 架構決策。
- `docs/01_Travel Companion V3 架構藍圖.md`：V3 整體架構。
- `docs/02_產品開發路線圖.md`：Roadmap 與功能階段。
- `docs/04_資料庫設計.md`：資料模型方向。
- `docs/05_模組架構說明.md`：模組邊界。
- `docs/06_功能規格.md`：功能規格。
- `docs/08_開發規範.md`：程式與流程規範。
- `docs/09_待辦事項(TODO).md`：待辦與後續工作。
- `docs/11_名詞定義.md`：專案名詞。

注意：部分文件目前可能有編碼顯示問題。若內容在終端顯示亂碼，請交叉參考檔名、程式碼、README 與其他文件，不要直接覆蓋原文件。

## 目前專案狀態摘要

目前主線接近 V3 / V3-1 重構階段：

- 已有基本旅程載入、行程、清單、共同支出、附件同步、Excel 匯出等功能。
- `Expense` 模組已拆出 components / hooks / utils / storage / types。
- V3-1 正在處理 `Other Info` / Reference 類功能的本機資料管理與架構基礎。
- Checklist Module 已完成第一階段拆分，勾選狀態使用 Trip-scoped localStorage persistence。
- V3-1 已定義 `Folder` 應為通用 Tree 結構，不再用 `FolderType` 或 `category` 硬編碼分類。
- `OtherInfoService` 是 UI 取得 Folder / Item 的入口，UI 不應直接依賴 constants 或 storage 細節。
- `OtherInfoPage` 目前已有簡易管理 UI，可新增、編輯、刪除資料；目前只寫入 localStorage，不同步雲端。

## 目前目錄結構重點

```text
src/
  app/context/          App 層 context
  components/           UI components
    expense/            Expense UI
    layout/             App layout
  constants/            靜態資料與 app constants
  hooks/                跨 component 的 state / workflow
  permissions/          role / permission
  services/             UI 與資料來源之間的 service layer
  storage/              local/cloud storage 與 repository
  types/                domain types
  utils/                pure helper / business utilities
public/trips/           trip seed json
docs/                   project docs
```

## 架構規則

### Layering

建議資料流：

```text
UI
  -> hooks / services
  -> utils / repository
  -> storage / constants / cloud
```

請避免：

- UI 直接操作 storage key。
- UI 直接依賴大量 static constants 作為長期資料來源。
- 在 `App.tsx` 繼續堆疊大型功能。
- Travel Tool 之間互相讀寫內部 state。
- 為了短期功能加入會破壞 Trip / Workspace / Permission 邊界的捷徑。

### Travel Tool

每個 Travel Tool 設計前先確認：

- Tool 名稱與用途。
- 資料 ownership：資料屬於 Trip、User、Workspace 還是 Shared resource。
- 權限：誰能看、誰能新增、誰能修改、誰能刪除。
- Storage：local first 還是 cloud first。
- Sync：是否需要 pending queue / retry / conflict handling。
- Lifecycle：預設資料如何建立，何時更新，何時刪除。

## V3-1 Folder / Other Info 決策

`Folder` 是通用 tree node，目前定義於 `src/types/folder.ts`。

保留欄位方向：

- `id`
- `tripId`
- `parentId`
- `title`
- `order`
- `isSystem`
- `createdAt`
- `updatedAt`

決策：

- 不新增 `FolderType`。
- 不新增 `category`。
- 預設系統資料夾使用固定 ID，例如 `other-info-attractions`、`other-info-flights`。
- 預設資料夾與使用者資料夾都應走同一個 Folder tree 模型。
- UI 顯示分類時，應從 Folder tree 推導，不要另建分類 enum。

`Other Info` 目前相關檔案：

- `src/types/otherInfo.ts`
- `src/utils/otherInfoUtils.ts`
- `src/storage/otherInfoStorage.ts`
- `src/services/otherInfoService.ts`
- `src/constants/otherInfoData.ts`
- `src/components/OtherInfoPage.tsx`

工作方向：

- 讓 `OtherInfoPage` 只透過 service 取得資料。
- 將預設 folder、trip seed data、local user data 的合併邏輯放在 service/repository 層。
- Seed data 保留為預設資料；編輯 seed item 時以 localStorage 覆蓋，刪除 seed item 時以 `isDeleted` 標記覆蓋。
- Other Info 內容中的 `http` / `https` URL 應自動轉成可點擊超連結，並以新分頁開啟。
- 後續補上完整 folder tree、navigation、permission、sync / cloud persistence。

## V3-1 Checklist 決策

`Checklist` 目前相關檔案：

- `src/types/checklist.ts`
- `src/storage/checklistStorage.ts`
- `src/services/checklistService.ts`
- `src/hooks/useChecklistState.ts`
- `src/components/ChecklistPage.tsx`

目前狀態：

- Trip JSON 的 `checklistData` 作為共同檢查清單 seed。
- 勾選狀態依 `tripId` 寫入 localStorage，F5 後不會清空。
- 自由行 / 跟團各自保留勾選狀態。
- `App.tsx` 不再直接持有 checklist checked state。
- 資料流為 `ChecklistPage -> useChecklistState -> checklistService -> checklistStorage -> localStorage`。
- 進度計算會忽略已不存在的 checked item id。

後續方向：

- 規劃 Public Checklist / Private Checklist。
- 評估 APP 內新增 / 編輯 / 刪除 checklist item。
- 評估 cloud sync、pending queue 與權限過濾。

## Coding Style

- 使用 TypeScript，型別優先放在 `src/types/`，局部型別可放在檔案內。
- 優先 early return，避免深層巢狀。
- 函式保持單一目的，命名要直覺。
- import 依專案現有風格整理，不引入無關格式化 churn。
- 複雜流程才加註解，註解說明「為什麼」與「邊界」，不要描述語法。
- 修改既有檔案時，先觀察當地風格；不要順手重構不相關區塊。

建議檔案結構順序：

```text
Imports
Constants
Types
Public functions/components
Private helpers/components
```

## Product / AI 分工

Product Owner 決定：

- 產品方向
- UX 取捨
- 功能優先級
- 是否接受 scope change

AI agent 負責：

- 分析需求與現有架構
- 提出保守且可維護的實作
- 實作、Build、基本回歸檢查
- 誠實回報未完成、未測試或風險
- 只有在使用者明確要求時集中整理文件

若遇到產品決策不明，先用最小可逆方案前進；若會影響資料模型、權限、同步或 UX 主流程，先向 Product Owner 確認。

## 工作流程

1. 先讀相關文件與現有程式碼。
2. 判斷任務屬於哪個 Travel Tool / Foundation layer。
3. 釐清資料 ownership、permission、storage、sync 影響。
4. 小步實作，避免大範圍重寫。
5. 執行 `npm run build`。
6. 視風險執行 `npm run lint` 或手動回歸。
7. 回報修改內容、驗證結果、剩餘風險。

## Documentation Workflow

- 平常實作功能、修 Bug、重構時，不因每個小 Step 主動更新文件。
- 只有使用者明確要求時，才集中整理相關文件。
- 明確要求包含：「整理文件」「整理交接文件」「更新 README」「準備 commit」「commit 前整理」「要求 commit」或其他直接指定文件維護的指令。
- 若程式修改會讓既有文件中的定案規則明顯誤導後續開發，先提醒使用者，再由使用者決定是否立即更新文件。
- commit 前若使用者要求整理，優先更新交接文件、架構決策、TODO、版本紀錄等和本次變更直接相關的文件。

## Git / Delivery

- 文件或程式修改完成且驗證通過後，Codex 應直接建立 commit。
- commit message 一律使用繁體中文。
- commit 前必須先 build；依風險補跑 lint 或手動回歸。
- commit 完成後，回報實際使用的中文 commit message。
- 若工作樹已有使用者改動，不要 revert。
- 不要覆蓋 `.env` 或任何 secrets。
- 不要提交 `dist/`，除非使用者明確要求部署流程。

## Self Checklist

交付前確認：

- 是否符合 Trip First / Offline First / Module First？
- 是否把邏輯放在正確 layer？
- 是否避免讓 `App.tsx` 更膨脹？
- 是否保留既有使用者資料與 local storage 相容性？
- 是否處理空資料、未登入、無權限、loading/error 狀態？
- 是否已執行 build，並回報結果？
- 若未執行測試或 lint，是否明確說明原因？
