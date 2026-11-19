# OpenChatX Portable Export

此資料夾包含可攜式的 OpenChatX Rule 與 Skill 文字定義，供另一台主機安裝使用。

## 匯出內容

- `global-skill-loading-rule.mdc`：Cursor 格式的全域規則匯出，設定為 `mode=always` / `alwaysApply=true`，無專案 globs。
- `openchatx-tool-usage/SKILL.md`：通用 OpenChatX 工具使用 Skill，包含 Skill 搜尋及以搜尋結果完整 `name` 載入的規範。
- `travel-companion-evidence-efficient/SKILL.md`：本次修正後的最新版 Travel-Companion 專用 Skill，新增本機測試資料庫上傳／下載長時間工作追蹤規則。
- `travel-companion-evidence-efficient-original/SKILL.md`：本次修正前的原始匯出版本，已改名保留供追溯；不是安裝目標。
- `engineering-decision-guard-trigger.mdc`：Engineering Decision Guard 的條件式觸發 Rule（`alwaysApply=false`），含定案即落檔及解除／移入歷史的判斷條件。
- `engineering-decision-guard/SKILL.md`：最新版 Engineering Decision Guard Skill，涵蓋專案決策索引必讀、明確核准後立即落檔、歷史移轉條件與程序，以及跨工作階段重新核對。
- `INSTALL.md`：在另一台 OpenChatX 主機安裝與驗收的可複製指令。

## 跨主機同步原則

1. 本匯出只包含 Rule 與 Skill 的文字定義，不包含 Toolbox 註冊資料、安裝狀態、MCP 連線、Provider、Node、Project 或其他主機設定。
2. 在目標主機先確認 Rules／Skills 匯入工具的實際 Schema 與 Toolbox ID；不要假設不同主機的 ID 一定相同。
3. Rule 與 Skill 必須分別處理。只複製檔案不代表已註冊或啟用。
4. 每次只指定一個 Skill 資料夾或一個 `.mdc` Rule 檔案執行匯入，並使用 `replace=true`：同名不存在就新增；同名已存在就不論內容是否相同，直接以來源檔覆蓋。不需要讀取或比較目標既有內容，也不需要先刪除再重建。
5. `replace=true` 只作用於本次指定的單一來源項目，不是整個 Toolbox 批次替換。安裝後必須讀回驗證來源內容；Rule 另須核對啟用模式與 globs 設定。
6. 若目標主機的實際匯入工具不支援 `replace=true`，依該主機正式支援的單項替換方式處理並回報，不可擅自刪除整個 Toolbox。
7. 安裝後開啟新工作階段，驗證 Rule 自動套用，再搜尋 Skill，並將搜尋回傳的完整 `name` 原樣傳入 load。
8. `node-rule-template.mdc` 與 `rule-template` 是目標資料夾原有內容，本次未覆寫或重新匯出。
