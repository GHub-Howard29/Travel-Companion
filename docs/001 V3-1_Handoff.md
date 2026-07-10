# Travel Companion V3-1 Handoff

更新日期：2026-07-11

---

# 目前開發狀態

V3-1 已完成底層架構建立，並已完成其他資訊 / 參考資訊簡易本機管理工具第一階段串接。
檢查清單模組已完成第一階段拆分、依旅程區分的本機持久化，以及私人確認清單最小雲端同步。
Trip 管理第一階段已完成，旅程清單切換前會重新同步 Supabase，避免選到其他設備已刪除的旅程。

目前已完成：

## Folder

完成：

- Folder Type 重構為純樹狀模型
- folderStorage
- folderRepository
- folderUtils
- folderDefaults
- createFolderWithId()

目前 Folder 已定案：

- 第一層：系統固定分類
- 第二層開始：自由建立
- 不使用 FolderType
- 不使用 category
- 以 parentId 建立 Tree

---

## Checklist

已完成：

- checklist.ts
- checklistStorage.ts
- checklistService.ts
- privateChecklistStorage.ts
- privateChecklistService.ts
- useChecklistState.ts
- usePrivateChecklistState.ts
- ChecklistPage.tsx
- PrivateChecklistPage.tsx
- App.tsx 檢查清單畫面抽出

目前：

- 「共同檢查清單」勾選狀態已依 `tripId` 寫入 localStorage
- 「私人確認清單」已建立獨立功能選單入口，位於共同檢查清單下方
- 私人確認清單已依 `userEmail + tripId` 寫入 localStorage
- 私人確認清單支援新增、編輯、刪除、勾選與進度顯示
- 私人確認清單已接上最小雲端同步
- `trip_editor` / `super_admin` 可同步自己的私人確認清單到 Supabase
- 私人確認清單雲端同步只讀寫 `owner_user_id = auth.uid()` 的資料，不可讀取其他使用者私人清單
- 私人確認清單雲端 item 使用 `client_item_id` 對應本機 `private_...` item id
- 私人確認清單 UI 會顯示同步中、已同步、同步失敗等狀態
- 共同檢查清單已完成最小雲端同步
- 共同檢查清單會用 Trip JSON `checklistData` 初始化 Supabase shared checklist rows
- `trip_editor` / `super_admin` 可同步共同檢查清單勾選狀態
- `guest` / `user` 查看共同檢查清單時顯示乾淨未勾選版本，用於自行準備
- 共同檢查清單已支援 App 內新增 / 編輯 / 刪除 item
- 共同檢查清單與私人確認清單管理操作已收合為「管理 / 退出」模式
- 未登入使用者不顯示私人確認清單入口
- 未登入狀態停留在私人確認清單或記帳本時，會自動導回行程頁
- 重新整理後可保留已勾選項目
- 自由行 / 跟團各自保留勾選狀態
- App.tsx 不再直接持有 checkedItems state
- ChecklistPage 自行管理分類、進度、空狀態與 item toggle
- Hook 只透過 checklistService 取得 / 更新資料
- checklistService 統一處理進度資料
- checklistStorage 負責 localStorage 讀寫與執行期資料驗證
- 進度計算會忽略已不存在的 item id

尚未完成：

- Checklist Pending Queue / Conflict Resolution 尚未實作
- Other Info / Reference 權限過濾尚未完成
- Other Info / Reference 與領隊導遊聯絡資訊 / 自駕租車須知尚未改為「管理 / 退出」模式
- Other Info / Reference 雲端同步尚未完成
- 記帳本編輯既有帳目時，附件尚不能單獨刪除
- 手機新增帳目附件入口尚需補齊拍照與選擇既有照片 / 檔案流程

權限定案：

共同檢查清單：

| 角色 | 可見 | 勾選 |
|---|---|---|
| guest | 可 | 不可 |
| user | 可 | 不可 |
| trip_editor | 可 | 可 |
| super_admin | 可 | 可 |

私人檢查清單：

| 角色 | 功能選單 | 可見 | 勾選 | 編輯（新增 / 刪除） | 雲端同步 |
|---|---|---|---|---|---|
| guest | 不顯示，或點選時要求登入 | 不可 | 不可 | 不可 | 不可 |
| user | 顯示 | 可，僅自己的私人清單 | 可，僅自己的私人清單 | 可，本機保存 | 不可 |
| trip_editor | 顯示 | 可，僅自己的私人清單 | 可，僅自己的私人清單 | 可 | 可 |
| super_admin | 顯示 | 可，僅自己的私人清單 | 可，僅自己的私人清單 | 可 | 可 |

已定案：

- `trip_editor` 依 `tripId` 分別定義。
- 私人檢查清單本機 ownership 使用 `userEmail + tripId`。
- `user` 可進入私人檢查清單，可新增 / 編輯 / 刪除，但只能保存於本機。
- `trip_editor` / `super_admin` 可新增 / 編輯 / 刪除自己的私人檢查清單，並可自動同步到雲端。
- `trip_editor` / `super_admin` 都不可查看其他使用者的私人檢查清單。
- 私人檢查清單放在左上角功能選單中，位置在共同檢查清單下方；不放進共同檢查清單頁面內。
- 共同檢查清單下一步雲端同步仍維持 guest / user 可見不可勾選，`trip_editor` / `super_admin` 可勾選。

