# Codex 協作指示

- 使用中文撰寫 commit 訊息。
- 未經明確指示，不自動 commit 或 push。**Git 與測試資料庫操作完全分離：** 一般 `commit`、`push`、`commit/push` 只依明確要求執行一般 Git commit／push。完整口令 `commit/push/資料庫` 已整個廢除，不再是有效指令；收到該完整口令時不執行任何動作，應告知使用者改用明確的 Git 指令或獨立資料庫口令。任何 Git 口令均不得呼叫 fixture export、upload、download、import、`testdata:handoff:publish` 或任何資料庫同步程式。
- **資料庫上傳觸發詞：** 使用者明確輸入 `/上傳資料庫` 時，只執行 `npm run testdata:upload`（`scripts/testdata-upload.mjs`）。此命令自行檢查並只上傳合格的本機合成 fixture 到 `origin/develop`；不得執行一般程式碼／文件 commit，不得 download/import，不得 pull，不得順便執行其他資料庫同步入口。必須保留既有分支、upstream、工作樹、敏感資料與 fixture 驗證安全停止條件；有無關／歸屬不明變更或安全檢查失敗時停止並回報。
- **資料庫下載觸發詞：** 使用者明確輸入 `/下載資料庫` 時，只執行 `npm run testdata:download`（`scripts/testdata-download.mjs`）。此命令只讀取本機 Git 已提交的 fixture 並更新目前主機自己的 loopback Supabase；不得執行 Git pull、commit、push、upload 或舊的 `db:sync:local`。若本機 Git 尚未取得目標 fixture，停止並明確提示需由使用者另外執行 Git pull／更新，不可自動替使用者執行。
- 上述 `/上傳資料庫`、`/下載資料庫` 是獨立資料庫操作口令；不得因一般任務完成、Git 操作、對話提及或另一口令而自動觸發。兩者皆不得連線或寫入正式 Supabase。
- 一般 Git 操作仍須檢查 Git 狀態、分支/upstream 與遠端差異，整理文件及執行適用驗證，只提交／推送本次任務範圍內且安全可交付的檔案；若工作樹含無關或歸屬不明變更、驗證失敗、分支／遠端狀態不安全，須保留現況並停止受影響的寫入操作，不可使用 `git add .`、強制覆寫或 reset。一般 Git 操作不合併 `main`、不部署、不清除資料、不自行切換分支；若不在 `develop`，不得自行切分支或推測同步方向，須回報狀態與阻礙。
- 在重要結論、規劃或實作前，先檢查需求、前提、限制與可驗證證據；簡單且低風險的請求採相稱深度，不必為形式而展開冗長分析。
- 若發現邏輯缺口、互相衝突的條件、未經證實的假設或可能影響結果的認知偏差，應直接說明具體證據、影響與可執行的改善方式。若差異會實質改變結果且無法安全推定，再請使用者決定。
- 不因迎合而隱瞞問題，也不為反對而反對；在安全、授權與既定範圍內，仍應忠實執行使用者的明確要求。
- 清楚區分已確認事實、合理推論、建議方案與尚未完成的驗證，不把未測試或未發布的結果描述成已完成。
# Node.js 執行環境辨識（OpenChatX Home／OpenChatX 通用）
- **不得將 OpenChatX 內建 Node.js 當成專案 Node.js。** OpenChatX Home／OpenChatX 的 Bash、MCP 或其他命令程序可能預設使用 OpenChatX 自帶的 runtime Node；例如家用端曾回報 `C:\Users\A-Haw\AppData\Local\Programs\OpenChatX\runtime\bin\node.exe`（v22.18.0），公司端曾回報 `C:\Users\ahow_ho\AppData\Local\Programs\OpenChatX\runtime\bin\node.exe`（v22.18.0）。這些都是 OpenChatX 工具執行環境，不代表 Travel-Companion 的 Node 版本，也不代表專案所安裝的 Node 不存在或版本錯誤。實際路徑及版本須以當次命令程序的檢查結果為準，不可把某一台主機的使用者目錄或 runtime 路徑套用到另一台主機。
- Travel-Companion 專案 Node 版本以專案 `.nvmrc`、`package.json` 的 `engines.node` 及指定主機上的實際安裝目錄為準；目前專案要求 `22.23.2`。家用端與公司端均應使用各自主機實際安裝的專案 Node，不可因兩端安裝位置不同而改變專案版本要求。其他主機不得未經檢查直接假定使用公司端或家用端的 Node 路徑。
- **Node 工作流程（兼顧正確性與 Token／命令成本）：**
  1. 每次開始一項 Travel-Companion 專案任務時，先確認目前實際執行主機身分（Windows `COMPUTERNAME`／`USERDOMAIN`）；若本次工作階段已取得且主機未切換，可沿用該身分，不需在每條命令重複查詢。
  2. 對該主機，優先沿用本工作階段或可信診斷紀錄中已驗證的專案 Node 安裝目錄；只有首次接觸該主機、路徑未記錄、檔案不存在、版本不符或疑似安裝異動時，才重新搜尋與驗證實際路徑。不得直接套用另一台主機的路徑。
  3. 每次執行依賴 Node／npm 的命令（包含 Node／npm 版本檢查、依賴安裝、測試、lint、build、Supabase CLI）時，必須在該次命令程序內將已確認的專案 Node 目錄放到 PATH 最前端，再執行命令。PowerShell 範例：`$env:PATH = '<該主機已確認的專案 Node 目錄>;' + $env:PATH`。這是單次程序設定，不寫入使用者或系統永久環境變數。
  4. 不需每次執行所有 Node 工具版本檢查；只檢查本次任務實際使用的工具，且必要時記錄 `(Get-Command node).Source`，確認解析到專案 Node 而非 OpenChatX `runtime\\bin\\node.exe`。
  5. 若主機身分、Node 路徑或版本有疑義，先停止依賴該環境的命令並查證；不得把 OpenChatX 內建 Node 的版本誤報為專案版本錯誤，也不得因此要求使用者重裝 Node。
