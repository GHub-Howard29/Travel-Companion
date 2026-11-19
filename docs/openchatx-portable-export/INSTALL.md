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

執行要求（追加安裝／來源覆蓋：一次一個、保留其他既有 Skills）：
1. 先查詢本機 OpenChatX 的 Skills Toolbox 與匯入工具 Schema，確認實際工具名稱、參數及目標 Toolbox ID。不要假設目標主機的 Toolbox ID 或工具版本與 A 電腦相同。
2. 確認來源資料夾存在，且其中有可讀取的 SKILL.md。若不存在或讀取失敗，停止本次操作並回報「未處理」及實際錯誤，不可猜測路徑。
3. 只處理本次指定的 Skill 來源資料夾，不掃描或安裝其他 Skill。
4. 使用本機正式匯入工具，對指定來源資料夾執行匯入並設定 replace=true：
   - 目標沒有同名 Skill：建立該 Skill。
   - 目標已有同名 Skill：不論內容是否相同，直接以來源 SKILL.md 覆蓋該 Skill。
   不需要先讀取、比較目標內容，也不需要回報「已是最新」。
5. 只覆蓋本次指定的同名 Skill，不刪除其他 Skills、不建立改名副本，也不加上 -original／-v2 等後綴。replace=true 是指定單一來源 Skill 的覆蓋，不代表整個 Skills Toolbox 批次替換。
6. 匯入後立即使用 Skill 搜尋功能搜尋這一個 Skill，將搜尋結果回傳的完整 name 原樣傳給 load；確認 load 成功，並核對讀回 Markdown 與來源 SKILL.md 一致。
7. 回報本次 Skill 的狀態：「新增成功／覆蓋成功／未處理／失敗」，附來源路徑、目標完整 name、實際匯入方式及讀回驗證證據。
8. 本次禁止處理其他 Skills；不得匯入、修改或刪除任何 Rule、AGENTS、Toolbox 定義、Provider、Node、MCP 或 Project 設定。
```

## 步驟 2B：累加安裝 Engineering Decision Guard（新增項目）

此段是新增的兩個項目，不取代步驟 2 的其他 Skills，也不取代步驟 3 的其他 Rule。兩個項目分別以來源檔覆蓋或新增，不做內容比對，避免整包重裝。

在 B 電腦 OpenChatX 貼上：

```text
請依 portable export 的既有「累加式安裝」規範，安裝以下新增的 Engineering Decision Guard Rule 與 Skill。不要重裝或修改其他已安裝項目。

來源資料夾（如位置不同，先確認並替換）：
D:\Project\Travel-Companion\docs\openchatx-portable-export

本次限定項目：
1. Rule：engineering-decision-guard-trigger.mdc
2. Skill：engineering-decision-guard\SKILL.md

處理流程：
1. 先確認兩個來源檔案存在且可讀，再查詢本機 Rules／Skills Toolbox 與正式匯入工具 Schema。不可猜 Toolbox ID 或工具參數。
2. Rule 與 Skill 分別處理、不得整包匯入；不讀取或比較目標既有內容：
   - 同名不存在：新增該項。
   - 同名已存在：不論內容是否相同，直接以指定來源檔覆蓋該項。
3. Rule 使用 rule_manage 的單一檔案 import，設定 replace=true；來源是 Cursor 格式單一 .mdc。匯入後讀回確認內容及設定：mode=agent_requested、alwaysApply=false。若目標主機 Schema 不支援 replace，才查明該主機正式支援的單項替換方式；不可對整個 Rules Toolbox 做刪除或重建。
4. Skill 使用來源資料夾 engineering-decision-guard，透過 store_skill import 設定 replace=true。匯入後搜尋該 Skill，使用搜尋結果回傳的完整 name 載入並讀回驗證 Markdown。
5. Skill 與 Rule 覆蓋後，讀回驗證內容必須包含兩項新增規則：使用者明確定案／核准持續性決策後，在同一工作階段立即建立 Accepted 決策檔及更新索引；決策只能在使用者核准解除／取代，或原決策預定的客觀解除條件已有可驗證證據成立時移入 history。實作完成、發布、文件過時或 AI 主觀判斷不構成移轉條件。
6. 每項操作完成後即讀回驗證。兩項互相獨立；某項失敗仍處理另一項，並如實報告部分完成。
7. 本次只處理上述 Rule 與 Skill，不修改其他 Rules、Skills、Toolbox、Provider、Node、MCP、Project 或設定。

