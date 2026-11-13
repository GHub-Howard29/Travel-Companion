# 110_正式 PWA 網路行為自動鑑測與 AI 診斷計畫

> 文件編號：110  
> 文件狀態：**規格已定案；執行時間未定**  
> 建立日期：2026-11-13  
> 適用專案：Travel-Companion  
> 性質：跨版本品質診斷計畫，不屬於特定產品版本功能  
> 正式鑑測啟動條件：工具穩定性驗收通過，且每次執行前完成版本核對並取得 Product Owner 確認。

---

## 1. 目的

建立一套以正式部署 PWA 為對象的自動化網路行為鑑測流程，透過可重複的瀏覽器情境測試與網路事件紀錄，找出不必要、過度頻繁、重複或不合理的網路活動，並將證據對應至 Travel-Companion 原始碼，提供可驗證的改善建議。

本計畫採用：

**規則引擎先判斷、AI 再診斷。**

規則引擎負責依測試情境、請求特徵及可量化條件整理異常候選；AI 再結合程式碼、呼叫關係與執行情境分析觸發原因、影響及改善方式。不得只依請求總數或持續連線時間，直接由 AI 猜測程式有問題。

## 2. 執行狀態與排程

- 本計畫規格已定案並納入專案權威文件。
- **正式六項鑑測的執行時間未定，不納入任何既定版本發布時程。**
- 本文件存在不代表已授權開始正式鑑測、修改程式或部署任何內容。
- 下一個前置工作是唯讀驗證 Open Browser Use、Open Computer Use（僅桌面操作需要時）及 Node.js/CDP 的穩定性與持續事件採集能力。
- 工具穩定性驗收通過後，仍須依第 7 節完成每次執行前的版本核對及使用者確認，才可開始正式鑑測。
- 未取得額外授權，不得修改 App、加入監控埋點、安裝依賴、修改正式資料或執行正式環境寫入。

## 3. 監測目標與環境

### 3.1 正式部署 PWA

- 監測對象為目前正式部署的 Travel-Companion PWA，而非只在本機開發伺服器執行的版本。
- 正式部署入口：`https://ghub-howard29.github.io/Travel-Companion/`
- 每次鑑測前，必須確認正式網站實際載入的版本與 GitHub 最新正式 Tag／Commit。
- 監測的是正式 PWA 真正執行時的網路行為，不以本機 Supabase 或模擬環境取代正式環境觀察。

### 3.2 Supabase

- 使用正式 PWA 當下實際連線的 Supabase 專案作為網路行為觀察對象。
- 不限制只能連接本機 Supabase。
- 本計畫以瀏覽器實際發出的網路請求及連線事件為資料來源；不直接查詢資料庫、不讀取資料表內容，也不需要為本計畫建立資料庫監控平台。

### 3.3 非目標

本計畫不包含：
- 版本比較組或多版本效能比較。
- 長期常駐監控平台、監控儀表板或 App 內遙測系統。
- 在 App 程式碼內新增監控埋點。
- 複製正式資料庫至本機或建立額外測試資料庫。
- 資安稽核、RLS／權限審查或資料庫內容分析。
- 收集請求本文、行程內容、帳目、Email、Token、Cookie 或其他使用者資料。
- 為了監控而修改正式 PWA、正式 Supabase 或使用者資料。

## 4. 六項自動化測試情境

正式鑑測固定採用以下六項，不自行擴增測試項目。各情境的執行時間、閒置時間及重複次數由工具穩定性前置驗證與正式執行紀錄明確記載，不得隱藏或事後推測。

| 編號 | 測試情境 | 觀察重點 |
|---|---|---|
| T01 | App 啟動後閒置 | 啟動完成後不操作，觀察初始化請求是否結束、閒置時是否仍有不合理請求或重複下載。 |
| T02 | 主要頁面切換及閒置 | 依既定主要頁面操作流程切換並停留，觀察頁面切換是否觸發重複讀取、無效刷新或閒置活動。 |
| T03 | 共用帳本閒置 | 開啟共用帳本後保持閒置，觀察 Realtime 訂閱、必要心跳／備援輪詢及其他請求是否符合其功能目的。 |
| T04 | 卡片編輯鎖 | 開啟卡片編輯情境但不修改或儲存內容，觀察編輯鎖建立、續租／心跳、釋放及相關網路活動。 |
| T05 | 切換背景、最小化及關閉 | 依序執行切換背景、最小化及關閉測試情境，觀察背景期間請求、連線生命週期及關閉後是否仍有不合理活動。 |
| T06 | 網路中斷及恢復 | 在瀏覽器測試環境中模擬網路中斷及恢復，觀察失敗、重試、重新連線、重複請求與恢復後同步行為。 |

### 4.1 正式資料保護

- 正式 PWA 可能載入真實行程及帳本資料；測試操作以讀取、頁面切換、閒置、背景及連線狀態觀察為主。
- T04 不得修改卡片內容或儲存資料；不得為了製造請求而新增、刪除或修改正式行程／帳目。
- 若某情境必須寫入正式資料才能完成，先停止該情境並提出所需資料與操作，未獲明確授權不得執行。
- 不得因測試需要清除正式資料、登出使用者、撤銷權限或修改正式資料庫。

## 5. 六類監控資料

僅收集下列必要網路 Metadata：

| 編號 | 收集資料 | 必要內容 |
|---|---|---|
| D01 | 網路請求網址及類型 | URL／網域、HTTP method、資源類型及可辨識的請求類別。 |
| D02 | 請求時間及發生頻率 | 發起、回應及完成時間；測試情境內的次數、間隔與頻率。 |
| D03 | HTTP 狀態碼及錯誤 | HTTP status、瀏覽器網路錯誤、失敗原因及 WebSocket 關閉／錯誤狀態（可取得時）。 |
| D04 | 上傳及下載流量大小 | request／response 傳輸大小；若瀏覽器未提供精確值，標示為估算或不可得，不得當成精確流量。 |
| D05 | WebSocket 連線及訊息數量 | 連線建立／關閉、訊息方向、訊息數量與可取得的傳輸大小；不保存訊息內容。 |
| D06 | 背景活動及請求觸發情況 | 對應 T01–T06 的測試階段、前景／背景／最小化／關閉／離線／恢復狀態，以及請求發生時的情境標記。 |

