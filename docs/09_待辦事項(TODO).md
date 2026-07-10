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
- 私人確認清單已完成最小雲端同步
- 共同檢查清單已完成最小雲端同步
- Trip 管理第一階段大架構已完成：
  - App 內新增 / 編輯旅程基本資料
  - App 內新增 / 編輯每日行程資料第一版
  - App 內新增 / 編輯 / 刪除共同清單項目第一版
  - JSON seed + Supabase trips + localStorage fallback 合併
  - `super_admin` 新增旅程
  - `trip_editor` 編輯被指派旅程
  - 可編輯者 Email 由 `admin_users` 管理
  - 可編輯者 Email 不可填入既有 `super_admin`
  - 新增 / 編輯旅程時參與者至少需一位
  - 預設旅程選擇已支援旅程期間與最近旅程邏輯
  - Trip Cloud schema / validation SQL 已透過 Supabase connector 執行並驗證
- 已建立目前功能權限矩陣草案

目前開始：

Travel Tool 模組化落地。

---

# 五、下一步工作

依序進行：

## 近期高優先待辦（2026-07-11）

- [ ] 領隊導遊聯絡資訊 / 自駕租車須知與其他資訊管理入口一致化：預設為瀏覽模式，有權限者先點「管理」才進入新增、編輯、刪除層，管理層需提供「退出」按鈕。
- [ ] 旅費記帳本編輯模式補上既有附件單獨刪除功能：刪除附件時保留帳目資料，只移除附件與附件連結，並更新待同步狀態。
- [ ] 修正手機新增帳目附件入口：行動裝置需同時支援使用手機拍照與選擇既有照片 / 檔案，不可只跳出單一路徑。
- [ ] 上述三項完成後，需同步回寫 `docs/03_Bug修正紀錄.md` 的狀態與本交接文件。

---

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

近期補強：

- [ ] 記帳本編輯既有帳目時，附件區需支援「移除附件」而非只能更換檔案。
- [ ] 新增帳目與編輯帳目的附件入口需一致支援手機拍照與相簿 / 檔案選擇。

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

- [x] 將目前功能權限矩陣落地到 permission.ts
- [x] 將共同檢查清單顯示與勾選操作改由權限控制
- [x] 將共同檢查清單 / 私人檢查清單權限矩陣落地到 permission.ts
- [x] 建立私人檢查清單畫面與 localStorage 持久化
- [x] 定案私人檢查清單本機 ownership 使用 `userEmail + tripId`
- [x] 定案私人檢查清單放在左上角功能選單中，位於共同檢查清單下方
- [x] 定案 super_admin 不可查看其他使用者私人檢查清單
- [x] 確認 trip_editor 不可查看其他成員私人檢查清單
- [x] 評估共同檢查清單 App 內新增 / 編輯 / 刪除項目
- [x] 設計 Supabase checklist tables / RLS
- [x] 在 Supabase SQL Editor 執行 `docs/sql/001_checklist_cloud_schema.sql`
- [x] 在 Supabase SQL Editor 執行 `docs/sql/002_checklist_cloud_validation.sql`
- [x] 設計私人檢查清單雲端同步
- [x] 實作私人檢查清單最小雲端同步
- [x] 實作共同檢查清單最小雲端同步
- [x] 將 Trip JSON `checklistData` 初始化為 Supabase shared checklist rows
- [x] 共同檢查清單改為優先讀取 Supabase shared checklist
- [x] 共同檢查清單勾選狀態同步 Supabase
- [x] `guest` / `user` 查看共同檢查清單時顯示乾淨未勾選版本
- [x] 補上共同檢查清單權限過濾
- [x] 共同檢查清單 App 內新增 / 編輯 / 刪除項目第一版
- [x] 共同檢查清單管理入口已收合為「管理 / 退出」模式
- [x] 私人確認清單管理入口已收合為「管理 / 退出」模式

---

## 第五階段

已完成第一階段：

Trip 管理