---

## 其他資訊

已完成：

- otherInfo.ts
- otherInfoUtils.ts
- otherInfoStorage.ts
- otherInfoRepository.ts
- otherInfoService.ts
- otherInfoData.ts（第一批預設資料）
- OtherInfoPage 簡易管理畫面
- App.tsx otherInfo 類型串接
- AppSidebar.tsx otherInfo icon mapping
- Trip sidebarConfig 新增「其他資訊」
- 其他資訊內容 URL 自動轉換為可點擊超連結

目前：

- 自由行與跟團旅程皆已顯示「其他資訊」
- 參考資訊資料由預設資料 + 本機儲存資料合併後呈現
- 可新增、編輯、刪除其他資訊項目
- 目前只存 localStorage，不同步雲端
- 預設資料保留為預設內容
- 編輯 seed item 會以 localStorage 覆蓋
- 刪除 seed item 會寫入 `isDeleted` 標記
- Folder chips 自動換行，不使用水平 scrollbar
- 顯示資料筆數、空狀態與 item card
- 內容中的 `http` / `https` URL 會自動轉為超連結並以新分頁開啟
- 後續需改為預設瀏覽模式，有權限者先點「管理」才顯示新增、編輯、刪除，並提供「退出」按鈕

---

## Service

已建立：

OtherInfoService

目前提供：

- getDefaultFolders()
- getFolders()
- getItems()
- createOtherInfoItem()
- updateOtherInfoItem()
- deleteOtherInfoItem()

作為畫面唯一資料入口。

---

## Supabase Checklist Schema

已新增 SQL 設計檔：

- `docs/sql/001_checklist_cloud_schema.sql`

已由 Product Owner 在 Supabase SQL Editor 執行並人工確認完成。

此 SQL 採用目前既有的 `admin_users(email, role, trip_id)` 作為權限來源。

新增旅程或新增 `trip_editor` 時，只需維護 Supabase `admin_users` 資料，不需要修改程式。

私人確認清單雲端 RLS 以 `owner_user_id = auth.uid()` 限制。

因此：

- `super_admin` 不可查看其他使用者私人確認清單。
- `trip_editor` 不可查看其他使用者私人確認清單。
- `trip_editor` / `super_admin` 只可同步自己的私人確認清單。
- `checklist_items.client_item_id` 已建立，用來保存前端本機 item id。
- `checklist_items_one_client_item_per_checklist` index 已建立，用於穩定 upsert / mapping。
- validation SQL 已由 Product Owner 人工確認：RLS、policies、functions、indexes、`admin_users(email, role, trip_id)` 皆符合要求。

目前已確認：

- 私人確認清單新增 / 勾選可同步到 `checklist_items`。
- Supabase Table Editor 可看到 private item rows。
- 共同檢查清單已可同步到 Supabase shared checklist。

---

# 已完成檔案

src/types/

- folder.ts
- otherInfo.ts
- checklist.ts

src/storage/

- folderStorage.ts
- folderRepository.ts
- otherInfoStorage.ts
- otherInfoRepository.ts
- checklistStorage.ts
- privateChecklistStorage.ts

src/utils/

- folderUtils.ts
- folderDefaults.ts
- otherInfoUtils.ts

src/services/

- otherInfoService.ts
- checklistService.ts
- privateChecklistService.ts
- privateChecklistCloudService.ts

src/hooks/

- useChecklistState.ts
- usePrivateChecklistState.ts
- useOtherInfoForm.ts

src/components/

- ChecklistPage.tsx
- PrivateChecklistPage.tsx
- OtherInfoPage.tsx

src/constants/

- otherInfoData.ts

---

# Build

目前已執行並通過：

```bash
npm.cmd run build
```

僅剩 Vite chunk size warning，非 V3-1 阻塞項目。

---

# 下一步

建議流程：

1. 新對話先接近期 Bug Backlog 與管理入口一致化。
2. 近期 Bug Backlog：
   - 領隊導遊聯絡資訊 / 自駕租車須知與其他資訊改為「瀏覽模式 → 管理入口 → 編輯層 → 退出」。
   - 旅費記帳本編輯既有帳目時，補上既有附件單獨刪除功能。
   - 記帳本新增帳目附件入口補齊手機拍照與選擇既有照片 / 檔案流程。
3. Other Info / Reference 建議範圍：
   - 先定義權限矩陣。
   - 落地 UI 權限過濾。
   - 設計 Supabase schema / RLS。
   - 實作最小雲端同步。
   - 暫時不做完整 Pending Queue / Conflict Resolution。
4. 暫緩項目：
   - Checklist Pending Queue：離線或同步失敗時暫存待上傳操作的佇列。
   - Conflict Resolution：本機與雲端同一筆資料都被修改時的合併或取捨規則。
   - 新 Travel Tool。
5. 下一輪交付前執行：
   - `npm run lint`
   - `npm run build`
