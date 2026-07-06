# 開發 Roadmap

本文件用來規劃 Travel Companion 未來版本的開發方向。

每完成一個版本後，再依序進入下一個版本開發。

---

# V1.x（已完成）

## V1.0.0

開始：

2026

目的：

建立第一版旅行記帳系統。

完成內容：

- 共用旅費記帳
- 個人旅費記帳
- Google 登入
- 附件上傳
- Excel 匯出
- GitHub Pages 部署

狀態：

✅ 已完成

---

# V2.x（已完成）

## V2.0.0

開始：

2026

完成：

2026/07

目的：

完成整體系統重構，建立可長期維護的架構。

完成內容：

### 系統架構

- App.tsx 模組化
- Storage 重構
- Attachment 模組整理
- Sync 模組整理
- Type 集中管理
- 共用工具函式整理

### 本機儲存

- IndexedDB
- localStorage
- Attachment Storage

### 同步機制

- Offline First
- Pending Queue
- 自動同步
- 手動同步
- Pending Badge
- 附件同步

### 開發流程

- Git Branch Flow
- Feature Branch
- 文件整理

完成目標：

- 離線可正常操作
- 自動同步
- 穩定同步附件
- 建立 V3 擴充基礎

狀態：

✅ 已完成

---

# V3.x（開發中）

V3 系列目標：

建立完整旅行管理平台。

除了旅行記帳之外，加入旅行前準備、權限管理與資訊整合功能。

---

## V3.0.0

開始：

2026/07/06

目的：

建立整個系統的 Permission Framework（權限架構）。

完成內容：

### Permission Framework

- Google Login 整合
- Supabase Role 整合
- Permission Provider
- Permission Hook
- Permission Guard
- Permission Service

建立統一權限管理：

- canUseCloudExpense()
- canUseLocalExpense()
- canViewReference()
- canEditReference()
- canViewSharedChecklist()
- canEditSharedChecklist()
- canUseMyChecklist()

角色：

- super_admin
- trip_editor
- 一般登入使用者
- Guest

完成目標：

建立所有功能共用的權限架構。

避免後續功能重複修改權限。

狀態：

🚧 規劃中

---

## V3.1.0

目的：

新增 Reference（旅行資訊）。

預計完成：

- 每個 Trip 建立自己的 Reference
- 新增資料
- 修改資料
- 刪除資料
- 標題
- 說明
- 網址

支援：

- 網頁
- Google 文件
- PDF
- Word
- 其他網址

權限：

- super_admin：可編輯
- 其他使用者：唯讀

完成目標：

集中管理旅行攻略、交通資訊、伴手禮等旅行資料。

狀態：

未開始

---

## V3.2.0

目的：

新增 Checklist。

完成：

### Shared Checklist（共用清單）

由管理者維護。

功能：

- 新增
- 修改
- 刪除

一般使用者：

第一次使用建立 Local 副本。

之後只同步新增項目。

---

### My Checklist（我的清單）

用途：

個人旅行準備事項。

例如：

- 個人物品
- 相機
- 常備藥
- 私人提醒

所有勾選：

只保存於 IndexedDB。

永遠不上傳 Supabase。

完成目標：

建立完整旅行準備功能。

狀態：

未開始

---

## V3.3.0

目的：

改善帳本使用體驗。

預計完成：

- 可修改記帳日期
- 日期分頁
- 最新排序
- Excel 新增記帳日期欄位

完成目標：

提升帳本操作效率。

狀態：

未開始

---

## V3.4.0

目的：

改善附件管理。

預計完成：

- 編輯時可直接刪除附件
- 保留原帳目
- 更新附件連結
- 無附件自動顯示一般文字

完成目標：

提升附件管理便利性。

狀態：

未開始

---

## V3.5.0

目的：

改善手機操作體驗。

預計完成：

- 支援拍照
- 支援相簿
- 支援檔案選擇
- Mobile UI 改善

完成目標：

提升手機使用體驗。

狀態：

未開始

---

# V4.x（未來規劃）

## V4.0.0

目的：

建立 Trip Dashboard。

預計內容：

- 旅行總覽
- 花費摘要
- 快速功能入口
- 同步狀態
- Checklist 狀態
- Reference 快速開啟
- 統計分析

完成目標：

將 Travel Companion 提升為完整旅行管理平台。

狀態：

尚未規劃

---

# 開發流程

每一個 Feature 皆遵循以下流程：

1. 分析需求。
2. 設計資料結構。
3. 確認架構。
4. 修改程式。
5. npm run build。
6. 功能測試。
7. Git Commit（繁體中文）。
8. Merge。
9. 更新文件。

---

# Git Branch 規範

正式版本：

main

功能開發：

feature/permission

feature/reference

feature/checklist

feature/expense-date

feature/attachment-delete

feature/mobile-upload

Bug 修正：

hotfix/*

---

最後更新：2026/07/06

目前版本：V2.0.0