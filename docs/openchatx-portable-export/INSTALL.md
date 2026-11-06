# 安裝到另一台 OpenChatX 主機

本文件說明將本資料夾內的全域 Rule 與通用 Skill 安裝到另一台 OpenChatX 主機的正確流程。以下路徑假設整個匯出資料夾已複製到目標主機且位置相同；若不同，請替換成本機實際路徑。

## 1. 複製匯出資料夾

將整個 `openchatx-portable-export` 資料夾複製到目標主機可存取的位置。

## 2. 匯入 Skill（使用 store_skill）

在 OpenChatX 對話中，要求執行 `store_skill`，參數如下：

```text
action = import
toolbox = skills
directory = D:\Project\Travel-Companion\docs\openchatx-portable-export\openchatx-tool-usage
replace = true
```

說明：
- `directory` 必須指向包含 `SKILL.md` 的 Skill 資料夾，不是父層匯出資料夾。
- `replace = true` 表示遇到同名 Skill 時以匯入版本取代既有內容；使用前應確認來源資料夾是預期版本。
- 匯入成功後，在「工具箱 → Skills」確認 `openchatx-tool-usage` 存在且已啟用。
- 接著重新載入 Skills Toolbox。
- 最後以 `skill_search` 搜尋 Skill，將搜尋結果回傳的完整 `name` 原樣傳入 load，確認讀取到 Markdown 內容。

## 3. 匯入全域 Rule（使用 rule_manage）

在 OpenChatX 對話中，要求執行 `rule_manage`，參數如下：

```text
action = import
toolbox_id = rules
format = cursor
source = D:\Project\Travel-Companion\docs\openchatx-portable-export\global-skill-loading-rule.mdc
replace = false
```

說明：
- **`source` 必須指向單一 `.mdc` 檔案的完整路徑，不可指向匯出資料夾。** Home 主機實測資料夾路徑會回報 `EISDIR: illegal operation on a directory, read`。
- `format = cursor` 指定匯入 Cursor 格式的 Rule。
- `replace = false` 可避免直接覆蓋目標主機既有的同名 Rule。
- 若回報 `rule_exists`，代表同名 Rule 已存在，匯入未覆蓋它。此時先使用 Rule 清單或 `rule_resolve` 讀取既有規則，與本匯出檔比對；確認要更新後，才另行以 `replace = true` 匯入，或使用 Rule edit 更新。
- 匯入成功後，使用 Rule resolve/load 確認 `global-skill-loading-rule` 已註冊，並確認 `alwaysApply=true`、globs 為空。
- 若 Rule 匯入工具回報錯誤，不可只因檔案存在或工具有回應就視為完成；應讀回規則清單或載入該規則確認。

## 4. 最終驗收

1. 在目標主機的「工具箱 → Skills」確認 `openchatx-tool-usage` 存在且已啟用。
2. 重新載入 Skills Toolbox。
3. 使用 `skill_search` 搜尋該 Skill，並使用搜尋結果的完整 `name` 載入；確認有完整 Markdown 內容。
4. 使用 Rule resolve/load 確認 `global-skill-loading-rule` 已匯入，且 `alwaysApply=true`、globs 為空。
5. 開啟新的 OpenChatX 工作階段，檢查該 Rule 是否出現在 always-applied rules 中。
6. 記錄目標主機實際 Toolbox ID、Rule/Skill 識別名稱、安裝路徑及驗收結果。

## 注意事項

- 此套件只攜帶 Rule/Skill 定義，不包含 Toolbox 註冊資料、MCP 連線、Provider、Node、Project 或其他主機設定。
- Rule 與 Skill 必須分別匯入；只複製檔案不代表已註冊或啟用。
- Toolbox ID 與工具 schema 以目標主機實際回傳為準。Skill 匯入參數已在 Home 主機實際驗證；Rule 的檔案路徑形式亦已在 Home 主機驗證，且確認同名時 `replace=false` 會阻止覆蓋。
- 不要把 Home 主機的 Node 路徑、Project 路徑或本機設定複製成其他主機的事實。
