# 開發進度與待辦事項

> Version：V3.0
>
> 最後更新：2026-07

---

# 一、目的

本文件記錄目前開發進度、已完成項目與下一步工作。

所有開發進度皆以本文件為準。

---

# 二、目前開發階段

## V3 Foundation 重構

目前目標：

建立 Travel Companion V3 的共同能力（Foundation），讓所有旅行工具共用相同架構。

目前重點為：

- 建立長期可維護的架構
- 完成模組化
- 建立產品文件
- 建立開發規範

目前不以新增功能為優先。

---

# 三、已完成項目

## Foundation

- [x] Role Module
- [x] Permission Module
- [x] AppContext 第一階段整理
- [x] Workspace 架構設計
- [x] Permission 架構整理

---

## 架構

- [x] Trip 為產品核心
- [x] Foundation 架構確認
- [x] Workspace 定義完成
- [x] Travel Tool 設計規格建立
- [x] 產品架構完成

---

## 文件

- [x] 開發規範
- [x] 架構藍圖
- [x] 產品開發路線圖
- [x] 模組架構說明
- [x] 名詞定義
- [x] 新對話交接文件

---

# 四、目前開發狀態

目前已完成：

- 產品架構設計
- V3-1 其他資訊 / 參考資訊 localStorage 簡易管理第一階段
- 自由行 / 跟團參考資訊第一批預設資料
- 「其他資訊」已接入 trip sidebarConfig 與 App 工具切換
- 其他資訊已支援新增、編輯、刪除與 URL 超連結顯示
- 檢查清單模組已完成第一階段拆分
- 檢查清單勾選狀態已支援依旅程區分的 localStorage 持久化
- 已建立目前功能權限矩陣草案

目前開始：

Travel Tool 模組化落地。

---

# 五、下一步工作

依序進行：

## 第一階段

完成 Foundation。

包含：

- AppProvider
- Workspace Provider
- Permission Provider

---

## 第二階段

整理：

- hooks
- context
- provider

---

## 第三階段

開始整理：

Expense Module

---

## 第四階段

已完成第一階段：

檢查清單模組

- [x] 將「共同檢查清單」從 App.tsx 單一 checkedItems state 拆出
- [x] 建立 ChecklistPage
- [x] 建立 useChecklistState
- [x] 建立 checklistService
- [x] 建立 checklistStorage
- [x] 建立 checklist.ts
- [x] 勾選狀態依 tripId 保存於 localStorage
- [x] 重新整理後保留勾選狀態
- [x] 自由行 / 跟團各自保留勾選狀態
- [x] 進度計算忽略已不存在的 checked item id
- [x] 初步定義共同檢查清單 / 私人檢查清單權限矩陣

後續：

- [ ] 將目前功能權限矩陣落地到 permission.ts
- [ ] 將畫面顯示與操作統一改由權限控制
- [ ] 將共同檢查清單 / 私人檢查清單權限矩陣落地到 permission.ts
- [ ] 建立私人檢查清單畫面與 localStorage 持久化
- [x] 確認 trip_editor 不可查看其他成員私人檢查清單
- [ ] 評估 App 內新增 / 編輯 / 刪除檢查清單項目
- [ ] 評估雲端同步 / 待同步佇列
- [ ] 補上權限過濾

---

## 第五階段

已完成第一階段：

參考資訊模組

- [x] OtherInfoPage 簡易管理畫面
- [x] Folder chips 自動換行
- [x] 預設資料 + 本機儲存資料合併讀取
- [x] 新增 item 寫入 localStorage
- [x] 編輯 seed item 以 localStorage 覆蓋
- [x] 刪除 seed item 寫入 `isDeleted` 標記
- [x] `http` / `https` URL 自動轉為可點擊超連結
- [ ] 雲端同步
- [ ] 權限過濾

---

# 六、未來規劃

旅行工具：

- [ ] 預約紀錄
- [ ] 行李清單
- [ ] 旅行日誌
- [ ] 保險資訊
- [ ] AI 助手

---

# 七、文件維護

重要功能完成後：

同步更新：

- 架構藍圖
- 模組架構
- Roadmap
- 名詞定義
- 版本更新紀錄
- 本文件

文件與程式碼同步維護。

---

# 八、完成標準

每完成一個 Step：

- 分析
- 設計
- 確認
- Coding
- Build
- Test
- Commit
- 更新文件

全部完成後，

方可視為該功能完成。

---

# 九、備註

Travel Companion V3 採用：

Trip（旅程）為產品核心。

Foundation 為共同能力。

旅行工具（Travel Tool）為產品功能。

所有新功能皆應遵循《Travel Tool 設計規格》後，再開始實作。
