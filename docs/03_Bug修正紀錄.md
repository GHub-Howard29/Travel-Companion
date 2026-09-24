# Bug 修正紀錄

> 本文件只追蹤未修正、待補驗與近期修正。
>
> 重整前的完整 BUG001～BUG031 內容原檔保留於《[archive/bug-history/03_Bug修正紀錄_完整歷史](archive/bug-history/03_Bug修正紀錄_完整歷史.md)》，沒有刪除。
>
> 最後整理：2026-09-23

## 未修正

### BUG007：帳本排序方式

- 現況：帳本依建立時間遞增排序，最新資料顯示在最下方。
- 狀態：待 Product Owner 確認預期排序與對現有瀏覽習慣的影響後再實作。

## 已修正、待補驗

| 編號 | 主題 | 待補驗範圍 |
|---|---|---|
| BUG003 | 手機附件拍照／相簿／檔案選擇 | iOS 與 Android 實機入口 |
| BUG006 | 帳目附件單獨刪除 | 附件刪除與重載後狀態 |
| BUG008 | Other Info 瀏覽／管理入口 | 瀏覽與管理模式回歸 |
| BUG009 | iOS 安裝 PWA 引導 | iOS Safari 與加入主畫面 |
| BUG010 | iOS 照片同步失敗 | 實機收集 IndexedDB、Canvas、Storage 與背景切換錯誤 |
| BUG011 | Android 附件拍照入口 | Android 與 iOS 實機 |
| BUG012 | 多人帳本即時刷新 | Realtime 與 30 秒輪詢備援 |
| BUG013 | 非強制更新的稍後提醒 | 安裝版 PWA 重開與再次提醒 |
| BUG014 | 帳本分攤取整 | TWD、JPY、KRW、USD、EUR 資料回歸 |
| BUG015 | Android PWA／iOS Safari 更新提示 | Android PWA 與 iOS Safari 實機 |
| BUG018 | 離線切換 Trip 後的私人清單同步 | 多行程離線新增、重連與不覆蓋遠端 |

詳細問題、原因、修正方式與舊驗證紀錄均保留在完整歷史檔。

## 近期修正

### BUG031：V3.9.1 正式 bundle 誤含本機 Supabase origin

- 影響：手機／PWA 更新後可能停在「正在建立雲端 safe 連線...」。
- 根因：production rebuild 讀入指向 loopback Supabase 的 `.env.local`。
- 修正：V3.9.2 新增 production 設定隔離、建置前 URL 防呆與產物掃描，並採必要更新向前修復。
- 狀態：已修正並發布；3.9.1 → 3.9.2、登入 session 恢復與 Guest Trip 載入已通過。

## Bug 管理原則

- 新 Bug 先記錄問題、重現條件、影響、根因假設、修正與驗證結果。
- 已修正但仍有實機或風險補驗的項目，保留於本文件。
- 發布且驗證完整後，將詳細記錄搬入 `archive/bug-history/`，本文件不長期累積已結案流水帳。
- 歷史紀錄只搬檔、不刪除；本文件與《09_待辦事項_TODO》的未完成狀態必須一致。