- 公司端目前已驗證專案 Node 位於 `C:\nvm\v22.23.2\node.exe`，npm 為 `10.9.8`；此路徑只適用於已確認的公司主機 `TPEPC-TM7503-01`／`NICE-GREEN`，其他主機必須獨立確認。
- **公司端瀏覽器操作工具政策（預設且強制）：** 在公司主機 `TPEPC-TM7503-01`／`NICE-GREEN` 執行 Travel-Companion 相關瀏覽器操作、分頁讀取、頁面導覽或 UI 驗證時，唯一允許使用 `open-browser-use` 原生 CLI（直接執行已安裝的 native CLI／其命令）；不得使用 `open-browser-use-office` MCP 工具執行瀏覽器操作，也不得每次工作開始時重新測試或排查該 MCP。此限制只適用公司端，不延伸至家用端。只有使用者明確解除本規則，或明確核准改用新工具／新流程後，才可變更。若原生 CLI 本身故障，回報具體錯誤並停止該項瀏覽器操作，不可自行切回 MCP。
- 公司端原生 CLI 可執行檔目前已驗證位於 `C:\nvm\v22.23.2\node_modules\open-browser-use\native\windows-amd64\open-browser-use.exe`，版本 `0.1.42`；CLI npm wrapper 入口為 `C:\nvm\v22.23.2\node_modules\open-browser-use\cli\open-browser-use.js`。以上路徑僅適用已確認的公司主機；若日後升級、搬移或更換工具，需經使用者核准後更新。
- 專案工具檢查及測試命令可採單次程序 PATH 覆寫；不得擅自修改 OpenChatX 全域 runtime、安裝目錄或使用者全域 Node 設定。除非使用者另行授權，不做永久性環境變數修改。
- **既有診斷更正原則：** 過去若只在 OpenChatX 預設 shell 讀到 v22.18.0，應更正為「OpenChatX 內建 Node v22.18.0；專案 Node 版本須依專案設定及該主機安裝位置，在專案 PATH 下另行驗證」，不得將其列為專案工具阻塞。

