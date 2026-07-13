# Travel Companion V3 架構藍圖

> Version：V3.0
>
> 最後更新：2026-07

---

# 一、目的

本文件定義 Travel Companion V3 的整體產品架構。

所有功能、模組、資料流與未來擴充方向，皆以本文件為最高架構依據。

本文件著重於「產品架構」，不討論程式實作細節。

---

# 二、產品核心理念

Travel Companion 並不是由各種功能所組成，而是由「旅程（Trip）」所組成。

每一個旅程，都擁有自己的旅行資料。

例如：

- 記帳本
- 共同清單
- 私人確認清單
- 其他資訊

因此：

Trip（旅程）為整個產品的核心。

所有功能皆依附於 Trip。

不得獨立存在。

---

# 三、產品架構

```text
Travel Companion
        │
        ▼
      Trip（旅程）
        │
        ▼
    旅行工具（Travel Tool）
```

Travel Companion 管理多個旅程。

每個旅程擁有自己的旅行工具。

每個旅行工具管理自己的資料。

---

# 四、系統分層

```text
UI（使用者介面）
        │
        ▼
旅行工具（Travel Tool）
        │
        ▼
Foundation（共同能力）
        │
        ▼
Storage（資料存取）
        │
        ▼
Cloud Service（Supabase）
```

各層皆有明確責任。

不得跨層直接操作。

---

# 五、Foundation（共同能力）

Foundation 提供所有旅行工具共同使用的能力。

目前包含：

- Current Trip（目前旅程）
- Current User（目前使用者）
- Workspace（目前工作區）
- Permission（權限）
- Role（角色）
- Sync State（同步狀態）
- Storage（資料存取）

Foundation 不負責任何產品功能。

Foundation 僅提供共同能力。

所有商業邏輯皆由旅行工具自行管理。

---

# 六、Workspace

Workspace 代表：

> 目前正在操作的旅程。

例如：

目前 Workspace：

日本九州五日旅程

則：

- 記帳本
- 物品清單
- 旅行資訊

皆操作此旅程資料。

同一時間僅存在一個 Workspace。

Workspace 切換時，

所有旅行工具同步切換至新的旅程。

---

# 七、旅行工具（Travel Tool）

旅行工具代表：

依附於 Trip 的產品功能。

目前規劃：

- 記帳本
- 共同清單
- 私人確認清單
- 旅行資訊

目前取消或暫不規劃：

- 預約紀錄
- 行李清單
- 旅行日誌
- 保險資訊
- AI 助手
- 更多旅行工具

所有旅行工具：

- 可獨立開發
- 可獨立維護
- 可獨立測試

共同使用 Foundation 提供的能力。

不得互相依賴。

---

# 八、Travel Tool 設計規格

每一個新的 Travel Tool，

在開始設計與 Coding 前，

都必須先完成以下六項產品規格。

| 項目 | 說明 |
|------|------|
| 儲存位置（Storage） | 資料存放位置，例如本機或雲端。 |
| 資料擁有者（Ownership） | 資料屬於個人或旅程。 |
| 權限規則（Permission） | 哪些角色可以查看或操作，由 Permission Module 統一管理。 |
| 是否可編輯（Editable） | 功能是否允許修改，屬於產品規格，而非權限設定。 |
| 同步方式（Synchronization） | 是否需要同步，以及同步方式。 |
| 生命週期（Lifecycle） | 資料何時建立、何時刪除。 |

---

## Travel Tool 設計流程

未來新增任何 Travel Tool 時，皆遵循以下流程：

```text
需求分析
    │
    ▼
完成 Travel Tool 設計規格
    │
    ▼
架構設計
    │
    ▼
UI 設計
    │
    ▼
程式開發
    │
    ▼
Build
    │
    ▼
Test
    │
    ▼
Commit
    │
    ▼
視 Product Owner 要求集中整理文件
```

完成設計規格後，才開始 Coding。

---

# 九、資料流

Travel Companion 採用單向資料流。

