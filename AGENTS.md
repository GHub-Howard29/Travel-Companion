# Codex 協作指示

- 使用中文撰寫 commit 訊息。
- 未經明確指示，不自動 commit 或 push。**一般 `commit`、`push` 或 `commit/push` 指令只授權該次明確要求的 Git 操作，不代表觸發換電腦交接流程。只有使用者明確輸入完整指令 `commit/push/工作結束`，才授權執行本文件「換電腦交接流程」：檢查任務與 Git 狀態、整理文件及執行適用驗證、只提交／推送本次任務範圍內且安全可交付的一般程式碼／文件變更，再執行 `npm run testdata:handoff:publish`、確認結果並產生另一台電腦的接手指引。若工作樹含無關或歸屬不明的變更、驗證失敗、分支／遠端狀態不安全，須保留現況並停止受影響的寫入操作，不可使用 `git add .`、強制覆寫或 reset。完整交接指令不等於正式發布授權：不合併 `main`、不部署、不清除資料、不自行切換分支。若不在 `develop`，不可自行切分支執行測試資料 publish；須回報狀態與阻礙。單純一般工作完成、暫停對話或提及換電腦，都不得由 AI 自行推斷為交接觸發。
- 在重要結論、規劃或實作前，先檢查需求、前提、限制與可驗證證據；簡單且低風險的請求採相稱深度，不必為形式而展開冗長分析。
- 若發現邏輯缺口、互相衝突的條件、未經證實的假設或可能影響結果的認知偏差，應直接說明具體證據、影響與可執行的改善方式。若差異會實質改變結果且無法安全推定，再請使用者決定。
- 不因迎合而隱瞞問題，也不為反對而反對；在安全、授權與既定範圍內，仍應忠實執行使用者的明確要求。
- 清楚區分已確認事實、合理推論、建議方案與尚未完成的驗證，不把未測試或未發布的結果描述成已完成。

# Supabase 雙電腦同步期間的公司電腦限制
- 「A／B 電腦 Supabase 測試資料完整版本控制與同步流程」已完成公司電腦端核心流程驗證，並已進入家用電腦同步與交接自動化階段。後續應依目前指定的 OpenChatX 主機及實際 Git 狀態繼續處理文件／程式整合，不因連線主機不是公司電腦就一律停止；但不得把家用電腦上的本機測試結果誤報為公司電腦證據，也不得在未確認前操作另一台電腦。
- 公司電腦識別基準仍為 Windows `COMPUTERNAME=TPEPC-TM7503-01`、`USERDOMAIN=NICE-GREEN`，專案路徑 `D:\\Project\\Travel-Companion`。只有明確執行公司電腦專屬命令、讀取公司電腦本機資料庫或宣稱公司端新驗證結果時，才必須確認實際主機識別；主機不符時，只能停止該公司端操作，不能阻止在家用電腦繼續做可安全完成的整合工作。
- 兩台電腦各自的本機標準同步／回歸入口已驗證通過；真正 A→B→A 雙向交接、兩端各自新增資料合併與生命週期端到端驗收仍待真實事件發生時補驗，不刻意製造新測試資料。