# Supabase A/B 雙機測試資料同步規則
- 目前維護目標為公司端（A）與家用端（B）雙機；兩端只操作各自的本機 loopback Supabase。Git `origin/develop` 傳遞合成測試業務資料 fixture，不代表整個資料庫快照。
- 上傳一次搜尋所有 `is_public=false` 且 `content.testPurpose='three-way-sync'` 的 TRIP；每筆 TRIP 保留自己的 ID 與 fixture 目錄，允許多筆批次處理，不要求 TRIP 名稱或 ID 固定格式。不複製 Docker volume，也不使用正式資料庫 dump。
- 唯一同步依據為本機 DB／案例內容與 Git 目前快照的直接比較：內容相同為 unchanged，內容不同且必要安全驗證通過即可同步。`baselineAt`、version、parentVersion、parentChecksum、checksum、applied state 及時間戳不得作為上傳／下載許可門檻；若保留，只供閱讀或稽核。DB 比較可忽略 trigger 自動更新的 `created_at`／`updated_at`，不得忽略其他業務欄位。
- 目前業務資料白名單為 `trips`、`checklists`、`checklist_items`、`expenses`、`exchange_purchases`、`other_info_items`。帳戶 Email、管理者／使用者個人資料、Auth users、participants、participant Email maps、sessions、owner／creator 身分、token、密碼、附件中繼資料及 Storage 檔案不跨機同步。下載先驗證有差異的 fixture，再將多筆 fixture 在單一 SQL 交易中套用；不得覆蓋 fixture 範圍以外的資料。
- 新的獨立上傳入口為 `npm run testdata:upload`（`scripts/testdata-upload.mjs`）；新的獨立下載入口為 `npm run testdata:download`（`scripts/testdata-download.mjs`）。上傳入口不下載／匯入；下載入口不 pull／commit／push。兩者皆不得觸碰正式 Supabase。
- 口令分工已定案：完整口令 `commit/push/資料庫` 已整個廢除，不再是有效指令，收到時不執行任何動作；一般 Git 操作使用 `commit`、`push` 或 `commit/push`；`/上傳資料庫` 僅執行 `npm run testdata:upload`；`/下載資料庫` 僅執行 `npm run testdata:download`。不得把 upload/download 串接到任何 Git 指令或其他自動化流程；`db:sync:local` 只依既有 Git fixture 進行內容比較下載，不得上傳。
- 若執行特定主機的本機資料庫操作，或要宣稱該主機產生新的驗證結果，仍須確認實際主機識別；不得把家用電腦測試結果誤報為公司電腦證據，也不得在未確認前操作另一台電腦。公司電腦識別基準仍為 Windows `COMPUTERNAME=TPEPC-TM7503-01`、`USERDOMAIN=NICE-GREEN`，專案路徑 `D:\\Project\\Travel-Companion`。
- Excel RPC 案例集是獨立資料集；案例 unchanged 不得阻擋一般 TRIP fixture 上傳或下載。**尚待實證：** 本次程式單元／SQL 生成測試通過；修改後 A→B、B→A 真實本機資料庫往返仍待實機驗收。三方歷史紀錄保留於 `docs/83_本機測試資料庫同步流程.md` 第 6 節。

