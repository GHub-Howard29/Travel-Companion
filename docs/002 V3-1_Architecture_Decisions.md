# V3-1 已定案內容

本文件記錄 V3-1 開發期間正式定案之架構。

未來除非發現邏輯錯誤，否則不得重新設計。

---

# 一、Folder 架構

Folder 採用純 Tree 架構。

保留：

- id
- tripId
- parentId
- title
- order
- isSystem
- createdAt
- updatedAt

移除：

- FolderType
- category

分類由第一層固定 Folder 代表。

---

# 二、其他資訊 UI

左上角功能：

- 行程選擇
- 團體清單
- 記帳本
- 其他資訊
- 私人確認清單

點擊後：

自動收起左側功能列。

切換主畫面。

---

# 三、其他資訊呈現方式

V3-1 第一階段：

採參考資訊簡易本機管理工具。

已落地：

- 左側工具列顯示「其他資訊」
- 主畫面顯示參考資訊 / 旅行資訊
- 第一層固定分類以 folder chips 呈現
- Chips 自動換行
- 顯示資料筆數、空狀態與 item card
- 可新增、編輯、刪除其他資訊項目
- 內容中的 `http` / `https` URL 自動轉為可點擊超連結
- 超連結以新分頁開啟
- `text` 類型維持原本文字頁
- 僅 `otherInfo` 類型進入 OtherInfoPage

V3-1 第一階段尚不提供：

- 雲端同步
- 多人協作
- 權限過濾
- 完整 folder tree navigation

後續完整模式：

第一層：

固定分類卡片。

例如：

- 景點
- 機票
- 飯店
- 交通
- 保險
- ...

第二層：

旅程資料卡片。

例如：

景點

↓

淺草

↓

晴空塔

↓

新宿

第三層：

資料分類。

例如：

注意事項

必看

必玩

最後才顯示真正內容。

不採 Tree 展開方式。

採：

一層一頁。

---

# 四、固定分類

第一層：

系統固定。

不可由 App 編輯。

使用固定 ID。

例如：

other-info-attractions

other-info-flights

...

避免重新 Build 後 Folder ID 改變。

---

# 五、資料維護方式

其他資訊：

定位為：

預設資料 + localStorage 本機覆寫資料。

預設資料維護流程：

修改資料

↓

Build

↓

Deploy

↓

使用者查看

App 內簡易管理流程：

新增 item

↓

寫入 localStorage

編輯 seed item

↓

以 localStorage item 覆蓋相同 id 的 seed item

刪除 seed item

↓

寫入 `isDeleted` 標記

目前不提供：

- 雲端同步
- Pending Queue
- Conflict Resolution

---

# 六、角色

V3 權限分級草案：

- `guest`：未登入使用者
- `user`：一般登入使用者
- `trip_editor`：旅程成員，依 `tripId` 分別定義
- `super_admin`：系統管理員

核心規則：

- `guest`：全部預設唯讀，部分功能不得讀取或使用
- `user`：全部預設唯讀，部分功能可以離線使用
- `trip_editor`：全部預設唯讀，部分功能可以共同使用
- `super_admin`：全部可以編輯，包含新增、修改、刪除

目前程式：

保留角色擴充能力。

OtherInfoItem：

保留：

allowedRoles

但：

V3-1

不實作：

角色判斷。

不實作：

權限過濾。

待其他資訊功能完成後，再實作。

注意：

角色命名沿用目前程式既有定義：

`TRIP_EDITOR: "trip_editor"`

後續文件與程式皆統一使用 `trip_editor`，避免與既有 Supabase / local admin profile role 字串混淆。

---

# 七、Checklist 第一階段

檢查清單模組第一階段採：

依旅程區分的本機持久化。

已落地：

- `ChecklistPage` 負責檢查清單畫面
- `useChecklistState` 負責畫面狀態轉接
- `checklistService` 負責進度資料與資料操作
- `checklistStorage` 負責 localStorage 讀寫與執行期資料驗證
- `checklist.ts` 定義 `ChecklistProgress`

資料流：

```text
ChecklistPage
↓
useChecklistState
↓
checklistService
↓
checklistStorage
↓
localStorage
```

目前資料：

- Trip JSON 的 `checklistData` 仍作為共同檢查清單 seed
- 勾選狀態依 `tripId` 寫入 localStorage
- F5 後保留勾選狀態
- 不同 Trip 各自保留勾選狀態
- 進度計算忽略已不存在的 checked item id

V3-1 第一階段尚不提供：

- 共同檢查清單 / 私人檢查清單實體資料拆分
- App 內新增檢查清單項目
- App 內編輯檢查清單項目
- App 內刪除檢查清單項目
- 雲端同步
- Pending Queue
- 權限過濾

---