### 5.1 資料最小化

- 不記錄 Request Body、Response Body、WebSocket frame 內容或任何業務資料。
- 不記錄 Authorization、Cookie、Access Token、Refresh Token、API Key 或 Secret。
- URL 若含有可能識別使用者或業務資料的 query／path 值，須在保存前遮蔽或正規化；保留足以辨識端點及請求類型的資訊。
- 不將網路 Metadata 上傳至第三方分析平台；報告僅保留診斷必要的摘要證據。
- 若工具無法在不保存敏感內容的前提下收集必要 Metadata，該項採集視為未通過，不得擴大收集範圍來補足。

## 6. 監控與分析架構

正式架構固定為：

**正式部署 PWA → Open Browser Use 執行測試 → CDP 事件採集器收集網路 Metadata → 規則引擎整理異常候選 → AI 對照專案原始碼診斷 → 產生報告。**

### 6.1 Open Browser Use

- 負責開啟及操作正式 PWA、執行 T01–T06、標記測試階段及確認頁面狀態。
- 必須使用可重複執行的操作流程；不得只以單次成功開啟頁面作為穩定性證據。
- 若工作階段失效、登入狀態異常、頁面操作中斷或測試步驟漏執行，必須將該次測試標記為失敗／不完整。

### 6.2 Node.js + CDP 事件採集器

- 以獨立採集器持續接收 Chrome DevTools Protocol（CDP）Network 事件，不依賴瀏覽器操作代理每一步都成功回報網路資料。
- 需驗證可持續接收請求發起、回應、完成、失敗及 WebSocket 事件；依實際可用事件組合完成 D01–D06。
- 採集器必須能將事件與測試情境及時間區間關聯。
- 採集器中斷、重連或發生事件缺口時，須留下明確標記；不得把缺失資料解讀為沒有網路活動。
- 不得把只成功送出 CDP command 當成已證明能持續接收事件。

### 6.3 Open Computer Use

- 只在需要操作瀏覽器以外的桌面層級狀態時使用，例如原生視窗最小化、切換桌面視窗或確認桌面工作階段。
- 不負責主要網頁 DOM 操作或網路事件採集。
- 若 T05 可由瀏覽器本身可靠完成，優先使用 Open Browser Use，不額外引入桌面操作步驟。
- 桌面工作階段、焦點或視窗狀態無法穩定確認時，相關測試標記為不完整。

### 6.4 規則引擎與 AI

1. 規則引擎先依測試情境、端點類別、請求間隔、重試／重連、狀態碼、傳輸量、WebSocket 生命週期及背景狀態建立異常候選。
2. 規則引擎須保留正常行為的預期用途及基準；單純請求數量高、持續連線或持續心跳不是異常的充分條件。
3. AI 讀取規則引擎輸出的候選與原始網路證據，再對照目前專案程式碼、函式及呼叫關係。
4. AI 必須明確區分直接證據、推論與未知事項；無法對應到程式碼時，不得捏造檔案、函式或行號。
5. 每一項改善建議均須附有可重複的驗收方式。

## 7. 每次執行前的版本確認閘門

每次正式鑑測開始前，必須完成以下步驟：

1. 查詢 GitHub 最新正式發布 Tag，確認其對應 Commit。
2. 查詢正式部署 PWA 實際載入版本（以公開版本資訊及瀏覽器實際載入狀態交叉確認）。
3. 比對 GitHub 正式 Tag／Commit 與正式 PWA 部署版本是否一致。
4. 向 Product Owner 顯示核對結果，包含 GitHub 正式版本、Tag／Commit、部署 PWA 版本及差異。
5. **取得 Product Owner 明確確認後才可開始該次鑑測。**

若 Tag、Commit 或部署版本無法確認，或兩者不一致，必須停止正式鑑測並回報；不得自行選擇其中一個版本、擅自部署或把版本差異當作測試條件。這項檢查是測試目標確認，不是版本比較組。

## 8. 工具穩定性前置驗收

工具穩定性驗收是正式鑑測的必要前置條件。驗收目標不是證明工具存在或單次可用，而是證明整段測試期間能持續執行、完整收集並可重複恢復。

| 驗收項目 | 驗收要求 |
|---|---|
| 啟動與連線 | 能反覆啟動並連接正確瀏覽器及目標分頁。 |
| 工作階段維持 | 測試期間不會無故失去瀏覽器、分頁或必要登入狀態。 |
| 操作可重複性 | 六項情境的必要操作可依序執行，狀態可被確認，不漏步驟。 |
| 持續採集 | Node.js/CDP 在測試期間持續接收 Network 與 WebSocket 事件，而非僅能送出單次指令。 |
| 長時間及背景狀態 | 閒置、切背景、最小化及關閉等情境能維持可判讀的狀態與紀錄。 |
| 中斷與恢復 | 能辨識採集器／瀏覽器中斷、重連及資料缺口；恢復後不把重複事件誤當新請求。 |
| 結果完整性 | 每次測試均有開始、結束、步驟狀態、採集器狀態及資料完整性紀錄。 |

### 8.1 建議驗收門檻

