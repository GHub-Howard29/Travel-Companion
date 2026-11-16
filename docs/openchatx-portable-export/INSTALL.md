# OpenChatX 跨主機安裝指南

本指南供將 A 電腦的 OpenChatX 設定文字定義安裝到 B 電腦。請先把整個 `openchatx-portable-export` 資料夾複製到 B 電腦，再依序執行以下步驟。

> **重要：** 以下 Prompt 內的範例路徑是 A 電腦的路徑。若 B 電腦放置位置不同，只需修改 Prompt 中「匯出資料夾」路徑；不要直接假設 B 電腦有相同磁碟與目錄。

## 套件內容

| 檔案／資料夾 | 用途 |
|---|---|
| `openchatx-tool-usage\SKILL.md` | 通用 OpenChatX 工具使用 Skill |
| `travel-companion-evidence-efficient\SKILL.md` | Travel-Companion 低 Token 證據工作流程 Skill |
| `global-skill-loading-rule.mdc` | 全域 Skill 載入 Rule |
| `README.md` | 套件說明 |
| `INSTALL.md` | 本安裝指南 |

## 步驟 1：複製檔案

將整個 `openchatx-portable-export` 資料夾複製到 B 電腦可存取的位置。確認兩個 Skill 資料夾均包含 `SKILL.md`，且 `global-skill-loading-rule.mdc` 檔案存在。

## 步驟 2：匯入兩個 Skills

在 B 電腦的 OpenChatX 對話框，貼上以下完整 Prompt。只會匯入這兩個 Skill，不會修改 Rule 或其他主機設定。

```text
請把 A 電腦匯出的兩個 OpenChatX Skill 安裝到本機。請先查詢本機工具 Schema，再依序完成匯入及讀回驗收。

匯出資料夾（若 B 電腦位置不同，請先確認並替換此路徑）：
D:\Project\Travel-Companion\docs\openchatx-portable-export

本次要安裝的 Skills：
1. openchatx-tool-usage
   來源資料夾：D:\Project\Travel-Companion\docs\openchatx-portable-export\openchatx-tool-usage
2. travel-companion-evidence-efficient
   來源資料夾：D:\Project\Travel-Companion\docs\openchatx-portable-export\travel-companion-evidence-efficient

執行要求（本流程採「分批累加更新」，不是每次全新安裝）：
1. 先查詢本機 OpenChatX 的 Skills Toolbox 與 store_skill 工具 Schema，確認實際可用的工具名稱及參數。不要假設本機 toolbox ID 或工具版本與 A 電腦完全相同。
2. 先建立本次匯入清單，逐一確認兩個來源資料夾及其中的 SKILL.md 存在；來源不存在或內容讀取失敗的項目，標記為「未處理」，不可猜測路徑或把失敗項目當成成功。
3. 逐一以 Skill 名稱檢查目標 Skills Toolbox 的現有項目，讀取同名 Skill 的完整內容，並與來源 SKILL.md 比較。每個 Skill 獨立判斷，不可因其中一項同名或失敗而中止其他項目：
   - 目標不存在：列入「新增」。
   - 目標存在且內容完全相同：列入「已是最新」，不做寫入。
   - 目標存在但內容不同：列入「待更新」，先呈現該項差異摘要。
4. 對「新增」項目，使用 store_skill 匯入，參數依本機 Schema：action=import、toolbox=本機 Skills Toolbox ID、directory=該 Skill 的來源資料夾、replace=false。一次只處理一個項目；完成後立即讀回驗證，再處理下一個。
5. 對「待更新」項目，先不要自行覆蓋。請在本次差異報告中列出來源版本與目標版本的差異，並詢問我是否更新這些明確列出的項目。若我已在本次指令明確授權「同名差異直接更新」，才可逐項使用具備覆蓋能力的正式更新方式；不可把 replace=true 套用到整批項目，也不可更新沒有列入差異清單的項目。
6. 每個項目的操作互相獨立。某一項匯入／更新失敗時，保留其他已成功項目，繼續處理其餘無衝突項目，最後彙整部分成功狀態；不得宣稱整批全數成功。
7. 所有可處理項目完成後，分別搜尋兩個 Skill，使用各自搜尋結果回傳的完整 name 執行 load，確認讀回的 Markdown 與本次目標版本一致。
8. 最後逐項回報「新增成功／更新成功／已是最新／待更新待授權／未處理／失敗」，附上來源路徑、目標完整 name、實際寫入方式及讀回驗證。若有待更新項目，清楚列出差異並等待我決定；不得因等待授權而回滾其他成功項目。
9. 本次只處理上述兩個 Skills，不匯入、修改或刪除任何 Rule、AGENTS、Toolbox 定義、Provider、Node、MCP 或 Project 設定。
```

## 步驟 3：匯入全域 Skill Loading Rule

在 B 電腦的 OpenChatX 對話框貼上以下完整 Prompt。此步驟只匯入指定的 `.mdc` Rule，不會修改現有同名 Rule。