# 每次開始工作前：Git 與 Supabase 核對
- 每次開始任何專案任務，先在專案根目錄檢查 `git status --short --branch`、目前分支與 upstream；再執行 `git fetch origin`，確認本機與遠端差異。不得因任務看似只改文件就跳過。
- 若工作目錄乾淨、目前分支是 `develop`，且遠端只有可安全 fast-forward 的新提交，允許直接執行 `git pull --ff-only origin develop`，然後確認最新 commit 與工作目錄狀態。
- 若工作目錄有未提交修改或 untracked 檔案，先判斷是否屬於本次任務；一般任務不得自動切分支、stash、覆寫或 reset，應保留現況並回報。唯一例外是使用者已明確下達「進行發布流程」，且逐一檢視後確認所有待提交變更均屬於本次發布候選時，可依標準發布流程只 stage 明確檔案並提交；任何無關或歸屬不明的變更都必須停止。一般任務若目前分支不是 `develop`，不得自行切換。標準發布流程則可在工作樹乾淨、分支／upstream 已核對、遠端差異可安全處理且目前階段要求時，依序切換 `develop`／`main`；不得因發布需要而忽略遠端分歧、強制覆寫或 reset。沒有 upstream 或本機與遠端分歧時，仍須停止並回報差異，先處理安全同步方案。
- 雙電腦合成測試資料交接共用既有 `testdata-sync.mjs`，不建立第二套發布流程。接收端仍由 `npm run db:sync:local` 自動執行 `npm run testdata:handoff` 偵測及驗證；來源端有合格 fixture 變更時使用 `npm run testdata:handoff:publish`，在 develop／upstream、工作樹、fixture 驗證、精確檔案白名單及遠端快轉安全條件全部通過後，才自動 stage fixture manifest/data、commit、push origin/develop。有任何非預期檔案、敏感資料、衝突、分支／upstream 異常或遠端分歧即停止；不自動 pull、reset、merge main、部署或清除資料。無變更則略過 commit/push。完整雙向交接、兩端各自新增資料的合併及生命週期驗收，待真實需求發生時補驗，不刻意製造測試資料。
- **換電腦交接流程（僅由完整指令觸發）：** 只有使用者明確輸入 `commit/push/工作結束` 才執行完整交接；一般 `commit`、`push`、`commit/push`、單次工作完成、暫停對話或提及換電腦都不觸發。收到完整指令後，先檢查分支/upstream、遠端差異與工作樹，確認哪些變更屬於本次交接；整理相關文件並執行適用驗證，僅對本次任務範圍內、驗證合格且無無關／歸屬不明變更的一般程式碼與文件進行精確 stage、commit、push。不可用 `git add .`，不可覆蓋、reset、強制推送或自動切換分支。之後在 `develop` 直接執行 `npm run testdata:handoff:publish`；不可先執行 `npm run testdata:handoff`，避免先產生 fixture 差異而觸發安全停止。此 publish 入口自行判斷有無合格 fixture 變更，無變更就略過 commit/push；有變更時只有安全檢查全數通過才會精確提交／推送 fixture。若不在 `develop`、本機 Supabase 不可用、存在無關／歸屬不明變更、驗證失敗或 Git／fixture 安全檢查失敗，停止受影響的寫入操作並回報未完成項目，不可繞過檢查或宣稱已同步。最後提供一般 commit/push、fixture 交接、剩餘未提交內容與接收端接手指引。此流程不是正式發布：不合併 `main`、不部署、不清除資料；一般 commit/push 指令本身仍不授權執行本流程。
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
- 任何修改 `useAppUpdate`、Service Worker、版本 metadata 或發布流程的工作，都必須更新並通過 `npm run verify:v3924-update-handoff` 與 `npm run verify:v3913-update-race`；不得以靜態 metadata、單純 reload 或單次本機頁面載入取代 active/controller handoff 證據。

# 天氣正式鏈路驗證硬性規則
- 本機 Edge Function 成功不代表正式天氣鏈路成功；正式發布前必須區分 endpoint／授權、Google Places 座標、座標快取、Open-Meteo、lease／RPC、天氣快取寫入及 APP 顯示結果。
- 沒有正式環境合資格天氣卡片的實際 `fresh` 或 `stale` 結果時，不得宣告正式天氣端到端驗收通過；`results=[]`、OPTIONS 200、未授權 401 或空結果只算邊界／路由驗證。
- 天氣失敗只能回傳安全診斷碼與 opaque trace ID；不得回傳或記錄 API key、Authorization、Trip 內容、place ID、原始 provider body 或 secret 值。

# 診斷紀錄自動維護規則
- 每次對 Travel-Companion 執行有意義的診斷、除錯、驗證或根因分析後，必須在同一工作階段自動更新相關的既有診斷／驗收文件，不要等使用者提醒。天氣 V3.10.7 RC 的持續追查主文件為 `docs/92_V3.10.7_多日天氣快取回寫追查計畫.md`。
- 每筆追加紀錄至少包含：日期／時間或測試輪次、檢查範圍與環境、觀察到的證據、已確認事實、推論與尚未確認事項、下一步、驗證結果及安全邊界。明確區分正式唯讀證據、本機隔離測試與正式寫入／部署，不能把假設寫成結論。
- 若診斷結果會影響發布狀態或專案當前目標，同步更新相應權威文件；不要重複建立多份內容相同的日誌。記錄完成後確認文件 diff，並保留原有未提交變更。
- 診斷日誌不得包含 API key、Authorization、Secrets、原始 provider body、完整座標、lease token 或不必要的個人／行程資料；以安全錯誤碼、布林結果與必要的 trace 關聯資訊為限。沒有明確授權不得因此部署正式函式、修改正式資料庫／Secrets、清除快取或進行 Git 發布操作。
