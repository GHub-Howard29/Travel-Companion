# OpenChatX 跨主機安裝指南

本指南供將 A 電腦的 OpenChatX 設定文字定義安裝到 B 電腦。請先把整個 `openchatx-portable-export` 資料夾複製到 B 電腦，再依序執行以下步驟。

> **重要：** 以下 Prompt 內的範例路徑是 A 電腦的路徑。若 B 電腦放置位置不同，只需修改 Prompt 中「匯出資料夾」路徑；不要直接假設 B 電腦有相同磁碟與目錄。

## 套件內容

| 檔案／資料夾 | 用途 |
|---|---|
| `openchatx-tool-usage\SKILL.md` | 通用 OpenChatX 工具使用 Skill |
| `travel-companion-evidence-efficient\SKILL.md` | Travel-Companion 最新版 Skill（包含上傳／下載長工作追蹤規則） |
| `travel-companion-evidence-efficient-original\SKILL.md` | 修正前原始匯出版本，僅供歷史追溯，不應匯入 |
| `global-skill-loading-rule.mdc` | 全域 Skill 載入 Rule |
| `engineering-decision-guard-trigger.mdc` | Engineering Decision Guard 條件式觸發 Rule（`alwaysApply=false`，包含定案落檔／歷史移轉規則） |
| `engineering-decision-guard\SKILL.md` | Engineering Decision Guard Skill |
| `README.md` | 套件說明 |
| `INSTALL.md` | 本安裝指南 |

## 步驟 1：複製檔案

將整個 `openchatx-portable-export` 資料夾複製到 B 電腦可存取的位置。確認這次準備追加安裝的 Skill 資料夾內有 `SKILL.md`；若也要安裝全域 Rule，確認 `global-skill-loading-rule.mdc` 檔案存在。若要安裝 Engineering Decision Guard，另確認 `engineering-decision-guard\SKILL.md` 與 `engineering-decision-guard-trigger.mdc` 存在。

## 步驟 2：追加安裝單一 Skill

**每次指令只處理一個 Skill。** 這是追加安裝／更新模式，不是一次安裝整包 Skills。要安裝另一個 Skill 時，另開一則指令，替換下方的 Skill 名稱與來源資料夾，再獨立執行；已安裝的其他 Skills 不會被重新匯入或處理。

在 B 電腦的 OpenChatX 對話框，貼上以下 Prompt，並只填入這次要追加的那一個 Skill：

```text
請將 A 電腦 portable export 中「單一指定 Skill」追加安裝到本機 OpenChatX Skills Toolbox。這次只處理下方指定的一個 Skill，不要批次安裝其他 Skill，也不要重新匯入整包 Skills。請先查詢本機工具 Schema，再執行匯入、更新及讀回驗收。

匯出資料夾（若 B 電腦位置不同，請先確認並替換此路徑）：
D:\Project\Travel-Companion\docs\openchatx-portable-export

本次唯一指定的 Skill：
Skill 名稱：<填入一個 Skill 名稱，例如 travel-companion-evidence-efficient>
來源資料夾：<填入該 Skill 的完整資料夾路徑>

執行要求（追加安裝：一次一個、保留其他既有 Skills）：
1. 先查詢本機 OpenChatX 的 Skills Toolbox 與匯入／更新工具 Schema，確認實際可用的工具名稱、參數及 Toolbox ID。不要假設本機 toolbox ID 或工具版本與 A 電腦相同。
2. 確認來源資料夾存在，且其中有可讀取的 SKILL.md。若不存在或讀取失敗，停止本次操作並回報「未處理」及實際錯誤，不可猜測路徑。
3. 只針對本次指定的 Skill 名稱，檢查目標 Skills Toolbox 是否已有同名項目；讀取同名 Skill 完整內容並與來源 SKILL.md 比較。不得掃描後順便安裝其他 Skill。
4. 依比對結果處理：
   - 目標不存在：新增此 Skill，使用本機 Schema 支援的匯入方式，新增時使用 replace=false。
   - 目標存在且內容完全相同：標記「已是最新」，不做寫入。
   - 目標存在但內容不同：將本次明確指定的單一 Skill 視為追加更新，直接更新既有同名 Skill，不要要求我再次確認。優先使用本機 Schema 支援的單項 replace=true 匯入，或正式更新／編輯方式。
5. 更新時只允許覆寫本次指定的這一個同名 Skill。保留既有 Skill 名稱、完整註冊識別名稱及引用關係；不得刪除舊 Skill、建立改名副本，或加上 -original／-v2 等後綴。若匯入工具不支援覆寫，先查詢正式更新能力；確認沒有任何可用方式後，才回報「更新受工具限制」及實際 Schema／錯誤，不可假稱成功。
6. 本次操作完成後，立即使用 Skill 搜尋功能搜尋這一個 Skill，並將搜尋結果回傳的完整 name 原樣傳給 load。確認 load 成功，且讀回的 Markdown 與來源 SKILL.md 內容一致。
7. 回報本次唯一指定 Skill 的狀態：「新增成功／更新成功／已是最新／更新受工具限制／未處理／失敗」，並附來源路徑、目標完整 name、實際寫入方式及讀回驗證證據。
8. 本次禁止處理其他 Skills；不得匯入、修改或刪除任何 Rule、AGENTS、Toolbox 定義、Provider、Node、MCP 或 Project 設定。
```

