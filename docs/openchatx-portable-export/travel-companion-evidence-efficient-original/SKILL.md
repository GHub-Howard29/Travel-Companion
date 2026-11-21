---
name: travel-companion-evidence-efficient-original
description: Travel-Companion 專案低 Token 工作流程：初始化最小化、按需讀取證據、避免重讀與重複委派；適用於進入專案、程式碼定位、審查、除錯及測試。
---

# Travel-Companion Low-Token Workflow

適用 repository：`D:\Project\Travel-Companion`。本 Skill 是工作流程規範，不取代 AGENTS、Rules、安全要求或必要測試。

## 0. 初始化模式（最高優先）
使用者只說「進入專案」「準備繼續」「開啟專案」時，這是 **startup-only**，不是開發審查授權。

只做：
1. 使用已存在的 OpenChatX session；同一對話不得重複呼叫 start_here。
2. 對已註冊 Project 執行一次 project_manage use；若已是 active project，不重複列舉或切換。
3. 以單一精簡 Git 命令取得 branch、HEAD、工作樹狀態及 upstream 是否落後／領先。除非使用者要求最新遠端狀態或證據過舊，否則不 fetch。
4. 只讀取一份明確標示為最新的交接摘要／Next Move；若當前對話已提供充分且新鮮的交接內容，直接沿用，不讀文件。
5. 回報已啟用、Git 狀態、未提交修改、下一步。到此停止。

Startup-only 禁止：
- 不列出 Goals、檢查所有 skills/rules/capabilities 或 project 清單（除非 Project 無法解析）。
- 不載入通用 Skill；只在實際任務需要時載入本 Skill或其他特定 Skill。
- 不全文讀取 AGENTS、README、TODO、專案總覽、RC 文件或其他規格。AGENTS/Rules 僅在本工作階段尚未取得且即將執行相關工作時，才依 OpenChatX 強制要求載入最小必要規則；不得為了「進入專案」而讀取。
- 不開始 code review、發布範圍審查、測試、build、fetch、diff 或歷史 commit 盤點。
- 不啟動子代理。
- 不將 startup-only 自動延伸成「檢查有哪些可做的工作」。

若交接摘要缺失或過期，只搜尋精確交接檔名／標題，先 grep 定位，再讀必要區段；不要掃讀整個 docs。

## 1. 任務界定與既有上下文
- 實際開發／審查開始後，先用一兩句確認具體問題、範圍與完成條件。
- 優先使用目前對話、已取得的 log、交接內容、工具輸出和本工作階段已讀檔案。
- 同一任務內已取得且未變更的內容視為有效證據，不重新取得。
- 只讀取能回答當前問題的檔案、行區段與呼叫端。
- 除非使用者要求最新 remote 狀態或發布作業要求，否則不 fetch。

## 2. 精簡定位及工具策略
- 已知檔案：file_read 一次讀取足夠的必要區段。
- 未知檔案：grep 限制目錄與副檔名；grep 僅用於定位，不視為完整程式碼證據。
- 已知 Git 變更：先取得 name-status/stat，再只讀取相關檔案 diff；避免對同一檔案重複跑 diff。
- 需要統計才用 shell；普通檔案／路徑探索使用 glob/grep。
- Codebase Memory 僅作 best-effort 輔助；不在任務開始全面 reindex。索引結果須以原始碼/Git 核實。
- 不為使用索引而使用索引。

## 3. 讀取與輸出 Token 控制
- 每次讀取前先寫明要解決的具體未知；沒有未知就不讀。
- 禁止同一檔案先全文讀取，再以 offset/limit 讀取重疊內容。若第一次讀取過長，使用工具提供的既有結果／分段游標，不從頭讀第二次。
- 不要平行讀取同一文件的全文與局部版本。
- 優先讀最小必要行區段；大型文件先 grep 搜尋標題／關鍵詞，再讀相關段落。
- 對 diff 預設使用 --stat 或 --name-status；只有發現特定風險才取該檔案局部 diff。避免把大量 diff 一次輸出到模型上下文。
- shell 命令必須設定合理 max_output_tokens；輸出應為摘要、計數、命中片段，不 dump 全檔或大型 JSON。
- 工具輸出已足夠支持結論時立即停止補查。
- 不得為節省 Token 而省略必要的安全、相依性、測試或驗收。

## 4. Skill / Rule / Agent 防重複
- 每個對話只初始化 OpenChatX 一次；不可在同一 session 重複 start_here。
- Skill 搜尋只在需要發現未知 Skill 時執行；已知名稱直接載入一次。已載入且內容在上下文時不再 search/load。
- 先 resolve 目前任務必要 Rules；不查全庫。已解析且未變更的 Rules 不重複載入。
- 不因一般任務呼叫 goal_list、capability_list 或 tool_search；只有需要未知能力時才查。
- 預設由主代理完成。只有工作可獨立並行、非重疊且委派收益大於建立上下文成本時才使用 subagent。
- 同一任務不得啟動兩個以上做相同範圍的 Agent；先檢查已有工作是否正在執行，避免重複審查。
- 委派時傳遞最小證據包（範圍、檔案/行號、diff、測試證據、問題），不得要求重新探索整個 repository。

## 5. 發布審查／完整任務
- 只有使用者明確要求發布、release audit 或完整審查時，才比較 main/develop、審查完整白名單及 metadata。
- 發布範圍比較以 origin/main..候選分支為準，先產生檔案分類，再依允許／排除清單查 diff。
- 不得因 startup-only 讀到候選狀態就自動啟動發布審查。
- 重大程式修改仍依 AGENTS 要求執行必要測試、build、TypeScript、lint、安全檢查。

## 6. 精簡交接
只記錄下次工作真正需要的：
1. 目標與結論；
2. 修改檔案及重要位置；
3. 實際執行的測試與結果；
4. 尚未驗證／不確定事項；
5. 已定案決策；
6. 唯一下一步與前置條件。
不要複製對話全文或完整文件。優先更新既有紀錄，不新建重複知識庫。

## 7. 成本驗證
- OpenChatX `logs/agent-commands.yaml` 的 in/out 是工具呼叫層級統計，不等於 ChatGPT 完整上下文、模型推理或帳單 Token。
- A/B 比較必須固定任務類型、session 範圍、工具種類、日期範圍與輸出限制。
- 追蹤 startup 專屬工具 out token、全文 file_read、重複 file_read、重複 skill_load、重疊 agent session。
- 不只追求低輸出；若漏查造成錯誤或補查成本增加，視為失敗。
- 未取得相同條件基準與後測前，不宣稱改善已生效。

## 8. 專案規範優先
- 遵守 AGENTS、適用 Rules、Node Runtime Rule、專案安全要求及使用者明確指示。
- 本 Skill 不自行授權修改設定、程式碼、資料庫或部署。
- 不得將特定主機 Node 路徑套用至其他主機。