最後逐項回報新增成功／覆蓋成功／未處理／失敗，附目標識別名稱與讀回驗證證據。
```

## 步驟 3：匯入全域 Skill Loading Rule

在 B 電腦的 OpenChatX 對話框貼上以下完整 Prompt。此步驟只處理指定的 `.mdc` Rule：目標不存在就新增，已有同名 Rule 則直接以來源檔覆蓋。

```text
請將 portable export 中的 global-skill-loading-rule.mdc 匯入本機 OpenChatX Rules Toolbox。先查詢本機工具 Schema，再執行。

Rule 檔案（若 B 電腦位置不同，請先確認並替換此路徑）：
D:\Project\Travel-Companion\docs\openchatx-portable-export\global-skill-loading-rule.mdc

執行要求（單一來源檔同步覆蓋）：
1. 先確認上述路徑指向存在且可讀取的單一 .mdc 檔案，不可把資料夾當成 source。若檔案不存在或無法讀取，標記為未處理，不可猜測路徑。
2. 查詢本機 Rules Toolbox 與 rule_manage 工具 Schema，確認實際 toolbox ID、參數及匯入格式。
3. 不讀取或比較目標既有 Rule 內容。使用 rule_manage 對這個單一來源檔案執行 import：toolbox_id=目標 Rules Toolbox ID、action=import、format=cursor、source=單一 .mdc 檔案路徑、replace=true。
4. 同名不存在時新增；同名已存在時，不論內容是否相同，直接以來源 .mdc 覆蓋該 Rule。replace=true 僅作用於本次指定的單一來源 Rule，不代表整個 Rules Toolbox 批次替換。
5. 匯入後讀回 Rule，確認內容與來源一致，並核對設定：alwaysApply=true，globs 為空或未設定。
6. 若目標主機的實際 Schema 不支援 replace=true 或匯入回報不支援覆蓋，停止該 Rule 的後續寫入，查明本機正式支援的單項替換方式並回報實際限制；不可未確認就刪除整個 Toolbox 或批次重建。
7. 回報狀態為新增成功／覆蓋成功／未處理／失敗，並提供 Rule 名稱、來源檔案及讀回驗證證據。
8. 本次只處理 global-skill-loading-rule，不修改其他 Rule、Skills、AGENTS、Toolbox 定義、Provider、Node、MCP 或 Project 設定。
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
- Skill 一律以指定來源資料夾執行 `store_skill import` 並設定 `replace=true`：目標不存在時新增；同名已存在時，不論內容是否相同，直接以來源 SKILL.md 覆蓋。每次只匯入一個指定 Skill，不做目標內容比對，也不影響其他 Skills。
- Rule 一律以指定的單一 `.mdc` 檔案執行 `rule_manage import` 並設定 `replace=true`：目標不存在時新增；同名已存在時，以來源檔覆蓋。每次只匯入一個指定 Rule，不做目標內容比對，也不影響其他 Rules。若目標主機實際 Schema 不支援 replace，依其正式支援的單項替換方式處理並回報，不可擅自刪除整個 Toolbox。
- 覆蓋或新增後都必須讀回驗證來源內容及 Rule 設定；不以「工具呼叫成功」取代驗收。
- Skill 的 load 成功表示內容已讀取；不代表它會在每個新工作階段自動載入。是否自動載入，依 Rule 與專案 AGENTS.md 的實際設定及適用條件判定。
- 本次安裝指南不要求也不授權修改 Code Reviewer 或其他 OpenChatX 專屬 Agent 設定。