## 步驟 2B：累加安裝 Engineering Decision Guard（新增項目）

此段是新增的兩個項目，不取代步驟 2 已安裝的 Skills，也不取代步驟 3 的既有 Rule。依序單項比對及處理，避免整包重裝。

在 B 電腦 OpenChatX 貼上：

```text
請依 portable export 的既有「累加式安裝」規範，安裝以下新增的 Engineering Decision Guard Rule 與 Skill。不要重裝或修改其他已安裝項目。

來源資料夾（如位置不同，先確認並替換）：
D:\Project\Travel-Companion\docs\openchatx-portable-export

本次限定項目：
1. Rule：engineering-decision-guard-trigger.mdc
2. Skill：engineering-decision-guard\SKILL.md

處理流程：
1. 先確認兩個來源檔案存在且可讀，再查詢本機 Rules／Skills Toolbox 與正式匯入、更新工具 Schema。不可猜 Toolbox ID 或工具參數。
2. Rule 與 Skill 分開比對、分開處理，不得整包匯入：
   - 同名不存在：新增該項。
   - 同名且內容相同：標記已是最新，不寫入。
   - 同名且內容不同：只更新這個已指定項目，使用本機正式支援的單項更新方式，保留原識別名稱與引用；不要刪除後重建或改名副本。
3. Rule 來源是 Cursor 格式單一 .mdc。匯入後讀回確認內容及設定：mode=agent_requested、alwaysApply=false。
4. Skill 使用來源資料夾 engineering-decision-guard。完成新增或更新後，搜尋該 Skill，使用搜尋結果回傳的完整 name 載入並讀回驗證 Markdown。若本機正式工具不支援同名更新，回報實際限制，不得假稱完成。
5. 讀回驗證內容必須包含兩項新增規則：使用者明確定案／核准持續性決策後，在同一工作階段立即建立 Accepted 決策檔及更新索引；決策只能在使用者核准解除／取代，或原決策預定的客觀解除條件已有可驗證證據成立時移入 history。實作完成、發布、文件過時或 AI 主觀判斷不構成移轉條件。
6. 每項操作完成後即讀回驗證。兩項互相獨立；某項失敗仍處理另一項，並如實報告部分完成。
7. 本次只處理上述 Rule 與 Skill，不修改其他 Rules、Skills、Toolbox、Provider、Node、MCP、Project 或設定。

最後逐項回報新增成功／更新成功／已是最新／工具限制／未處理／失敗，附目標識別名稱與驗證證據。
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

A. Skill 驗收
1. 只驗收最近一次追加安裝指令中指定的那一個 Skill；從該次指令取得 Skill 名稱，不要把匯出資料夾內其他 Skill 視為本次也應安裝的項目。
2. 使用 skill_search 搜尋該 Skill，記錄搜尋結果回傳的完整 name。
3. 將完整 name 原樣傳給 skill_search 的 load 動作，不得縮短或猜測名稱。
4. 確認 load 成功，並確認回傳實際 Markdown 內容與指定來源版本一致，而不只是搜尋摘要。
5. 使用本機可用的 Toolbox 查詢方式，確認這個指定 Skill 已註冊於 Skills Toolbox；其他 Skills 不列入本次追加安裝的驗收範圍。

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

E. Engineering Decision Guard 累加安裝驗收
1. 搜尋並載入 Rule `engineering-decision-guard-trigger`，確認內容與來源一致，設定 `mode=agent_requested`、`alwaysApply=false`。
2. 搜尋 Engineering Decision Guard Skill，將搜尋結果的完整 name 原樣載入，確認內容與來源 SKILL.md 一致。
3. 確認兩項均已存在且可讀取；此驗收只讀，不修改任何項目。

最後以表格回報每個項目的「通過／未通過／無法確認」、實際識別名稱及證據。任何未通過項目都要附上實際錯誤或缺少的證據，不可推測為成功。
```

## 注意事項

- 本套件只包含 Rule／Skill 的文字定義，不包含 Toolbox 註冊資料、安裝狀態、MCP 連線、Provider、Node、Project 或其他主機設定。
- Rule 與 Skill 必須分別匯入；只複製檔案不代表已註冊、啟用或載入。
- 安裝工具名稱、Toolbox ID 與參數 Schema 以目標主機實際回傳為準。
- 新增 Skill 使用 `replace=false`；若目標已有同名 Skill 且內容不同，必須將匯入視為更新，僅針對該 Skill 使用本機 Schema 支援的正式覆寫／編輯方式，不得因同名而阻擋或要求先刪除。
- 同名 Skill 更新須保留既有 Skill 名稱、完整註冊識別名稱及引用關係；若本機沒有正式更新能力，才回報工具限制，不得改名建立副本或宣稱更新成功。
- Skill 的 load 成功表示內容已讀取；不代表它會在每個新工作階段自動載入。是否自動載入，依 Rule 與專案 AGENTS.md 的實際設定及適用條件判定。
- 本次安裝指南不要求也不授權修改 Code Reviewer 或其他 OpenChatX 專屬 Agent 設定。
