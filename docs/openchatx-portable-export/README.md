# OpenChatX Portable Export

此資料夾包含可攜式的 OpenChatX Rule 與 Skill 文字定義，供另一台主機安裝使用。

## 匯出內容

- `global-skill-loading-rule.mdc`：Cursor 格式的全域規則匯出，設定為 `mode=always` / `alwaysApply=true`，無專案 globs。
- `openchatx-tool-usage/SKILL.md`：通用 OpenChatX 工具使用 Skill，包含 Skill 搜尋及以搜尋結果完整 `name` 載入的規範。
- `travel-companion-evidence-efficient/SKILL.md`：本次修正後的最新版 Travel-Companion 專用 Skill，新增本機測試資料庫上傳／下載長時間工作追蹤規則。
- `travel-companion-evidence-efficient-original/SKILL.md`：本次修正前的原始匯出版本，已改名保留供追溯；不是安裝目標。
- `engineering-decision-guard-trigger.mdc`：Engineering Decision Guard 的條件式觸發 Rule（`alwaysApply=false`）。
- `engineering-decision-guard/SKILL.md`：Engineering Decision Guard Skill，涵蓋工程決策保護、ADR、Hard Break 與跨工作階段重新核對。
- `INSTALL.md`：在另一台 OpenChatX 主機安裝與驗收的可複製指令。

## 跨主機注意事項

1. 本匯出只包含規則與 Skill 的文字定義，不包含 Toolbox 註冊資料、安裝狀態、MCP 連線、Provider、Node、Project 或其他主機設定。
2. 在目標主機先確認 Toolbox Manager／Rules／Skills 的實際 toolbox ID 與功能，再安裝；不要假設目標主機 ID 一定與 Home 相同。
3. Rule 與 Skill 必須分別安裝。只複製檔案不代表已註冊或啟用。
4. 安裝後開啟新工作階段，驗證 Rule 自動套用，再搜尋 Skill，並將搜尋回傳的完整 `name` 原樣傳入 load。
5. `node-rule-template.mdc` 與 `rule-template` 是目標資料夾原有內容，本次未覆寫或重新匯出。