- T01–T06 每項至少連續重複 5 次。
- 測試操作完成率至少 95%。
- 每次測試均須有可核對的採集開始／結束標記；事件缺口必須明確揭露，不能以 95% 完成率掩蓋。
- 不應依賴人工反覆重啟工具、修復連線或補做已漏失步驟。
- 中斷恢復測試須能明確辨識資料缺口，並證明恢復後採集重新正常。
- 未達門檻時，僅記錄工具問題與失敗原因，不開始正式六項鑑測。

上述次數與完成率是工具驗收門檻，不是正式 PWA 異常判斷門檻；不得將其套用為網路請求頻率的異常標準。

## 9. 正常網路行為的誤判防止

下列行為可能是系統正常設計，必須先確認功能目的、生命週期、預期頻率與觸發條件，不得僅因持續使用網路就判定錯誤：

- Supabase Realtime 即時訂閱與必要的連線維持。
- 共用帳本的 Realtime 事件及既有備援輪詢。
- 卡片編輯鎖的租約續租／心跳與釋放。
- 正常的登入 Session 維持、網路恢復及必要同步。
- 瀏覽器、Service Worker 或 Supabase SDK 自身的正常連線管理。

判斷原則：
- 持續存在的 WebSocket 連線不等於持續下載資料。
- 心跳或租約續租必須依其設計週期、有效工作階段及是否已釋放判斷。
- Realtime 與備援輪詢需區分正常待命、事件觸發後重新讀取及不合理的重複輪詢。
- 若目前無法取得預期週期或程式碼證據，列為「證據不足、需要複測」，不得直接判定缺陷。
- 不得為了降低請求數而建議移除必要的 Realtime、編輯鎖或資料同步保護。

## 10. AI 診斷報告規格

每份報告至少包含以下欄位：

| 報告項目 | 必須提供的內容 |
|---|---|
| 異常行為 | 哪些請求或連線行為不合理，以及判斷依據。 |
| 實際證據 | 發生時間、頻率、請求間隔、狀態碼、傳輸量及對應事件紀錄。 |
| 觸發原因 | 閒置、頁面切換、切背景、最小化、關閉、網路中斷／恢復或重新連線等。 |
| 程式碼位置 | 原始碼檔案路徑、函式／方法名稱、行號；需與本次核對的程式碼版本一致。 |
| 問題影響 | 對網路流量、效能、電量及資料同步的實際或可能影響，並區分已觀察與推估。 |
| 改善方案 | 建議調整的行為、位置及理由；不得擅自實作。 |
| 優先順序 | 高／中／低，說明排序依據。 |
| 驗收方式 | 修改後應重跑的測試情境、應觀察的證據及改善成立條件。 |

### 10.1 診斷可信度分類

每個發現必須且只能歸入以下一種狀態：

1. **已確認問題**：有可重現的實際證據，觸發情境清楚，且能合理對應到目前程式碼位置或明確的系統行為。
2. **高度疑似問題**：多項證據指向異常，但仍有尚未排除的合理解釋，或程式碼因果鏈尚未完全確認。
3. **證據不足、需要複測**：事件缺漏、工具不穩、樣本不足、程式碼位置無法確認，或缺乏足以判斷正常／異常的基準。

不得將高度疑似或證據不足寫成已確認 Bug；工具失敗、測試未完成及採集資料缺口應另行標示，不可歸因於 App。

### 10.2 優先順序

- **高**：已確認且可能造成大量不必要流量、持續背景活動、明顯效能／電量負擔，或影響資料同步正確性。
- **中**：有明確改善價值，但影響範圍、頻率或嚴重程度有限。
- **低**：影響輕微、發生條件罕見，或屬可延後處理的效率改善。
- 優先順序不得取代可信度分類；例如「高度疑似／高優先」仍不是已確認問題。

### 10.3 驗收方式

每項改善建議都必須指定：
- 修改前的基準測試情境及證據。
- 修改後重跑的 T 編號。
- 要比較的請求頻率、傳輸量、狀態碼、連線／訊息生命週期或背景活動指標。
- 預期改善結果及不可退化的既有功能。
- 確認 Realtime、編輯鎖、同步及離線保護仍正常的必要回歸。

## 11. 執行流程

1. 確認本計畫仍未排程，取得本次執行授權。
2. 執行工具穩定性前置驗收；未通過即停止。
3. 執行第 7 節版本確認，向使用者展示並取得確認。
4. 啟動 CDP 採集器，確認事件接收與測試標記正常。
5. 依序執行 T01–T06，逐項記錄開始／結束、操作結果與採集完整性。
6. 先執行規則引擎整理異常候選及正常行為摘要。
7. AI 對照同一程式碼版本的檔案、函式、呼叫關係與行號，產生診斷報告。
8. 檢查報告的證據、可信度、程式碼位置及驗收方式；無法證實者降級，不得猜測。
9. 回報已確認問題、高度疑似問題、證據不足項目及工具／測試失敗。
10. 是否修改程式、文件、執行修正或再次鑑測，均依 Product Owner 另行授權，不由報告自動觸發。

## 12. 失敗處理與停止條件

遇到下列情況，停止受影響的測試或整次鑑測並標記原因：

- 正式 PWA 版本無法確認，或與 GitHub 正式 Tag／Commit 不一致。
- 瀏覽器工作階段、登入狀態或目標分頁不正確。
- Open Browser Use 操作不穩定，導致測試步驟無法確認。
- CDP 採集器中斷、事件缺漏或無法證明資料完整。
- 工具重連後無法區分新事件與重複事件。
- 測試可能修改正式行程、帳目或其他真實資料。
- 收集資料可能包含本文、憑證或不必要個人資料。
- AI 無法取得與本次部署版本相符的原始碼證據。

失敗時保留必要的非敏感診斷 Metadata，記錄已完成與未完成的測試，不得用推測補齊資料，也不得自動重複執行可能產生副作用的操作。

## 13. 授權與變更邊界