```text
UI
│
▼
Travel Tool
│
▼
Foundation
│
▼
Storage
│
▼
Cloud Service
```

Travel Tool 不直接存取 Supabase。

所有資料存取皆透過 Storage Layer。

---

# 十、權限架構

所有權限皆由 Foundation 提供。

Travel Tool 不直接判斷角色。

正確流程：

```text
Travel Tool
        │
        ▼
Permission Module
        │
        ▼
Role
        │
        ▼
是否允許操作
```

例如：

- 是否可新增
- 是否可修改
- 是否可刪除
- 是否可同步

皆由 Permission Module 統一管理。

---

# 十一、同步架構

同步功能屬於 Foundation。

Travel Tool 不直接處理同步流程。

同步系統負責：

- Upload
- Download
- Pending Queue
- 自動同步
- 離線同步
- 衝突處理（有實際需求或 BUG 回報時再規劃）

所有需要同步的 Travel Tool 共用此架構。

---

# 十二、資料儲存架構

目前規劃：

```text
Storage
│
├── localStorage
├── IndexedDB
└── Supabase
```

不同 Travel Tool 可依產品需求使用不同儲存方式。

但皆透過 Storage Layer 操作。

不得直接操作資料來源。

# 十三、設計原則

Travel Companion V3 採用以下產品設計原則。

---

## Product First（產品優先）

所有設計皆以產品需求與使用情境為優先。

技術僅作為實現產品的工具。

---

## Trip First（旅程優先）

Trip（旅程）為整個產品核心。

所有資料、功能、權限皆依附於 Trip。

任何新增功能，都應先思考：

> 它屬於哪一個旅程？

而不是：

> 它要放在哪個資料夾？

---

## Foundation First（共同能力優先）

所有共同能力皆集中於 Foundation。

例如：

- Workspace
- Permission
- Role
- Sync
- Storage

Travel Tool 不重複實作共同能力。

---

## Module First（模組優先）

每個 Travel Tool 都是一個獨立模組。

應具備：

- 獨立 UI
- 獨立 State
- 獨立 Business Logic
- 獨立 Storage 操作

避免 Tool 彼此依賴。

---

## Simple First（簡單優先）

優先考慮：

- 易閱讀
- 易理解
- 易維護
- 易擴充

避免過度設計。

---

# 十四、未來擴充方式

新增任何功能時，

皆應先確認：

是否屬於新的 Travel Tool。

若答案為：

是。

則：

建立新的 Module。

避免修改既有 Module。

例如：

```text
Trip
│
├── 記帳本
├── 共同清單
├── 私人確認清單
└── 其他資訊
```

目前不新增新的 Travel Tool。若未來重新提出新工具，應以擴充為主。

避免破壞既有架構。

---

# 十五、Travel Tool 設計範例

任何新的 Travel Tool，

皆應先完成設計規格。

例如：

| 項目 | 範例 |
|------|------|
| 名稱 | 其他資訊 |
| 儲存位置 | 雲端 |
| 資料擁有者 | 旅程 |
| 權限規則 | 由 Permission Module 管理 |
| 是否可編輯 | 可 |
| 同步方式 | 自動同步 |
| 生命週期 | 使用者建立，旅程刪除時一併刪除 |

完成上述規格後，

才開始：

- 架構設計
- UI 設計
- Coding

---

# 十六、架構目標

Travel Companion V3 的架構目標為：

- 產品導向
- 模組化
- 高可讀性
- 高可維護性
- 高可擴充性
- 低耦合
- 不過度設計

希望未來新增任何 Travel Tool，

都能在不修改既有架構的前提下完成整合。

---

# 十七、總結

Travel Companion V3 採用：

Trip（旅程）作為產品核心。

Foundation 提供共同能力。

Travel Tool 提供產品功能。

Storage 提供資料存取。

Cloud Service 提供雲端服務。

所有設計皆遵循：

> **以旅程為核心，以產品為導向，以模組化為基礎，打造一套易維護、易擴充且能長期演進的旅行管理平台。**