# 每次開始工作前：Git 與 Supabase 核對
- 每次開始任何專案任務，先在專案根目錄檢查 `git status --short --branch`、目前分支與 upstream；再執行 `git fetch origin`，確認本機與遠端差異。不得因任務看似只改文件就跳過。
- 若工作目錄乾淨、目前分支是 `develop`，且遠端只有可安全 fast-forward 的新提交，允許直接執行 `git pull --ff-only origin develop`，然後確認最新 commit 與工作目錄狀態。
- 若工作目錄有未提交修改或 untracked 檔案，先判斷是否屬於本次任務；一般任務不得自動切分支、stash、覆寫或 reset，應保留現況並回報。唯一例外是使用者已明確下達「進行發布流程」，且逐一檢視後確認所有待提交變更均屬於本次發布候選時，可依標準發布流程只 stage 明確檔案並提交；任何無關或歸屬不明的變更都必須停止。一般任務若目前分支不是 `develop`，不得自行切換。標準發布流程則可在工作樹乾淨、分支／upstream 已核對、遠端差異可安全處理且目前階段要求時，依序切換 `develop`／`main`；不得因發布需要而忽略遠端分歧、強制覆寫或 reset。沒有 upstream 或本機與遠端分歧時，仍須停止並回報差異，先處理安全同步方案。
- **舊換電腦／資料庫交接流程（已停用，2026-11-04）：** 本段後續內容是歷史存檔，不得照此執行。歷史完整口令 `commit/push/資料庫` 已不再觸發資料庫交接。現行三個互斥入口為：一般 `commit`／`push`／`commit/push`（包括歷史完整口令 `commit/push/資料庫`）只做 Git；`/上傳資料庫` 只執行 `npm run testdata:upload`；`/下載資料庫` 只執行 `npm run testdata:download`。不得互相串接。
- **舊規則正文（已廢止、不可執行，僅留歷史）：** 原規則曾規定只有使用者明確輸入 `commit/push/資料庫` 才執行完整交接；一般 `commit`、`push`、`commit/push`、單次工作完成、暫停對話或提及換電腦都不觸發。收到完整指令後，先檢查分支/upstream、遠端差異與工作樹，確認哪些變更屬於本次交接；整理相關文件並執行適用驗證，僅對本次任務範圍內、驗證合格且無無關／歸屬不明變更的一般程式碼與文件進行精確 stage、commit、push。不可用 `git add .`，不可覆蓋、reset、強制推送或自動切換分支。**提交前 Fixture 格式相容性檢查：** 若本次一般程式碼／文件變更修改 `scripts/testdata-sync.mjs` 的 `readFixture`／manifest schema 驗證、`scripts/lib/testdata-revision.mjs` 的 revision 驗證，或其他會提高 Fixture manifest 格式要求的路徑，必須在一般 commit 前執行 `npm run testdata:validate:active`；`assertHandoffGitState()` 亦會在偵測到這些同步驗證程式變更時自動呼叫同一驗證函式，確保完整 `commit/push/資料庫` 流程不會漏掉檢查。此命令逐一讀取所有現存 `tc-test-*` fixture，僅對 `active`／`regression_pending` 狀態套用新版完整 manifest、父版本 Git 歷史、資料結構、筆數、敏感欄位與 checksum 驗證，任一此類 fixture 不合格即停止一般 commit/push。驗證成功後，才可提交同步程式／文件；若本次同時修正 fixture manifest，應將精確修正一併納入同一組已驗證變更，確保遠端程式與 fixture 格式相容。此檢查只讀檔案，不連線或修改資料庫；不得因格式驗證而執行 fixture publish。之後在 `develop` 直接執行 `npm run testdata:handoff:publish`；不可先執行 `npm run testdata:handoff`，避免先產生 fixture 差異而觸發安全停止。此 publish 入口自行判斷有無合格 fixture 變更，無變更就略過 commit/push；有變更時只有安全檢查全數通過才會精確提交／推送 fixture。若不在 `develop`、本機 Supabase 不可用、存在無關／歸屬不明變更、驗證失敗或 Git／fixture 安全檢查失敗，停止受影響的寫入操作並回報未完成項目，不可繞過檢查或宣稱已同步。最後提供一般 commit/push、fixture 交接、剩餘未提交內容與接收端接手指引。此流程不是正式發布：不合併 `main`、不部署、不清除資料；一般 commit/push 指令本身仍不授權執行本流程。
- Git pull 只同步檔案，不代表 Supabase 本機資料庫已同步。若任務涉及資料庫或 migration，另行檢查 `npx supabase status` 與 `npx supabase migration list --local`；確認 Docker／本機 Supabase 正常後，檢視所有待套用 migration SQL，再決定是否執行 `npx supabase migration up --local`。
- 套用可能刪除／重建資料、改變欄位型別或主鍵、刪欄位／索引、改寫資料、影響附件關聯的 migration 前，必須先建立可辨識且可還原的本機資料備份，並確認備份檔存在且非空。若無法可靠備份、無法確認還原方式，或 migration 會影響 Supabase Storage 物件，先停止並回報，不得冒險執行。一般純新增且不破壞既有資料的 migration 仍須先檢視 SQL 與驗證條件。
- 不得自動執行 `db reset`、刪除 Docker volume、`migration repair`、`db push --linked` 或其他正式環境寫入操作；正式 Supabase 的部署、資料修復或其他不可逆操作必須先取得使用者明確核准。
- 同步或 migration 失敗時，保存完整錯誤訊息與當下 Git／migration 狀態；不要反覆重試可能有副作用的命令，也不要為了讓狀態看起來一致而略過檢查。