- [x] App 內新增旅程基本資料
- [x] App 內編輯旅程基本資料
- [x] 旅程名稱顯示於旅程資料庫選單
- [x] 出發日期顯示於首頁標題並參與排序
- [x] 天數產生 Day 1 ~ Day N
- [x] 參與者作為帳本付款人來源
- [x] 新增 / 編輯旅程時參與者至少需輸入一位
- [x] 預設幣別作為帳本參考
- [x] 可編輯者 Email 同步 `admin_users`
- [x] 可編輯者 Email 不可填入既有 `super_admin`
- [x] 預設旅程依「今天位於旅程期間內 → 最近未來旅程 → 最近歷史旅程」選擇
- [x] App 內新增 / 編輯 / 刪除每日行程資料第一版
- [x] App 內新增 / 編輯 / 刪除共同清單項目第一版
- [x] `super_admin` 可新增旅程
- [x] `trip_editor` 可編輯被指派旅程
- [x] 旅程清單合併 JSON seed / Supabase trips / localStorage fallback
- [x] 設計 Supabase trips table / RLS
- [x] 建立 `docs/sql/003_trip_cloud_schema.sql`
- [x] 建立 `docs/sql/004_trip_cloud_validation.sql`
- [x] 透過 Supabase connector 執行 `docs/sql/003_trip_cloud_schema.sql`
- [x] 透過 Supabase connector 執行 `docs/sql/004_trip_cloud_validation.sql`
- [x] 補上 `harden_trip_cloud_grants` migration 收斂 grants
- [x] 補上 `tune_trip_cloud_advisor_findings` migration 處理 Trip Cloud advisor findings
- [x] 自動化 smoke test 確認本機 base path 與 Supabase anon RLS
- [ ] 實機測試 `super_admin` 新增旅程
- [ ] 實機測試 `trip_editor` 編輯被指派旅程
- [ ] 實機測試 Guest 瀏覽旅程

---

## 第六階段

已完成第一階段：

參考資訊模組

- [x] OtherInfoPage 簡易管理畫面
- [x] Folder chips 自動換行
- [x] 預設資料 + 本機儲存資料合併讀取
- [x] 新增 item 寫入 localStorage
- [x] 編輯 seed item 以 localStorage 覆蓋
- [x] 刪除 seed item 寫入 `isDeleted` 標記
- [x] `http` / `https` URL 自動轉為可點擊超連結
- [ ] 權限過濾
- [ ] 領隊導遊聯絡資訊 / 自駕租車須知與其他資訊改為瀏覽優先，透過管理入口進入下一層編輯
- [ ] 設計 Other Info Supabase schema / RLS
- [ ] 雲端同步
- [ ] 多人協作

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

文件採集中整理原則。

平常小步實作不逐次更新文件。

當 Product Owner 要求整理文件、整理交接文件、準備 Commit、要求 Commit，或階段收尾時，再依實際影響集中更新：

- 架構藍圖
- 模組架構
- Roadmap
- 名詞定義
- 版本更新紀錄
- 本文件

若程式修改會讓既有文件中的定案規則明顯誤導後續開發，先提醒 Product Owner，再由 Product Owner 決定是否立即更新文件。

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
- 視 Product Owner 要求集中整理文件

全部完成後，

方可視為該功能完成。

---

# 九、備註

Travel Companion V3 採用：

Trip（旅程）為產品核心。

Foundation 為共同能力。

旅行工具（Travel Tool）為產品功能。

所有新功能皆應遵循《Travel Tool 設計規格》後，再開始實作。

---

# 十、協作語言規則

Codex 使用專業術語時，必須附上對應本專案功能的解釋，避免只留下工程名詞。

例如：

- `RLS`：Supabase 資料列權限，用來限制誰能讀寫特定 Trip 或使用者資料。
- `Pending Queue`：離線或同步失敗時暫存待上傳操作的佇列，用來避免使用者在 Travel Tool 裡新增或修改資料後遺失。
- `Conflict Resolution`：當本機與雲端同一筆旅行資料都被修改時，決定保留哪一份或如何合併的規則。
