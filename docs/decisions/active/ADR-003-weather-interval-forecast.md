# ADR-003：行程卡片時間區段天氣預報（Interval V1）

- **ID：** ADR-003
- **狀態：** Accepted／Implementation Completed（V1 A–C PASS；納入 V3.11.7 發布候選）
- **決策基準：** 產品顯示與卡片時間規則依 2026-11-14 已定案規格；時間契約、逐卡資格及引用規則依 2026-11-17 決策；低使用量併發與 V1 驗收範圍依 2026-11-18 決策。
- **記錄日期：** 2026-11-26
- **技術規格：** [docs/79_天氣預報功能規格草案.md](../../79_天氣預報功能規格草案.md) §2.7
- **目前唯一執行進度紀錄：** [docs/112_區段預報P0技術驗證與實作前檢查紀錄.md](../../112_區段預報P0技術驗證與實作前檢查紀錄.md) §7.3–§7.4
- **專案狀態入口：** [docs/14_專案現況總覽.md](../../14_專案現況總覽.md)；待辦清單：[docs/09_待辦事項_TODO.md](../../09_待辦事項_TODO.md)

## 決策目的

在每日行程卡片中，依卡片已儲存的到達／離開時間顯示符合該卡片活動時段的天氣摘要。維持既有 Daily 天氣功能與保存契約，不建立逐小時天氣 UI 或另一套天氣子系統。

本 ADR 將已定案的產品規則、時間／資料契約、架構邊界及 V1 驗收門檻集中為持續有效的工程決策。文件 79 保存完整技術／產品規格；文件 112 保存實際實作證據與逐輪進度。本 ADR 不複製兩份權威文件的逐行細節。

## 已核准的產品與資料契約

### 1. 卡片預報模式

預報模式由伺服器依已授權讀取的 Trip 卡片已儲存時間欄位推導，不新增卡片欄位或使用者模式設定：

- **Daily：** 到達與離開時間皆未設定，沿用整天預報。
- **單一到達小時：** 有到達時間，離開時間依既有卡片儲存規則沿用到達時間；只計算該到達小時。
- **Interval：** 到達與離開時間均有效且不同；計算兩者所涵蓋的區段摘要。

區段起始及結束小時均包含；忽略分鐘及秒數，只保留目的地當地小時。例：08:30–12:30 包含 08、09、10、11、12；08:00–08:00 只包含 08。主畫面只呈現一組摘要（代表天氣狀況、最高／最低溫、最高降雨機率及既有提醒），不提供逐小時列表、時間軸或 hourly 原始資料。

### 2. 時間與權威資料

- 目的地 IANA timezone 是日期與時段計算依據，不使用裝置時區或固定 UTC offset 代替。
- 以目的地當地日期的 00:00 與隔日 00:00 換算 UTC epoch，對上游請求使用 UTC hour window；回應以半開區間 [start_epoch, end_epoch) 過濾 API inclusive end sample。
- 必須正確涵蓋 DST 一般日 24 小時、春季 23 小時及秋季 25 小時；秋季重複當地小時以不同 Unix epoch 保留兩筆，春季不存在的小時不得補造。缺少必要樣本或 payload 不完整時 fail closed，不產生不完整的完整區段摘要。
- 前端傳送的 arrival_time／departure_time 僅作候選快照及一致性核對；Edge Function 重新讀取已授權、已儲存的卡片，以 card.time 與 card.departureTime（舊資料缺欄時 fallback 至 card.time）為權威。Client 時間、forecast type 或時間窗不得覆蓋 server stored data。
- Request fingerprint 必須反映到達時間、正規化離開時間及推導模式；時間變更後不可沿用舊區段摘要。

### 3. 更新資格與快取共用

- APP 與 Interval Cron 以每張已授權、已儲存卡片獨立判斷更新資格；不建立跨 Trip 或同一 Trip 多卡片的資格 OR，不新增跨 Trip 查詢、引用計數、專用 RPC 或代表卡片。
- 有到達時間的卡片，於景點當地到達時間當下及之後停止新的更新；沒有到達時間的卡片，整個景點當地行程日仍可更新，當地日期進入隔天才停止。離開時間不延長更新資格。
- 資格判斷與快取共用分開處理：相同 (place_id, forecast_date) 可共用一筆 Interval 原始 hourly 快取及 Lease；相同 Place ID 的不同 forecast_date 必須分開。
- Interval 獨立使用 weather_interval_forecasts，主鍵為 (place_id, forecast_date)；Daily weather_daily_forecasts 與 Interval cache／Lease／失敗狀態分開維護。
- 成功 fetched_at 起算：24 小時內 fresh、24–48 小時 stale、48 小時失效。更新失敗只更新失敗／嘗試資訊，不得覆蓋最後成功的 hourly payload 或重設 fetched_at。停止刷新不提前刪除仍有效快取，也不得延長 TTL；目的地當地預報日期已過、座標變更等既有失效條件仍適用。
- 座標更新須在同一交易清除對應 Interval cache；舊請求成功回寫前須再次驗證座標與 Lease token。Interval purge 沿用既有每小時清理入口。