- 本文件核准的是計畫規格及前置工具穩定性驗證方向，不等於核准正式六項鑑測。
- 工具穩定性驗證以唯讀及隔離測試為原則；若需安裝套件、修改設定、建立採集器檔案或改動專案程式，須先取得明確授權。
- 未獲明確授權不得修改 Travel-Companion App、正式 Supabase、正式資料、登入權限、Secrets 或部署設定。
- 診斷報告只提出改善方案，不直接修改程式。
- 本計畫不自動觸發 commit、push、合併、版本標籤或發布。

## 14. 文件與狀態維護

- 本文件是本計畫的詳細規格唯一來源。
- `docs/README.md` 提供文件入口。
- `docs/02_產品開發路線圖.md` 記錄此跨版本計畫已定案但未排程，不將其編入特定產品版本。
- `docs/09_待辦事項_TODO.md` 記錄尚未執行的前置工具穩定性驗證及正式鑑測狀態。
- `docs/14_專案現況總覽.md` 記錄本計畫的存在、排程狀態及下一個前置工作。
- 每次實際工具驗證或正式鑑測完成後，應在本文件或另行核准的專項紀錄中追加日期、環境、證據、結果、未確認事項及下一步，並同步更新權威狀態文件。

## 15. 2026-11-13 前置工具穩定性初步驗證紀錄

> 本節為工具能力初步檢查，不是正式 T01–T06 鑑測，也不代表已通過第 8 節完整穩定性門檻。

### 環境

- 主機：`TPEPC-TM7503-01`。
- 專案 Node.js：`v22.23.2`；npm：`10.9.8`。
- OpenChatX capability health：Open Browser Use 與 Open Computer Use 均回報 `healthy`；此狀態僅代表 MCP 服務可連線，不代表整段測試流程穩定。

### Open Browser Use

- Browser backend `ping` 成功回傳 `pong`；`info` 回報 Chrome extension backend version `1.1.0`。
- `open_tab` 可建立正式 PWA 分頁；對該分頁執行 `Runtime.evaluate` 讀取頁面標題、來源路徑、readyState 與 visibility，連續 4 次均成功，頁面 `readyState=complete`。
- 初始 `tabs` 未列出已管理分頁；`user_tabs` 可看到既有正式 PWA 分頁，但該分頁已屬於另一個 browser session，嘗試 claim 及直接 CDP 操作均回報 session 不符。改由目前 session 建立新分頁後，CDP 讀取操作成功。
- 測試建立的新分頁已透過 `finalize_tabs` 清理；目前 session `tabs` 回傳空陣列。
- 初步結論：基本啟動、開頁及多次 CDP request-response 可用；但跨 session 分頁接管／重用有明確限制，尚不能證明長時間操作或持續事件採集穩定。

### Open Computer Use

- `list_apps` 可列出目前執行中的應用程式；`get_app_state` 對 Chrome 成功回傳視窗狀態及可存取性樹。
- 本次只做唯讀狀態檢查，未操作使用者視窗、點擊、最小化或切換桌面；因此尚未驗證重複桌面操作、視窗狀態維持或長時間穩定性。
- 初步結論：服務可用且能讀取桌面狀態；尚未通過穩定性驗收。若後續 T05 可由 Browser Use 完成，應避免引入 Computer Use。

### Node.js／CDP 持續事件採集

- 專案 Node.js `v22.23.2` 可用，Node runtime 內建 `WebSocket` 型別存在。
- 檢查目前 Chrome process command line，未觀察到 `--remote-debugging-port` 或 `--remote-debugging-pipe` 啟動參數。
- 目前可用 Open Browser Use CDP 工具提供單次 CDP command request-response；已取得的工具介面未提供持續 Network／WebSocket event stream 訂閱能力。
- 因目前沒有已確認可供 Node.js 直接連線的 Chrome CDP WebSocket endpoint，也沒有可用的持續事件訂閱介面，**尚未證明 Node.js 能持續接收 CDP Network 事件**。Node 具備 WebSocket API 不等於 CDP 採集已可用。

### 初步判定與下一步

- **工具穩定性驗收：未通過／尚未完成。** Open Browser Use 的基本操作可用，但存在跨 session 分頁接管限制；Open Computer Use 僅驗證一次唯讀狀態讀取；Node.js/CDP 持續事件採集仍未建立可驗證連線。
- 未執行正式 T01–T06；未收集正式網路流量樣本；未修改 App、專案程式、工具設定或 Chrome 啟動參數；未安裝套件；未修改正式 Supabase 或使用者資料。
- 下一步只需聚焦一件事：確認能否在不干擾使用者現有 Chrome 的前提下，取得專用受控瀏覽器的可持續 CDP WebSocket endpoint，並以獨立 Node.js listener 實際收到 Network 事件。若需要修改瀏覽器啟動方式、設定、安裝套件或建立採集器檔案，先取得 Product Owner 明確授權；在此之前不進行變更。

### 2026-11-13 工具介面追加盤點