```text
請將 portable export 中的 global-skill-loading-rule.mdc 匯入本機 OpenChatX Rules Toolbox。先查詢本機工具 Schema，再執行。

Rule 檔案（若 B 電腦位置不同，請先確認並替換此路徑）：
D:\Project\Travel-Companion\docs\openchatx-portable-export\global-skill-loading-rule.mdc

執行要求（本流程採「單項差異更新」，支援既有 Rule 累加更新）：
1. 先確認上述路徑指向存在的單一 .mdc 檔案，不可把資料夾當成 source。若檔案不存在或無法讀取，標記為未處理，不可猜測路徑。
2. 查詢本機 Rules Toolbox 與 rule_manage 工具 Schema，確認實際 toolbox ID、參數及匯入格式。
3. 讀取來源 Rule，並檢查目標 Rules Toolbox 是否已有同名 global-skill-loading-rule；若存在，讀取完整目標內容並比較來源與目標。
4. 逐項判斷：
   - 目標不存在：列為新增。
   - 目標存在且內容完全相同：列為已是最新，不寫入。
   - 目標存在但內容不同：列為待更新，列出差異摘要。
5. 若目標不存在，使用 rule_manage 匯入，參數依本機 Schema：toolbox_id=目標 Rules Toolbox ID、action=import、format=cursor、source=單一 .mdc 檔案路徑、replace=false。匯入後讀回驗證。
6. 若同名但內容不同，不要因為存在同名項目就停止整個安裝流程；先回報差異並等待我授權該 Rule 更新。除非我已明確授權本次同名差異直接更新，否則不得覆蓋。得到授權後，僅更新本項指定 Rule，不連帶修改其他 Rules。
7. 新增／更新／驗證均以單一 Rule 為單位。失敗時保留其他項目已完成的結果，不回滾、不重複匯入；清楚標記失敗及錯誤。
8. 回報狀態為新增成功／更新成功／已是最新／待更新待授權／未處理／失敗，並提供 Rule 名稱、來源檔案、目標狀態、差異摘要及讀回驗證。
9. 本次只處理 global-skill-loading-rule，不修改其他 Rule、Skills、AGENTS、Toolbox 定義、Provider、Node、MCP 或 Project 設定。

限制：
- source 必須是單一 .mdc 檔案，不可指向資料夾。
- 不可對整批項目使用 replace=true；若需更新，只能針對已獲授權的單一 Rule 執行更新。
- 未經授權不得覆蓋同名 Rule。
```

## 步驟 4：最終驗收

完成上述匯入後，建議在 B 電腦開啟新的 OpenChatX 對話，再貼上以下 Prompt。這一步只讀取驗收，不會修改或覆蓋任何設定。

```text
請對本機 OpenChatX portable export 安裝結果執行最終驗收。只檢查與讀取，不要修改、覆蓋或刪除任何設定。

A. Skills 驗收
1. 使用 skill_search 分別搜尋：
   - openchatx-tool-usage
   - travel-companion-evidence-efficient
2. 記錄每個搜尋結果回傳的完整 name。
3. 將各自完整 name 原樣傳給 skill_search 的 load 動作，不得縮短或猜測名稱。
4. 確認兩個 load 均成功，並確認回傳實際 Markdown 內容，而不只是搜尋摘要。
5. 使用本機可用的 Toolbox 查詢方式，確認兩個 Skills 均已註冊於 Skills Toolbox。

B. Rule 驗收
1. 使用 Rule 清單或 rule_resolve 確認 global-skill-loading-rule 已註冊。
2. 讀取 Rule 內容，確認其規則要求搜尋 Skill，並使用搜尋結果回傳的完整 name 載入。
3. 確認 alwaysApply=true，且 globs 為空或未設定。
4. 不要為了驗收而修改 Rule。

C. 工作階段套用
1. 檢查目前工作階段的 always-applied rules 是否包含 global-skill-loading-rule。
2. 若目前工作階段看不到，說明是否需要重新載入 Toolbox 或開啟新工作階段；不要自行重啟 OpenChatX。

D. 專案條件式套用提醒
1. Travel-Companion 的 AGENTS.md 另有條件式載入要求：程式搜尋、除錯、跨檔案分析、程式碼審查、測試調查或子代理證據整理時，應載入 travel-companion-evidence-efficient。
2. 此條件式指示位於 Travel-Companion 專案文件，不代表本次已自動修改 B 電腦的專案 AGENTS.md。若 B 電腦尚未同步該專案文件，請如實回報，不要自行修改專案檔案。

最後以表格回報每個項目的「通過／未通過／無法確認」、實際識別名稱及證據。任何未通過項目都要附上實際錯誤或缺少的證據，不可推測為成功。
```

## 注意事項

- 本套件只包含 Rule／Skill 的文字定義，不包含 Toolbox 註冊資料、安裝狀態、MCP 連線、Provider、Node、Project 或其他主機設定。
- Rule 與 Skill 必須分別匯入；只複製檔案不代表已註冊、啟用或載入。
- 安裝工具名稱、Toolbox ID 與參數 Schema 以目標主機實際回傳為準。
- 本指南使用 `replace=false`，避免安裝時直接覆蓋目標主機的既有同名內容。
- 若目標主機已有同名項目，先比較並回報，不自行覆蓋。
- Skill 的 load 成功表示內容已讀取；不代表它會在每個新工作階段自動載入。是否自動載入，依 Rule 與專案 AGENTS.md 的實際設定及適用條件判定。
- 本次安裝指南不要求也不授權修改 Code Reviewer 或其他 OpenChatX 專屬 Agent 設定。