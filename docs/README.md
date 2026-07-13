# Travel Companion（旅行管理助手）

作者：Howard

---

# 專案目標

Travel Companion 是一套以「旅程（Trip）」為核心設計的旅行管理工具。

最初以旅遊共同記帳為出發點，目前已發展為支援離線使用、雲端同步及附件管理的旅行管理系統。

目前主要功能包含：

- 行程管理
- 共用旅費記帳
- 個人旅費記帳
- 離線記帳（Offline First）
- 照片附件管理
- 自動同步
- Excel 匯出
- GitHub Pages 部署

未來將持續加入：

- 旅行資訊（Reference）
- 私人物品準備清單（Checklist）
- 使用者權限管理
- Trip Dashboard（旅行控制中心）

希望所有與旅行有關的資料，都能集中管理於同一套系統。

---

# 開發目標

本專案希望做到：

- 完全前端架構
- 可離線使用（Offline First）
- 支援多人共同帳本
- 支援本機帳本
- 自動同步雲端資料
- 不需要安裝 APP
- 手機與電腦皆可使用
- 持續保持模組化設計，方便未來維護

---

# 使用技術

## Frontend

- React
- TypeScript
- Vite

## Storage

- IndexedDB
- localStorage

## Backend

- Supabase Database
- Supabase Storage
- Supabase Authentication

## Version Control

- Git
- GitHub

## Deploy

- GitHub Pages

---

# 系統架構

目前系統已完成 V2.0 重構。

```
UI
│
▼
React State
│
▼
Storage
│
├── localStorage
├── IndexedDB
└── Attachment Storage
│
▼
Sync Manager
│
▼
Supabase
```

程式模組：

```
App.tsx
│
├── Components
├── Hooks
├── Actions
├── Storage
├── Sync
├── Services
├── Utils
└── Types
```

---

# 專案版本

## V1.0.0

建立第一版旅行記帳系統。

完成：

- 共用旅費記帳
- 個人帳本
- Google 登入
- Excel 匯出
- 附件功能

---

## V2.0.0（目前正式版本）

完成整體重構。

完成內容：

- App.tsx 模組化
- Offline First
- IndexedDB
- Pending Queue
- 自動同步
- 附件同步
- Git Branch 開發流程
- 文件整理

目前系統已可穩定進行旅行記帳及離線同步。

---

## V3.0.0（規劃中）

預計新增：

- 旅行資訊（Reference）
- 私人物品準備清單（Checklist）
- 使用者權限管理
- 帳本 UI 優化
- 附件管理改善

---

# 開發原則

1. 一次只完成一個功能（Feature）。
2. 新增功能前先完成設計討論。
3. 每次修改皆須通過 `npm run build`。
4. 每完成一項功能皆需進行測試。
5. Git Commit 使用繁體中文。
6. 每個功能使用獨立 Feature Branch 開發。
7. 文件採集中整理原則；平常小步實作不逐次更新文件，只有在要求整理文件、整理交接文件、準備 commit 或要求 commit 時再一次更新。
8. 保持模組化設計，避免再次出現大型 App.tsx。
9. 不破壞既有功能。
10. 保持程式容易閱讀、容易維護。

---

# 專案理念

Travel Companion 的目標，不只是記錄每一筆旅費。

而是希望成為一套能陪伴每一次旅行的管理工具。

透過持續改善架構與功能，讓旅行前、旅行中、旅行後的所有資料，都能集中於同一套系統內管理。

---

最後更新：2026/07/13

目前版本：V3.1.5