### 4. 架構、安全及前端邊界

- 沿用既有 weather-forecast Edge Function、APP 開啟檢查與每 6 小時 Cron；不新增第二個 Edge Function 或第二個 Cron。
- Interval table 啟用 RLS；一般 client 不可讀取 raw hourly JSONB。Edge 依窄權限 RPC／既有授權流程管理 Lease 與資料寫入，服務角色權限維持最小必要。
- Hourly 原始資料只供 Edge Function 計算／快取，不回傳前端、不保存 LocalStorage，也不轉成每小時多筆資料。Edge 依每張卡片自己的時間窗計算摘要，回傳該卡片的 forecast type、區段 metadata、摘要與既有狀態／來源資訊。
- 前端只保存每張卡片的摘要與必要 metadata；沿用既有 weather UI、圖示、溫度、降雨機率與提醒 helper。使用者變更時間後，摘要必須符合目前的地點、日期、模式與時間窗，否則不可顯示舊時段結果。
- Daily table、RPC、response、UI 摘要及既有資格 helper 保持既有行為；不得為 Interval 改寫 Daily 契約。

## 併發政策與 V1 驗收界線

### 1. 已定案的使用規模與保護目標

依 2026-11-18 決策，預期最多 4 位使用者，平常最多 2 人同時使用。接受偶發少量重複 provider request，不追求 exactly-once 或理論上的零重複外部呼叫。

保留現有 Daily／Interval Database Lease；必要保護聚焦於資料正確性、Lease token ownership、成功／失敗路徑的 Lease 清理、失敗恢復，以及舊成功快取不被破壞。若目前 Lease 已提供單一 writer 保護，不額外建立分散式鎖、複雜去重、使用者限流或監控子系統。

### 2. 不納入 Interval V1 的工作

以下不是 V1 發布停止線，不得重新加回目前待辦：

- 跨 Edge Isolate 壓力測試、零重複 provider request 證明或大型競爭測試框架。
- 完整 Daily golden matrix；只對本次實際修改到的 Daily／共用路徑做必要的最小回歸。
- CPU／wall-time 基準、批次效能基準，以及正式 DB row／index／TOAST／查詢成本全面量測。只有出現可重現的效能、資料或儲存問題時，才依案例最小量測。
- 新天氣供應商、逐小時 UI、每小時獨立資料列、手動更新按鈕、第二個 Cron／Edge Function、卡片關聯表、引用計數器或其他未定案 hourly 指標。
- 為假想情境擴建新架構、額外資料表、通用框架或非必要的 instrumentation。

## 目前實作進度（截至 2026-11-26）

### 已完成並有證據

以下狀態以文件 112 §7.4 的現行清單為準；文件 112 較早章節所保留的「尚未接通」描述是歷史快照，不可取代 §7.4。

- 前後端卡片時間契約、departure time snapshot、request fingerprint 與 server-stored candidate 驗證已接通。
- IANA local-midnight → UTC epoch、UTC half-open window、23／24／25 小時 DST、hourly payload validation 及區段摘要核心已建立並接入。
- Interval schema／本機 migration、RLS、窄權限 RPC、Lease claim／release／mark-scheduled 已實作；座標變更同交易清除及既有每小時 purge 已接通。
- APP／Cron Interval 分支、逐卡資格判斷、相同 (place_id, forecast_date) 目標快取共用及 per-card Edge summary response 已接通。
- 前端 WeatherForecastItem 區段 metadata、時間改變後摘要相容性及單一摘要 UI 接線已完成；hourly raw list 不下傳。
- Deno check／Edge runtime tests（21/21）、Interval summary／timezone／既有 weather regression、前端 TypeScript／ESLint、完整 production build、PWA／browser-security／weather bundle checks 已有 PASS 證據。
- 本機 Interval migration、SQL regression、transactional rollback rehearsal、RLS／RPC 權限與 catalog 檢查、purge／TTL／座標失效測試已有 PASS 證據。這些僅是本機證據，不代表已套用正式 Supabase。
- 未執行遠端 migration、正式 DB 寫入、Edge Function 部署、Secrets／Cron 修改或正式發布。