# 標準發布流程（「進行發布流程」觸發）
- 使用者明確下達「進行發布流程」時，將其視為啟動本節完整標準發布工作流的指令，無須再要求使用者重複列出 commit、push、合併、部署、部署後整理文件及切回 develop。此指令明確授權在已確認的發布範圍內執行必要的 Git commit／push、develop 合併至 main、Git 版本標籤及既定部署命令；不代表核准尚未定案的產品內容，也不授權未審查的正式資料庫破壞性操作。
- 全程以根目錄 `AGENTS.md` 的 Git 安全規則為優先。開始先檢查工作樹、目前分支、upstream 並 `git fetch origin`。若有與本次發布無關的未提交變更、untracked 檔案、分支／upstream 異常、遠端分歧、無法判定變更歸屬或無法安全 fast-forward，停止發布寫入操作，保留現況並回報；不得 stash、reset、覆寫或以 `git add .` 混入無關檔案。
- **階段 1｜develop 準發布整理**：從 `develop` 開始；先確認本次發布範圍、版本號、release notes、路線圖、版本 metadata、程式碼與測試結果。依 `docs/08_開發規範.md` 的「發布前停止線」整理文件，確認 `14_專案現況總覽` 仍標示未發布／發布候選，盤點版本專屬文件與連結，標明尚未實作、未驗證及人工補驗事項。產品內容／版本資訊未定案、必要驗證失敗或發布範圍不清楚時停止並詢問，不得猜測。
- **階段 2｜候選版驗證與 develop commit/push**：執行本次變更要求的 lint、測試、build、文件連結及其他專案專屬驗證；涉及 PWA／Service Worker、正式天氣鏈路或 Supabase 時，另執行本文件指定的硬性檢查。檢查 diff 與檔案清單，只 stage 本次發布所需的明確檔案。驗證通過後，以繁體中文建立候選提交並推送 `origin/develop`；若失敗，停止，不進入 main。
- **階段 3｜合併至 main 與發布驗證**：確認 develop 候選提交已推送且工作樹乾淨後，才切換／更新 `main`。先確認 `main` 與候選提交的共同歷史及差異；只採用可清楚追溯的合併方式，不得 reset、force-push 或丟棄 main 上的提交。將已核准的 develop 候選合併至 main，執行要求的 lint／build／版本一致性驗證；依專案既有合併策略完成合併提交（不得為了合併而使用 `git add .`），再推送 `origin/main`。若有衝突、非預期提交或驗證失敗，停止並回報，不得強行解決或部署。
- **階段 4｜Git 版本標籤與部署**：確認 `main` 上的候選提交、版本號、版本 metadata、必要 migration／函式與驗收範圍一致後，依專案既定格式建立 annotated Git 版本標籤並推送。接著執行本次已確認發布範圍內的既定部署步驟及發布後 smoke。不得只憑命令成功、HTTP 200、metadata 或空結果宣告完整端到端驗收通過；依 `AGENTS.md` 的 PWA／天氣規則區分已驗證與待補驗項目。正式 Supabase schema／資料變更、破壞性 migration、資料修復、Secrets 變更或其他不可逆操作，除非該具體操作及其風險已獲明確核准，否則停止該操作並回報，不得以一般發布觸發詞推定其已核准。
- **階段 5｜確認部署結果並回到 develop**：只有取得實際部署成功證據及 Product Owner／既定驗收流程要求的確認，才能把版本標記為「已發布」。不論部署成功或失敗，完成當次部署嘗試的狀態蒐集後，都必須安全返回 `develop`；切換前確認工作樹乾淨，若有未提交的部署紀錄或必要修改，先依明確檔案清單保存到安全的 develop 工作流程，不得遺失或覆寫。若無法安全切回，停止並明確回報目前分支，不能默默結束在 main。
- **階段 6｜develop 部署後文件定稿與再次 commit/push**：回到 `develop` 後，依實際部署證據整理文件，將 `14_專案現況總覽`、`02_產品開發路線圖`、版本更新紀錄、`archive/README.md`、本版專屬文件及所有相對連結更新為真實狀態；只把已實作、已部署且有證據的內容寫成完成，將未部署、失敗、未驗證及待補驗項目保留為明確狀態。完成檔案位置／連結盤點、`npm run verify:docs-links`、`git diff --check` 及必要檢查後，只 stage 本次發布後文件，使用繁體中文 commit 並推送 `origin/develop`。若部署未成功，文件不得宣告已發布；應記錄失敗／阻塞與下一步，再按同樣方式保存並推送狀態。
- **階段完成條件**：發布工作只有在「候選版已驗證並推送 develop、核准版本已合併並推送 main、版本標籤與部署結果已核對、最終工作分支回到 develop、部署後文件已反映證據並再次 commit/push」全部完成時，才能回報完整完成。任何階段遇阻，回報已完成階段、阻塞原因、目前分支／Git 狀態、已部署與未部署事項、下一個安全步驟；不得把部分完成說成發布完成。
- 發布流程每次都須在回覆中提供階段狀態摘要，至少包含：develop 候選 commit、main 合併／推送結果、Git 版本標籤、部署證據與未通過驗收、部署後文件 commit、最終分支與工作樹狀態。不得因流程很長而省略「切回 develop」及「部署後文件再次 commit/push」兩個收尾步驟。