- Open Browser Use capability health、`ping` 均正常；`info` 顯示目前透過 Chrome Extension `1.1.0` 提供瀏覽器控制，Native Messaging Host 使用 `stdio` 通訊。
- 目前可用 Browser Use 工具清單包含 `cdp`、`open_tab`、`tabs`、`user_tabs`、`claim_tab` 等；`cdp` 的介面是對 managed tab 執行單次 CDP command，沒有暴露事件訂閱、長連線或取得 CDP WebSocket endpoint 的工具。
- Chrome Extension manifest 具備 `debugger` 權限，表示擴充功能具備使用 Chrome Debugger API 的權限；但目前 MCP 工具介面未提供 `chrome.debugger.onEvent` 的持續事件轉送能力。這是值得優先確認的既有工具擴充方向，不代表事件採集已可用。
- 目前 Chrome 主程序未帶 `--remote-debugging-port`／`--remote-debugging-pipe`；檢查到的本機 `9749` 監聽埠屬於 `codebase-memory-mcp.exe`，不是 Chrome CDP endpoint，不可拿來連接瀏覽器。
- `user_tabs` 可列出使用者現有 Chrome 分頁，但 managed `tabs` 在本次工作階段為空；不得因可列出使用者分頁就推定可跨 session 接管或取得其 CDP event stream。
- **工具問題定位更新：**目前已確認的缺口是 Open Browser Use 對外沒有持續 CDP 事件介面，而不是 Node.js 缺少 WebSocket 能力，也不是 MCP 服務健康異常。優先評估兩條路徑：A. 在 Open Browser Use 後端增加受控的事件訂閱／緩衝讀取介面；B. 使用獨立、專用 Chrome profile 啟動隔離瀏覽器並提供 CDP WebSocket endpoint。兩條路徑都需要進一步檢視工具實作或建立隔離測試；本次未修改擴充功能、Native Host、Chrome 設定或啟動參數。
- 本次僅盤點工具介面、程序及設定資訊；未 attach debugger、未啟用 Network domain、未收集任何 PWA 網路事件，未修改使用者分頁或瀏覽器狀態。
- 下一步：先取得 Open Browser Use Native Host／extension 的唯讀原始碼檢視權限，確認其 debugger event 是否已在內部處理、能否安全轉送；若不具備可行介面，再評估隔離 Chrome 路徑。未取得授權前，不修改工具或建立採集器。

### 2026-11-13 V3.11.0 Android PWA 更新重複接管失敗回報與跨版本根因核對

> 本節為使用者實機回報及唯讀原始碼／歷史紀錄比對；不是已完成的根因實證，也不是正式 T01–T06 網路鑑測。未修改 App、Service Worker、瀏覽器、OpenChatX 工具或正式資料。

#### 使用者實際回報

- 正式部署版本更新提示顯示目前版本 `3.10.12`、可更新至 `3.11.0`，發布日期 `2026-11-13`。
- 使用者按下「馬上更新」後，畫面長時間停留在「等待新版接管…」，接著出現重新更新／重試提示；再次操作持續重複，形成無限循環。
- 使用者確認不需要再次下載或重新安裝：直接關閉並重新啟動 Android PWA，即可進入最新版本 `3.11.0`。
- 此回報顯示新版可在 PWA 冷啟動時執行；更新期間的接管、狀態判定或 reload 流程有異常。尚未取得故障當下 registration／Worker／controller 的實際快照，不能據此單獨確定是哪一個 lifecycle 分支失敗。

#### 歷史修復與實機證據整合

| 版本／紀錄 | 已有證據與修復內容 | 對本次分析的意義 |
|---|---|---|
| V3.9.21／V3.9.22，文件 70 | Android 更新後可能白畫面，關閉重啟可恢復；修復重點涵蓋 waiting／SKIP_WAITING、controllerchange、reload 時序。3.9.21→3.9.22 新流程仍需下一跳驗證，另曾遇資料 revision 與更新下載競態。 | 不能只檢查 Worker API，還要檢查更新前資料同步、舊頁面與新頁面的切換時序。 |
| V3.9.24，文件 72 | 3.9.23→3.9.24 曾出現等待後重試；當時根因包含啟動未主動更新檢查、active replacement 被誤判未準備好、handoff 只等待 controller 完成。修復後 3.9.23→3.9.24 Android 真實跨版本回歸通過，並記錄 3.9.24→3.9.25 手機更新正常。 | 已有真實案例證明 active-but-not-controller 是合法狀態，不能把 controllerchange 當唯一成功條件。 |
| V3.9.27，文件 76 | 修正新版 Service Worker 已 active、頁面仍由舊 controller 控制時，等待逾時誤報更新失敗；該發布紀錄未列 Android 實機驗收。 | 這個狀態判斷問題曾再次出現；須區分自動化驗證與實機證據。 |
| V3.10.11／V3.10.12，文件 103、105 | 3.10.11 收斂 stable active replacement、waiting-only SKIP_WAITING、新 document pending-version 確認；原本已明確將 Android 真實跨版本驗收留待下一版。使用者於 2026-11-01 確認 3.10.11→3.10.12 Android PWA 實機更新不再卡住。 | 3.10.12 實機通過是已確認的正向證據，不得再描述成未完成；但該次觀察沒有逐項記錄 Worker lifecycle 值。 |
| V3.11.0，本次回報 | 使用者於 2026-11-13 實機回報由 3.10.12 更新至 3.11.0 時無限等待／重試；關閉重啟後即進入 3.11.0。 | 顯示同類使用者體驗回歸；實際 Worker 狀態與版本載入證據待擷取。 |

#### V3.10.12 至 V3.11.0 程式差異核對

- 比對 `v3.10.12..v3.11.0`：`src/hooks/useAppUpdate.ts` 與 `src/utils/serviceWorkerUpdatePolicy.ts` 沒有差異；`src/components/UpdatePrompt.tsx` 亦沒有差異。
- 本次指定範圍內唯一可見的相關設定差異是 `vite.config.ts` 新增 `process: 'process/browser'` alias；目前沒有證據證明此 alias 會造成 Service Worker handoff 失敗。
- 因此現有證據不支持「V3.11.0 直接修改 PWA handoff 程式而引入回歸」；仍須核對 3.11.0 正式 SW／HTML／Bundle 部署產物、實際載入版本及 Android 當下 Worker 狀態。

#### 目前程式碼的具體待驗疑點

