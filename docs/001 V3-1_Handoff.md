# Travel Companion V3-1 Handoff

更新日期：2026-07-09

---

# 目前開發狀態

V3-1 已完成底層架構建立，並已完成其他資訊 / 參考資訊簡易本機管理工具第一階段串接。
檢查清單模組也已完成第一階段拆分與依旅程區分的本機持久化。

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
- 私人確認清單已依 `userId + tripId` 寫入 localStorage
- 私人確認清單支援新增、編輯、刪除、勾選與進度顯示
- 未登入使用者不顯示私人確認清單入口
- 重新整理後可保留已勾選項目
- 自由行 / 跟團各自保留勾選狀態
- App.tsx 不再直接持有 checkedItems state
- ChecklistPage 自行管理分類、進度、空狀態與 item toggle
- Hook 只透過 checklistService 取得 / 更新資料
- checklistService 統一處理進度資料
- checklistStorage 負責 localStorage 讀寫與執行期資料驗證
- 進度計算會忽略已不存在的 item id

尚未完成：

- 共同檢查清單 App 內新增 / 編輯 / 刪除 item
- 共同檢查清單雲端同步
- 私人確認清單雲端同步
- Supabase SQL Editor 尚未執行 checklist schema
- Checklist sync policy 尚未接進前端

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
- 私人檢查清單 ownership 使用 `userId + tripId`。
- `user` 可進入私人檢查清單，可新增 / 編輯 / 刪除，但只能保存於本機。
- `trip_editor` / `super_admin` 可新增 / 編輯 / 刪除自己的私人檢查清單，並可自動同步到雲端。
- `trip_editor` / `super_admin` 都不可查看其他使用者的私人檢查清單。
- 私人檢查清單放在左上角功能選單中，位置在共同檢查清單下方；不放進共同檢查清單頁面內。

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

目前尚未直接執行到 Supabase。

此 SQL 採用目前既有的 `admin_users(email, role, trip_id)` 作為權限來源。

新增旅程或新增 `trip_editor` 時，只需維護 Supabase `admin_users` 資料，不需要修改程式。

私人確認清單雲端 RLS 以 `owner_user_id = auth.uid()` 限制。

因此：

- `super_admin` 不可查看其他使用者私人確認清單。
- `trip_editor` 不可查看其他使用者私人確認清單。
- `trip_editor` / `super_admin` 只可同步自己的私人確認清單。

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

src/hooks/

- useChecklistState.ts
- usePrivateChecklistState.ts
- useOtherInfoForm.ts

src/components/

- ChecklistPage.tsx
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

1. 瀏覽器手測其他資訊：
   - 左側是否出現「其他資訊」
   - 自由行 / 跟團切換後資料是否各自正確
   - folder chips 是否換行整齊
   - 新增、編輯、刪除後 localStorage 是否正確保留
   - 編輯 / 刪除 seed item 後是否正確覆蓋預設資料
   - `http` / `https` URL 是否可點擊並開新分頁
   - 原本文字頁是否仍維持 Text Page 呈現

2. 瀏覽器手測 Checklist：
   - 勾選項目後重新整理是否保留
   - 自由行 / 跟團切換後是否各自保留
   - 勾選進度是否正確
   - 若 trip seed item 變動，已不存在的 checked id 是否不影響進度

3. 下一步建議：
   - 先暫停新增功能，優先定案權限模型
   - 依目前功能權限矩陣調整 permission.ts
   - 將畫面顯示與操作統一改由權限控制
   - 依共同 / 私人檢查清單權限矩陣設計資料模型
   - 將 permission.ts 的 checklist 權限調整為 guest / user / trip_editor / super_admin
   - 再決定是否提供 App 內新增 / 編輯 / 刪除檢查清單項目
   - 評估檢查清單是否需要雲端同步 / 待同步佇列