# 本專案回覆語言偏好
- 所有回覆皆使用繁體中文。

# PWA 更新接管硬性規則
- 必須沿用 V3.9.24／V3.9.27 已驗證的更新接管方案；不得以延長等待時間或新增第二次「重試更新」點擊取代接管狀態修正。
- 驗證更新時仍必須同時核對頁面顯示版本、`registration.active`、`waiting`、`installing` 與 `navigator.serviceWorker.controller`；單一 metadata 或單次載入結果不足以證明流程正常。
- 當新版 worker 已是 activated replacement（`registration.active !== previousController`、狀態為 `activated`，且沒有 `waiting`／`installing`），由 `useAppUpdate` 唯一 reload owner 寫入最新版本並直接 reload；不得轉入 `ready-to-reload` 或要求使用者再次點擊。
- `handoffState === "active"` 且 `registration.active` 已確認為 activated 時，沿用同一個唯一 reload owner 直接 reload；`skipWaiting` 只能送出一次，避免重複接管競態。
- 只有上述已驗證的 active／controlled 狀態可以完成更新；真正 timeout／error 必須保留目前版本並停止本次流程，不得宣告已更新。不得以靜態 metadata、單純 reload 或延長 timeout 取代 active／handoff 證據。
- 每次 `npm run build` 必須執行 `npm run verify:pwa-update-policy`，檢查目前 App／package／公開 metadata 版本與更新設定一致，以及 Vite PWA prompt 模式與版本 metadata 不進入 precache。此腳本只做設定一致性與 build 子測試掛載檢查，不重複實作版本演算法或 Worker lifecycle 測試。
- PWA 行為測試由既有專責腳本負責：`verify:update-policy`（版本政策演算法）、`verify:v3924-update-handoff`（主動更新與 handoff）、`verify:v31011-pwa-reload-confirmation`（stable replacement、waiting-only、pending marker／新頁面確認）、`verify:v3913-update-race`（更新與行程修訂競態）。這些項目必須保留在 build 鏈中；避免在新測試複製相同案例。若未來經 Product Owner 核准更動政策，才同步調整相關測試與規格。
- 任何修改 `useAppUpdate`、Service Worker、版本 metadata 或發布流程的工作，除 build 內的 `verify:pwa-update-policy` 外，都必須更新並通過 `npm run verify:v3924-update-handoff`、`npm run verify:v31011-pwa-reload-confirmation` 與 `npm run verify:v3913-update-race`；不得以靜態 metadata、單純 reload 或單次本機頁面載入取代 active/controller handoff 證據。

# 天氣正式鏈路驗證硬性規則
- 本機 Edge Function 成功不代表正式天氣鏈路成功；正式發布前必須區分 endpoint／授權、Google Places 座標、座標快取、Open-Meteo、lease／RPC、天氣快取寫入及 APP 顯示結果。
- 沒有正式環境合資格天氣卡片的實際 `fresh` 或 `stale` 結果時，不得宣告正式天氣端到端驗收通過；`results=[]`、OPTIONS 200、未授權 401 或空結果只算邊界／路由驗證。
- 天氣失敗只能回傳安全診斷碼與 opaque trace ID；不得回傳或記錄 API key、Authorization、Trip 內容、place ID、原始 provider body 或 secret 值。

# 診斷紀錄自動維護規則
- 每次對 Travel-Companion 執行有意義的診斷、除錯、驗證或根因分析後，必須在同一工作階段自動更新相關的既有診斷／驗收文件，不要等使用者提醒。天氣 V3.10.7 RC 的持續追查主文件為 `docs/92_V3.10.7_多日天氣快取回寫追查計畫.md`。
- 每筆追加紀錄至少包含：日期／時間或測試輪次、檢查範圍與環境、觀察到的證據、已確認事實、推論與尚未確認事項、下一步、驗證結果及安全邊界。明確區分正式唯讀證據、本機隔離測試與正式寫入／部署，不能把假設寫成結論。
- 若診斷結果會影響發布狀態或專案當前目標，同步更新相應權威文件；不要重複建立多份內容相同的日誌。記錄完成後確認文件 diff，並保留原有未提交變更。
- 診斷日誌不得包含 API key、Authorization、Secrets、原始 provider body、完整座標、lease token 或不必要的個人／行程資料；以安全錯誤碼、布林結果與必要的 trace 關聯資訊為限。沒有明確授權不得因此部署正式函式、修改正式資料庫／Secrets、清除快取或進行 Git 發布操作。