1. `src/hooks/useAppUpdate.ts` 約第 114–136 行，`waitForServiceWorkerHandoff()` 的 active 判斷：
   - `expectedWorkerActivated` 僅接受 `expectedWorker === registration.active`。
   - `replacementActive` 僅在 `expectedWorker === null` 時才接受其他已 activated 的 replacement。
   - 因此若原先捕捉的 waiting Worker A 與最後成為 active 的 Worker B 不同，而 B 已 activated 且已取代舊 controller，兩個條件可能都不成立。這是由目前程式分支直接推得的狀態缺口；故障當下是否真的出現 A／B 不同，仍未知。
2. `src/hooks/useAppUpdate.ts` 約第 452–477 行，建立 12 秒 handoff Promise 後，先 `await updateServiceWorker(false)`，再 await handoff 結果。已唯讀檢查 `node_modules/vite-plugin-pwa/dist/client/build/register.js`：該 API 會等待 register Promise 並呼叫 Workbox `messageSkipWaiting()`，本身不等待 Worker 接管。因此不能把它直接當作已證實根因；仍需確認註冊 Promise、SKIP_WAITING 訊息及 Worker statechange 的實際先後。
3. `waitForServiceWorkerHandoff()` 的 `replacementActive` 分支目前以 `expectedWorker === null` 作為前提，與上列 A／B 身分變動情境需一併核對，不能只增加 timeout 或重試次數。
4. 目前 handoff timeout 僅能在程式執行到 await handoff Promise 後被消費；應檢查所有前置 Promise 是否有終止保證，並確保 UI 在每個失敗路徑均可結束等待、提供恢復方式。
5. 使用者重啟後即能進入新版，與「新版 SW／資產已部署並可冷啟動，但舊 document 的即時 handoff／reload 未完成」一致；這是高相關線索，不等同證明已經取得有效的 active replacement。

#### 綜合判定（截至 2026-11-13）

- **已確認：** 同類型 Android PWA 更新提示循環在 3.9.x 多次出現；3.9.24 的 active-but-not-controller 判斷曾有一個已修復且完成實機回歸的案例；3.10.11 的修正已由使用者在 3.10.12 實機確認有效；3.11.0 再次出現等待／重試循環，而冷啟動可進入 3.11.0。
- **已確認：** `v3.10.12..v3.11.0` 的核心更新 Hook 與 Worker 判斷 helper 未變更；本次不能把問題直接歸因於 3.11.0 對這兩個檔案的修改。
- **高度相關待驗：** Worker A／B 身分變動造成 handoff active 判斷落空；handoff Promise 前置等待的終止性；正式部署 SW／precache／HTML／Bundle 一致性及 Android PWA 實際載入狀態。
- **尚未確認：** 故障當下 `registration.active`、`waiting`、`installing`、`navigator.serviceWorker.controller` 的物件身分與 state；SKIP_WAITING 是否送達正確 Worker；controllerchange 是否觸發；12 秒 timeout 是否實際執行；重新啟動時使用的 bundle／SW 版本。
- 不得把「3.10.12 曾實機通過」推廣成所有 lifecycle 組合均已驗證；也不得因 3.11.0 再發生，就否定 3.10.12 當時的實機成功結果。

#### 下一階段調查順序（仍為唯讀；不等於授權實作）

1. 核對 Git tag `v3.11.0`、main 合併 commit、gh-pages commit、公開 `app-version.json`、`sw.js`、manifest、HTML 與 JS bundle，確認部署產物同一版本且無舊／新資產混用。
2. 對照 `v3.9.24`、`v3.9.27`、`v3.10.11`、`v3.10.12`、`v3.11.0` 的 `useAppUpdate.ts`、Service Worker 設定與專項 regression，製作逐次變更矩陣，找出每次修正實際解決哪個狀態、哪些狀態未被測試。
3. 以可重現的 Worker mock／整合測試覆蓋 expected Worker A 被 Worker B 取代、active replacement 但舊 controller、無 controllerchange、SKIP_WAITING 訊息不完成、registration Promise 不完成、handoff timeout 等情境；測試需驗證 UI 終止等待與不重複下載。
4. 若要取得真實 Android lifecycle，先評估能否唯讀擷取安全且不含使用者資料的狀態快照；不得蒐集 token、Cookie、請求本文或業務資料。
5. 在根因及回歸測試定案前，不修改 `useAppUpdate.ts`、Service Worker 設定、正式部署或版本號；修復方案另經 Product Owner 核准後實作。

#### 操作範圍

- 本次只讀取 Git 歷史、版本紀錄、更新 Hook、helper、回歸腳本與已安裝 Workbox／vite-plugin-pwa 程式碼。
- 未修改 App 程式、測試、設定、瀏覽器、Native Host、OpenChatX MCP 或正式資料；未安裝依賴；未執行正式 T01–T06；未 Commit／Push／部署。

### 2026-11-13 更新完成後改採使用者重新啟動之唯讀可行性驗證

> 驗證目的：評估是否能將目前「下載後等待舊頁面 Worker handoff 並自動 reload」改為「確認新版安裝完成後顯示重新啟動指引，由使用者關閉並重新開啟 PWA」，減少 Android 舊頁面卡在 controllerchange／handoff 的機會。本輪只檢查程式、設定、既有 regression 與 Service Worker API 文件；未修改程式或執行 Android 實機測試。

#### 已確認的專案現況

