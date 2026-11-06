# OpenChatX Portable Export

此資料夾包含可攜式的 OpenChatX 通用 Skill 載入規則與工具使用 Skill。

## 匯出內容

- `global-skill-loading-rule.mdc`：Cursor 格式的全域規則匯出，設定為 `mode=always` / `alwaysApply=true`，無專案 globs。
- `openchatx-tool-usage/SKILL.md`：通用 Skill 完整內容，包含 Skill 搜尋及以搜尋結果完整 `name` 載入的規範。
- `INSTALL.md`：在另一台 OpenChatX 主機安裝與驗收的步驟。

## 跨主機注意事項

1. 本匯出只包含規則與 Skill 的文字定義，不包含 Toolbox 註冊資料、安裝狀態、MCP 連線、Provider、Node、Project 或其他主機設定。
2. 在目標主機先確認 Toolbox Manager／Rules／Skills 的實際 toolbox ID 與功能，再安裝；不要假設目標主機 ID 一定與 Home 相同。
3. Rule 與 Skill 必須分別安裝。只複製檔案不代表已註冊或啟用。
4. 安裝後開啟新工作階段，驗證 Rule 自動套用，再搜尋 Skill，並將搜尋回傳的完整 `name` 原樣傳入 load。
5. `node-rule-template.mdc` 與 `rule-template` 是目標資料夾原有內容，本次未覆寫或重新匯出。