# 八、Checklist 權限草案

Checklist 後續拆成：

- 共同檢查清單
- 私人檢查清單

## 共同檢查清單

定位：

Trip 共同準備事項。

目前已建立。

| 角色 | 可見 | 勾選 |
|---|---|---|
| guest | 可 | 不可 |
| user | 可 | 不可 |
| trip_editor | 可 | 可 |
| super_admin | 可 | 可 |

規則：

- `guest` 可查看，但不可勾選。
- `user` 可查看，但不可勾選。
- `trip_editor` 依 `tripId` 判斷是否可勾選。
- `super_admin` 可勾選所有 Trip 的共同檢查清單。

## 私人檢查清單

定位：

個人準備事項。

目前待建立。

| 角色 | 可見 | 勾選 | 編輯（新增 / 刪除） |
|---|---|---|---|
| guest | 不可 | 不可 | 不可 |
| user | 不可 | 不可 | 可，本機保存 |
| trip_editor | 可 | 可 | 可 |
| super_admin | 可 | 可 | 可 |

規則：

- `guest` 不可使用私人檢查清單。
- `user` 可建立自己的私人檢查清單，但資料先保存於本機。
- `trip_editor` 可使用與管理自己的私人檢查清單。
- `trip_editor` 不可查看其他成員的私人檢查清單。
- `super_admin` 可使用與管理所有私人檢查清單。

待確認：

- `user` 的私人檢查清單是否要顯示在目前 Trip 畫面，或獨立於 Trip。
- 私人檢查清單未來若同步雲端，資料歸屬應以 `userId + tripId` 或僅 `userId` 定義。

---

# 九、目前功能權限矩陣草案

本節作為後續修改 `permission.ts` 與 UI 顯示邏輯的依據。

## 行程

| 角色 | 可見 | 編輯 |
|---|---|---|
| guest | 可 | 不可 |
| user | 可 | 不可 |
| trip_editor | 可 | 不可 |
| super_admin | 可 | 可 |

## 純文字頁

例如：

- 自駕租車須知
- 領隊導遊聯絡資訊

| 角色 | 可見 | 編輯 |
|---|---|---|
| guest | 可 | 不可 |
| user | 可 | 不可 |
| trip_editor | 可 | 不可 |
| super_admin | 可 | 可 |

## 其他資訊 / 參考資訊

| 角色 | 可見 | 新增 | 編輯 | 刪除 |
|---|---|---|---|---|
| guest | 可 | 不可 | 不可 | 不可 |
| user | 可 | 不可 | 不可 | 不可 |
| trip_editor | 可 | 不可 | 不可 | 不可 |
| super_admin | 可 | 可 | 可 | 可 |

規則：

- 參考資訊類資料由 `super_admin` 維護。
- `guest`、`user`、`trip_editor` 皆為唯讀。
- 目前 App 內修改仍保存於 localStorage，尚未同步雲端。

## Expense

| 角色 | 可見 | 新增 | 編輯 | 刪除 | 同步 |
|---|---|---|---|---|---|
| guest | 不可 | 不可 | 不可 | 不可 | 不可 |
| user | 可，僅本機個人帳本 | 可，本機離線 | 可，僅自己的本機資料 | 可，僅自己的本機資料 | 不可 |
| trip_editor | 可，共同帳本 | 可，共同新增 | 可，依共同帳本規則 | 可，依共同帳本規則 | 可 |
| super_admin | 可 | 可 | 可 | 可 | 可 |

規則：

- `user` 可使用本機個人帳本。
- `trip_editor` 可使用所屬 Trip 的共同帳本。
- `super_admin` 可管理全部帳本資料。

## Checklist

Checklist 權限以第八節為準。

目前已定案：

- 共同檢查清單：`guest` / `user` 可見不可勾選，`trip_editor` / `super_admin` 可見可勾選。
- 私人檢查清單：`guest` 不可使用，`user` 可本機建立，`trip_editor` 僅可使用自己的，`super_admin` 可管理全部。

---

# 十、UI 原則

第一層：

固定分類。

第二層：

旅程資料。

第三層：

資料分類。

第四層：

內容。

手機操作：

一次只呈現一層。

避免 Tree 過長。

---

# 十一、維護原則

本專案主要供：

自己及固定旅行團使用。

不是面向大眾。

因此：

避免過度開發。

優先：

降低維護成本。

新增旅程時：

主要修改：

otherInfoData

及必要資料檔。

程式架構保持不變。

重新 Build 後發布即可。

---

# 十二、文件更新提醒（V3-1 完成後）

完成 V3-1 時，需同步更新：

- README
- 06 功能規格
- 04 資料庫設計（如有影響）
- 系統架構文件
- Development Roadmap

新增本次正式定案內容。