- `vite.config.ts` 使用 `registerType: 'prompt'`、`workbox.clientsClaim: true`，precache glob 為 `js/css/html/ico/png/svg/json`，排除 `app-version.json`，並啟用 `cleanupOutdatedCaches`。
- `src/hooks/useAppUpdate.ts` 的目前更新步驟為：資料同步 preflight → `registration.update()` → 最長 30 秒等待 `registration.waiting` 或 stable activated replacement → 若 waiting 存在則設定 pending version、送單次 `updateServiceWorker(false)` → 等待 handoff 最長 12 秒 → 舊頁面觸發 reload；失敗顯示可重試訊息。這正是使用者回報停在「等待新版接管…」的 UI 路徑。
- `src/components/UpdatePrompt.tsx` 的階段文字包含「正在下載新版…」「等待新版接管…」，逾時／錯誤時主要按鈕變成「重試更新」。目前沒有「已準備完成，請關閉並重新啟動」的獨立完成狀態。
- 目前 `hasStableActivatedReplacement()` 要求 active worker 已 activated、不同於 previous controller，且 waiting/installing 均為 null；現有 3.10.11 regression 也明確測試 installing、waiting 尚存在時不可提前當成 stable replacement。
- `public/app-version.json` 被排除於 precache，方便版本檢查讀取最新 metadata；新 document 啟動後只有當 pending target version 與 bundle `APP_VERSION` 相同，才會確認更新版本並清除 pending marker。這個「新 document 實際啟動版本」驗證應保留，不能以 Worker installed／activated 取代。
- 既有 `scripts/verify-v31011-pwa-reload-confirmation.mjs` 主要對程式碼結構及 helper 狀態進行 assertion；未模擬完整 Service Worker lifecycle、所有同源 clients 關閉、Android task 關閉或實機離線重新啟動。
- 3.11.0 正式 build 紀錄含 65 個 precache entries（6,723.47 KiB）；此為當時 build 產物統計，不代表這次使用者手機上的下載狀態，也不等於 runtime cache／API／外部資源全數下載。

#### API 語義及可行性界線

- `ServiceWorkerRegistration.waiting` 回傳目前 state 為 `installed` 的 Worker；`updatefound` 只表示 `installing` property 取得新的 Worker。兩者是 lifecycle 訊號，不是「新 document 已經執行目標版本」的證明。參考 MDN：`https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/waiting`、`https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updatefound_event`。
- 在本專案 Workbox precache generateSW 設定下，成功走完 install/precache 才能視為本版本 precache 清單中必要資產已進入該 Worker 的安裝快取流程；仍須另外驗證 install 失敗、cache write/quota、必要資產是否被 glob 收錄，以及部署 HTML／hashed bundle 是否一致。不得把 `registration.update()` Promise resolve、Worker state 為 installed、或單一 metadata version 相同單獨當作完成更新。
- 若不送 `SKIP_WAITING`，waiting Worker 通常要等仍受舊 active Worker 控制的 clients 都關閉，才可自然進入 activation；任何同 scope 的其他 tab／PWA window client 可能使等待持續。使用者滑除 Android 最近使用的 PWA task，不能當成「所有相關 clients 已消失」的保證，必須在實際 Android Chrome／WebAPK 環境驗證。
- 若送出一次 `SKIP_WAITING`，可要求 waiting Worker 提前進入 activation，但不代表舊 document 已由新 Worker 控制；舊頁面與新版 Worker 可短暫並存。對 Travel-Companion，送出前仍須完成同步／編輯保護，且只可發給當下真實的 `registration.waiting`，不可向 `installing` Worker 發送。
- PWA 網頁本身不能可靠強制終止 Chrome／Android WebAPK host process，也不能保證釋放整個程序記憶體。網頁按鈕不應標示為「關閉並重新啟動」並暗示可強制 kill；可以顯示 Android 關閉／重新開啟步驟。從最近使用畫面滑除 task 是使用者端操作，不等於網站能保證 OS process 已退出。

#### 建議採用的驗證目標流程（尚未定案、未實作）

1. 使用者按「馬上更新」後，先執行既有資料同步／未儲存變更保護，並重新取得版本 metadata。
2. 執行 `registration.update()`，觀察 `updatefound`、`installing.statechange`，等待 Worker 成功進入 `installed`／`registration.waiting`，並確認無 installing worker；若 Worker 轉為 redundant、install rejected、等待逾時或離線，明確回報「新版尚未準備好」，不得顯示完成或寫入已更新版本。
3. 對 waiting Worker 採單次、明確的策略：要嘛驗證只保留 waiting 讓使用者關閉所有 clients 後自然 activation；要嘛在資料保護完成後只對當下 `registration.waiting` 送單次 `SKIP_WAITING`，然後停止等待舊頁面 controllerchange。不可把兩種策略混在一起，也不可無限制重試。現階段無法僅靠靜態程式碼決定哪一種在 Android PWA 更可靠，需 PoC 與真機比較。
4. 確認新版已準備好的條件後，舊頁面轉成獨立完成畫面：「新版已下載完成（版本 X），請關閉目前 App，再從桌面圖示重新開啟」。不再顯示「重試更新」作為一般 handoff timeout 的預設動作；提供簡明 Android 關閉指引。這個畫面只能表示「新版 Worker／必要 precache 已準備」，不可宣稱 App 已經在執行新版。
5. 使用者重開後，以新 document 的 `APP_VERSION` 與儲存的 pending target 比對；一致才標記更新成功並清除 pending marker。若仍是舊版，保留診斷資訊，顯示可理解的復原提示；不能盲目再次下載或把舊版錯記為成功。

#### 必要 PoC／驗收矩陣

