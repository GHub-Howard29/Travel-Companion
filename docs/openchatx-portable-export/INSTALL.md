# 安裝到另一台 OpenChatX 主機

本文件提供可直接貼到目標主機 OpenChatX 對話框的操作指令。先將整個匯出資料夾複製到目標主機，再依序執行各段 Prompt。

> **路徑提醒：** 以下範例以 `D:\Project\Travel-Companion\docs\openchatx-portable-export` 為匯出資料夾位置。若目標主機的位置不同，請先修改 Prompt 中的路徑，或要求 OpenChatX 先確認實際檔案位置；不可假設其他主機也使用相同路徑。

## 1. 複製匯出資料夾

將整個 `openchatx-portable-export` 資料夾複製到目標主機可存取的位置，確認資料夾內包含：

- `openchatx-tool-usage\SKILL.md`
- `global-skill-loading-rule.mdc`

## 2. 匯入 Skill

在目標主機 OpenChatX 對話框貼上以下完整 Prompt：

```text
請先確認本機匯出資料夾及 Skill 檔案存在，再使用 store_skill 將 Skill 匯入 Skills Toolbox。

匯出資料夾：
D:\Project\Travel-Companion\docs\openchatx-portable-export

Skill 資料夾：
D:\Project\Travel-Companion\docs\openchatx-portable-export\openchatx-tool-usage

執行要求：
1. 先確認 Skill 資料夾內確實存在 SKILL.md。若路徑不存在，請搜尋或詢問我實際位置，不可猜測其他路徑。
2. 使用 store_skill，參數如下：
   action = import
   toolbox = skills
   directory = D:\Project\Travel-Companion\docs\openchatx-portable-export\openchatx-tool-usage
   replace = true
3. 匯入完成後，確認工具回報成功。
4. 確認 Skills Toolbox 中的 openchatx-tool-usage 已存在且啟用；必要時重新載入 Skills Toolbox。
5. 接著執行 Skill 搜尋與載入驗收：
   - 使用 skill_search 搜尋 openchatx-tool-usage。
   - 從搜尋結果取得完整 name。
   - 將該完整 name 原樣傳給 skill_search 的 load 動作，不可縮短或自行猜測。
   - 確認 load 成功，且回傳實際 Markdown 內容。
6. 回報匯入、啟用、重新載入、搜尋及 Markdown 讀取結果。任何一步失敗，都要提供實際錯誤，不可宣稱成功。
```

注意：
- `directory` 必須指向包含 `SKILL.md` 的 Skill 子資料夾，不是父層匯出資料夾。
- `replace = true` 會以匯入版本取代目標主機同名 Skill。執行前請確認來源是預期版本。
- 若目標主機找不到該路徑，先確認實際位置並更新 Prompt，再執行匯入。

## 3. 匯入全域 Rule

在目標主機 OpenChatX 對話框貼上以下完整 Prompt：

```text
請先確認本機的 Rule 檔案存在，再使用 rule_manage 將它匯入 Rules Toolbox。

Rule 檔案：
D:\Project\Travel-Companion\docs\openchatx-portable-export\global-skill-loading-rule.mdc

執行要求：
1. 確認上述路徑指向單一 .mdc 檔案，不可將資料夾路徑當成 source。若檔案不存在，請搜尋或詢問我實際位置，不可猜測。
2. 匯入前先檢查 Rules Toolbox 是否已有名為 global-skill-loading-rule 的 Rule。
3. 若同名 Rule 不存在，使用 rule_manage 匯入，參數如下：
   toolbox_id = rules
   action = import
   format = cursor
   source = D:\Project\Travel-Companion\docs\openchatx-portable-export\global-skill-loading-rule.mdc
   replace = false
4. 若同名 Rule 已存在，請先使用 Rule 清單或 rule_resolve 讀取既有內容，並與匯入檔案比較。不要覆蓋、刪除或修改既有 Rule；先回報差異並停止，等我決定是否更新。
5. 匯入成功後，使用 rule_resolve 或 rule_manage 支援的讀取方式確認 Rule 已註冊，並確認 alwaysApply=true、globs 為空。
6. 回報檔案檢查、同名檢查、匯入及讀回驗證結果。若工具回報錯誤，請提供完整錯誤，不可將錯誤視為成功。
```

注意：
- `source` 必須指向單一 `.mdc` 檔案的完整路徑，不可指向匯出資料夾。Home 主機實測將資料夾當成 source 會回報 `EISDIR: illegal operation on a directory, read`。
- `format = cursor` 表示匯入 Cursor 格式的 Rule。
- `replace = false` 可避免直接覆蓋同名 Rule。
- 若回報 `rule_exists`，代表同名 Rule 已存在且未被覆蓋。應先讀取比對；只有在使用者明確決定更新後，才另行使用 `replace = true` 匯入或執行 Rule edit。

## 4. 最終驗收

完成 Skill 與 Rule 匯入後，在目標主機 OpenChatX 開啟新的對話，貼上以下完整 Prompt：

```text
請對本機 OpenChatX 的 portable Skill / Rule 安裝結果執行最終驗收。只檢查與讀取，不要修改、覆蓋或刪除任何設定。

驗收項目：

A. Skill
1. 使用 skill_search 搜尋 openchatx-tool-usage。
2. 記錄搜尋結果回傳的完整 name。
3. 將完整 name 原樣傳給 skill_search 的 load 動作，不得縮短或猜測名稱。
4. 確認 load 成功，並確認回傳實際 Markdown 內容，而不只是搜尋摘要。
5. 確認 Skills Toolbox 中該 Skill 存在且已啟用。

B. Rule
1. 使用 Rule 清單或 rule_resolve 確認 global-skill-loading-rule 已註冊。
2. 讀取 Rule 內容，確認其內容包含 Skill 搜尋及載入時必須使用搜尋結果完整 name 的規則。
3. 確認 alwaysApply=true，且 globs 為空或未設定。
4. 不要為了驗收而修改 Rule。

C. 工作階段套用
1. 檢查目前工作階段的 always-applied rules 是否包含 global-skill-loading-rule。
2. 若目前工作階段看不到，請說明是否需要重新載入 Toolbox 或開啟新工作階段；不要自行重啟 OpenChatX。

最後請用表格回報每個項目的「通過／未通過／無法確認」、實際識別名稱及證據。任何未通過項目都要附上實際錯誤或缺少的證據，不可推測為成功。
```

## 注意事項

- 此套件只攜帶 Rule / Skill 定義，不包含 Toolbox 註冊資料、MCP 連線、Provider、Node、Project 或其他主機設定。
- Rule 與 Skill 必須分別匯入；只複製檔案不代表已註冊、啟用或載入。
- Toolbox ID、工具名稱與 Schema 以目標主機實際回傳為準。Skill 匯入參數已在 Home 主機實際驗證；Rule 的單一 `.mdc` 檔案路徑形式亦已在 Home 主機驗證。
- 本文件提供的路徑是範例。不要把 Home 主機的 Node 路徑、Project 路徑或其他本機設定複製成其他主機的事實。
- 若目標主機工具名稱、參數或版本不同，應先查詢該主機的實際工具 Schema，再調整操作；不得照搬不相容參數。
