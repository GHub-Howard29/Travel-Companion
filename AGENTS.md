# Codex 協作指示

- 使用中文撰寫 commit 訊息。
- 未經明確指示，不自動 commit 或 push。
- 在重要結論、規劃或實作前，先檢查需求、前提、限制與可驗證證據；簡單且低風險的請求採相稱深度，不必為形式而展開冗長分析。
- 若發現邏輯缺口、互相衝突的條件、未經證實的假設或可能影響結果的認知偏差，應直接說明具體證據、影響與可執行的改善方式。若差異會實質改變結果且無法安全推定，再請使用者決定。
- 不因迎合而隱瞞問題，也不為反對而反對；在安全、授權與既定範圍內，仍應忠實執行使用者的明確要求。
- 清楚區分已確認事實、合理推論、建議方案與尚未完成的驗證，不把未測試或未發布的結果描述成已完成。

# 每次開始工作前：Git 與 Supabase 核對
- 每次開始任何專案任務，先在專案根目錄檢查 `git status --short --branch`、目前分支與 upstream；再執行 `git fetch origin`，確認本機與遠端差異。不得因任務看似只改文件就跳過。
- 若工作目錄乾淨、目前分支是 `develop`，且遠端只有可安全 fast-forward 的新提交，允許直接執行 `git pull --ff-only origin develop`，然後確認最新 commit 與工作目錄狀態。
- 若工作目錄有任何未提交修改、untracked 檔案、分支不是 `develop`、沒有 upstream、或本機與遠端分歧，禁止自動切分支、stash、覆寫或 reset；保留現況並回報差異，先處理安全同步方案。
- Git pull 只同步檔案，不代表 Supabase 本機資料庫已同步。若任務涉及資料庫或 migration，另行檢查 `npx supabase status` 與 `npx supabase migration list --local`；確認 Docker／本機 Supabase 正常後，檢視所有待套用 migration SQL，再決定是否執行 `npx supabase migration up --local`。
- 套用可能刪除／重建資料、改變欄位型別或主鍵、刪欄位／索引、改寫資料、影響附件關聯的 migration 前，必須先建立可辨識且可還原的本機資料備份，並確認備份檔存在且非空。若無法可靠備份、無法確認還原方式，或 migration 會影響 Supabase Storage 物件，先停止並回報，不得冒險執行。一般純新增且不破壞既有資料的 migration 仍須先檢視 SQL 與驗證條件。
- 不得自動執行 `db reset`、刪除 Docker volume、`migration repair`、`db push --linked` 或其他正式環境寫入操作；正式 Supabase 的部署、資料修復或其他不可逆操作必須先取得使用者明確核准。
- 同步或 migration 失敗時，保存完整錯誤訊息與當下 Git／migration 狀態；不要反覆重試可能有副作用的命令，也不要為了讓狀態看起來一致而略過檢查。

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