| 案例 | 狀態／操作 | 必須觀察的結果 |
|---|---|---|
| U1 正常安裝 | 舊版 PWA、單一 client、網路正常 | 新 Worker 完整 installed/waiting；完成畫面只在安裝完成後出現 |
| U2 安裝失敗 | 模擬 precache 資產 404／快取寫入失敗／Worker redundant | 不顯示已準備完成，不寫入成功版本；舊版仍可用 |
| U3 waiting 自然啟用 | 不送 SKIP_WAITING，關閉唯一 PWA client 後重新開啟 | 確認 waiting → activating → activated 的實際時序；新頁面執行目標 APP_VERSION |
| U4 多 clients | 另一個同 scope tab／PWA window 保持開啟 | 驗證 waiting 是否被阻擋；UI 清楚說明需關閉其他視窗，不可假報已更新 |
| U5 單次 SKIP_WAITING | 資料 preflight 完成後對實際 waiting worker 送一次 | Worker 可 activation；舊頁面不等待 controllerchange，重新開啟後新 bundle 版本正確 |
| U6 舊頁仍使用中 | 送 SKIP_WAITING 前後持續操作舊頁面 | 不發生未保存資料遺失、跨版操作或舊頁寫入錯誤；若無法保證，採等待關閉 clients 的保守策略 |
| U7 網路中斷 | 下載／安裝期間斷線 | 不顯示完成；恢復網路後可安全續試，不清理舊版必要快取 |
| U8 重新啟動版本錯誤 | 完成頁顯示 target，但新 document APP_VERSION 仍為舊版 | 不確認成功、不清除 pending marker；提供診斷／恢復路徑 |
| U9 離線冷啟動 | 安裝完成後斷網，關閉再重開 | 若 precache 涵蓋必要 shell，應可啟動目標版本；遠端資料功能按既有離線政策顯示狀態 |
| U10 Android task／程序 | Android 安裝型 PWA，分別正常返回、關閉視窗、最近使用畫面滑除再開啟 | 記錄實際 client 與 Worker lifecycle；不得把 task 滑除等同 process 一定被 kill |

#### 階段性結論

- **可行：** 將「舊頁面 handoff／自動 reload」由必要成功條件降為非必要，改為「新版安裝成功 → 完成頁 → 使用者關閉並重新啟動 → 新 document APP_VERSION 確認」。此方案可避開舊頁面長時間輪詢 controllerchange 的問題。
- **不能直接宣稱已解決：** 手動重啟不會自動保證 waiting Worker 啟用；多 clients 可能阻擋自然 activation，SKIP_WAITING 又需要驗證舊頁安全性。Android 滑除 task 亦不保證程序記憶體已釋放。
- **成功判定分級：** (A) Worker 安裝／precache 完成＝「新版已準備」；(B) Worker activated＝「新版 Worker 已啟用」；(C) 新 document 回報 `APP_VERSION === targetVersion`＝「App 已完成更新」。產品 UI 在 A 階段只能顯示「請重新啟動」，最終成功只在 C 階段成立。
- **目前驗證結果：架構可行性初步通過；Service Worker 多 client lifecycle 與 Android 實機可靠性尚未通過。** 尚不能核准替換正式流程，下一步應先建立隔離 PoC 與 U1–U10 驗收，再決定保留 waiting 或單次 SKIP_WAITING 策略。

#### 本次操作範圍

- 唯讀檢查 `vite.config.ts`、`src/hooks/useAppUpdate.ts`、`src/components/UpdatePrompt.tsx`、`src/utils/serviceWorkerUpdatePolicy.ts`、`scripts/verify-v31011-pwa-reload-confirmation.mjs`、文件 103／108／110 與既有 V3.11.0 build 記錄。
- 查閱 MDN `ServiceWorkerRegistration.waiting` 與 `updatefound` 官方 API 說明；本次未連接使用者 Android 手機、未取得真實 Worker snapshot。
- 未修改 App 程式、測試、設定或正式資料；未安裝依賴、未 build、未 deploy、未 commit／push。僅追加本文件驗證紀錄。

## 16. 2026-11-13 PWA 更新改採接管後自動刷新實作紀錄

### 目標與範圍

- 使用者決定不要求手動關閉／重啟 PWA，改為新版 Service Worker 確實接管目前頁面後，由 App 自動重新載入。
- 僅調整更新流程及其回歸檢查，不變更版本號、PWA precache 設定、部署流程或資料同步邏輯。

### 實作內容

1. 保留資料同步 preflight、`registration.update()`、等待 Worker 完整安裝及只對實際 `registration.waiting` 發送一次 `SKIP_WAITING`。
2. handoff 成功條件收斂為：`navigator.serviceWorker.controller` 必須與本次捕捉的 `expectedWorker` 是同一個物件，且其 state 為 `activated`、`registration.active` 亦指向該 Worker。只看到 Worker `activated` 不足以觸發 reload。
3. 收到確認接管後才記錄 pending target，執行一次 `window.location.reload()`；不以一般 HTTP 快取清除或 `reload(true)` 作為更新手段。
4. handoff 最長等待 15 秒。逾時時保留 pending target、顯示可理解的錯誤與重新開啟 App 指引，不自動重複刷新或重新下載。
5. 以 `localStorage` 記錄每個 target version 的自動刷新嘗試；同一版本若已刷新過仍未成功，不再自動刷新，以避免更新迴圈。新 document 啟動時，只有 `APP_VERSION` 與 pending target 完全一致才確認成功並清除 pending／reload attempt；若版本不符，保留標記及 console 診斷。
6. 更新 `scripts/verify-v31011-pwa-reload-confirmation.mjs`，檢查指定 Worker 接管判斷、單次刷新、版本防迴圈及新 document 版本確認。

### 驗證狀態

- `scripts/verify-v31011-pwa-reload-confirmation.mjs`：通過（Node `v22.23.2`、npm `10.9.8`）。
- 尚未完成 TypeScript app/node 檢查、完整 `npm run build`、Android PWA 真機更新測試及多 client 實測；不能因此宣稱正式問題已完全解決。
- 未部署、未 commit／push。

### 風險與後續驗收

- `window.location.reload()` 仍會由瀏覽器正常導覽流程載入頁面；是否在 Android Chrome／WebAPK 每次都由已確認的新 Worker 提供 HTML 與 assets，仍須真機驗證。
- 必須測試單一 PWA client、多個同 scope clients、Worker install 失敗、網路中斷、版本 metadata 與 bundle 不一致、離線冷啟動，以及刷新後仍執行舊 bundle 的防迴圈行為。
- 本次只做本機實作與測試，未執行正式部署。