### V1 必要收尾 A–C（全數 PASS；2026-11-26）

A／B／C 已依各自驗收範圍完成，證據集中於文件 112 §7.4；不重跑已通過項目。

**A — PASS（2026-11-26；執行證據見文件 112 §7.4）**

最小資料保護驗證範圍：

1. 確認 Daily 與 Interval 的失敗路徑都能清理自身 Lease。
2. 確認錯誤／過期 token 不會釋放或覆寫其他持有者的 Lease。
3. 確認更新失敗不覆蓋最後成功 payload／fetched_at。
4. 確認過期 placeholder 可恢復刷新。
5. Interval PostgreSQL 12 路 claim race 已有證據；Daily 僅需核對其既有 SQL／RPC 是否已覆蓋上述必要條件，不做 12 路競爭或完整 golden matrix。

**B — PASS（2026-11-26；執行證據及測試 fixture 偏差見文件 112 §7.4）**

驗收契約：正常授權 Session、Open-Meteo outbound、本機 Edge／Supabase；使用隔離測試資料完成 APP → Edge → 本機 DB refresh，核對 hourly payload、Lease 收斂及 APP 單一區段摘要。未繞過 RLS、未切換正式環境；本次以既有合成 Trip／Place、新 forecast_date 完成隔離，未新建 Place ID，偏差詳見文件 112 §7.4。

**C — 自動化操作與生命週期驗證（PASS；2026-11-26，證據見文件 112 §7.4）**

以隔離本機測試資料庫及已登入的本機測試瀏覽器執行自動化驗證，聚焦功能狀態與資料／請求證據，不以人工肉眼逐項巡檢作為主要驗收方式：

1. 驗證區段預報請求觸發、載入至完成／失敗的狀態轉換，以及 APP、Edge、DB 的結果一致性。
2. 驗證刷新期間 Lease claim／release、重複請求防護及完成後 Lease 收斂；沿用既有 A／B 證據，不重跑 A／B 測試。
3. 驗證失敗狀態及既有重試／恢復行為，不清除 failure marker、不繞過 cooldown、不操作遠端正式環境。
4. 自動擷取並檢查 Console、Network、DOM／可見摘要及本機 DB 狀態；只確認單一摘要，不出現 hourly list。
5. 對測試卡片時間變更後的摘要失效／重新計算，以可重現的自動化操作及狀態證據驗證；不得把靜態程式碼檢查當作執行驗收。

**部署後回歸（不阻擋目前 V1 開放進度）**

Android PWA standalone 啟動／顯示相容性，以及 Android 實際操作與生命週期相容性，移至部署後回歸測試。桌面瀏覽器或 User-Agent 模擬不得宣稱已完成 Android 實機驗收；部署後若無 Android 裝置，仍須明確標示未驗證。

完成 A–C 後才進入一般 RC 驗收。遠端 migration、Edge deploy、Secrets／Cron、正式資料 smoke、Git 發布及部署均不是本 ADR 的自動授權，須按各自流程另行明確授權。

## 後續執行順序與交接

1. A 已 PASS；Daily 與 Interval 的已覆蓋證據分清，不重跑 Interval 12 路 claim race。
2. B 已 PASS；不重跑完整 APP smoke。驗收證據及 fixture 偏差見文件 112 §7.4。
3. 目前只剩 C：完成本 ADR 定義的自動化操作與生命週期驗證；Android standalone／實機操作相容性移至部署後回歸，不作為目前 V1 closeout gate。
4. A–C 全部 PASS 後，才整理一般 RC；遠端／正式操作仍逐項授權。Android 部署後回歸結果須另行記錄，不得以桌面模擬代替實機證據。
5. 每輪工作只更新文件 112 §7 的現行階段紀錄及 docs/decisions/README.md；文件 79 保持產品／技術契約單一權威，不複製階段日誌。

**跨對話續行：** 新對話先讀 docs/decisions/README.md、本 ADR 及文件 112 §7.3–§7.4；直接從第一個未完成的 A／B／C 切片接續。不得重做已有 PASS 的實作或測試，不得把歷史章節的舊快照誤當現況，也不得把一般 RC／正式環境操作視為已授權。
