# DEV 安全阻擋與天氣來源問題診斷

> 建立日期：2026-10-18
> 最新更新：2026-10-22
> 狀態：原始碼與相關修正已部署；本文件保留診斷證據。正式行程端到端驗收與 Supabase Advisor 安全審查尚未全部結案，未完成項目由《[09_待辦事項_TODO](09_待辦事項_TODO.md)》追蹤。

## 五、目前進度與後續步驟

### 已完成

- DEV 非 loopback Supabase URL 硬阻擋，避免測試帳號或測試資料誤連正式資料庫。
- Open-Meteo 查詢來源 URL、座標、日期與時區的保存／生成契約；舊快取缺欄位時不提供誤導性首頁連結。
- 天氣來源選單的窄螢幕 viewport 限制與換行。
- lease 回寫要求 RPC 明確回傳 `true`；同一 token 即使短 lease 已到期仍可完成安全回寫，token 不同時拒絕覆寫。
- 已透過 Supabase SQL Editor 唯讀查明最新 Trip 的士林 D1／D2／D3 差異；沒有執行正式資料寫入。
- 已通過天氣靜態契約、TypeScript、完整 production build、PWA 與瀏覽器安全檢查。

### 部署後續與待驗證

1. 已完成正式 migration、`weather-forecast` Edge Function 與前端部署；未直接套用整份 `db diff`。
2. 既有正式快取仍可能缺少 `source_url`；需在登入正式網站後重新載入行程，確認成功取得的新資料會保存實際查詢網址。
3. 以正式環境真實行程做單卡與跨日複製驗收；確認來源連結包含正確座標與日期，並確認舊快取 fallback 不再連到無關首頁。
4. 若仍發生 unavailable，依 `diagnostic_code`／`trace_id` 與 Edge Logs 追查，不以重複操作成功取代證據。

未經明確授權，不執行新的正式 migration、Edge Function 部署、Git tag、release 或 production smoke 寫入。

## 一、DEV 資料庫安全硬阻擋

DEV 模式不得連線正式 Supabase。`src/App.tsx` 在建立 Supabase client 前檢查 `VITE_SUPABASE_URL`：只有 `localhost`、`127.0.0.0/8` 或 `::1` 允許繼續；其他主機、空值或格式無法解析時，DEV 直接顯示「DEV 已停止」，不建立 client，也不執行登入、讀取或寫入。

因此，下載專案的人即使在 DEV 介面建立測試帳號，也只能使用自己的本機 Supabase；不會因為 DEV 啟動而取得本專案正式資料庫的連線能力。仍須遵守：`.env.local` 不提交、正式 anon key 不放入 repository、正式資料庫 credentials 不提供給本機測試。

後續除錯若看到「DEV 已停止」，先將 `VITE_SUPABASE_URL` 改為本機 Supabase URL，例如 `http://127.0.0.1:54321`，並確認 Docker／本機 Supabase 已啟動；不可用修改程式或關閉檢查的方式繞過。

## 二、Open-Meteo 來源連結契約

新取得的天氣結果必須保存 `source_url`，並同時保存 `latitude`、`longitude`、`forecast_date` 與 `timezone`。來源連結使用 Open-Meteo 文件頁的查詢參數還原當次查詢位置與日期，而不是固定連到首頁；Open-Meteo 文件頁支援以 API URL 還原查詢設定（參考：[Open-Meteo Weather Forecast API docs](https://open-meteo.com/en/docs)）。

舊 localStorage／資料庫快取若缺少 `source_url` 與有效座標，不得猜測地點，也不得顯示會讓人誤認為已定位的首頁連結；UI 顯示「舊快取缺少查詢位置，重新取得後可開啟實際查詢頁」。`CC BY 4.0` 授權標示維持保留。

`20261018100000_v3101_weather_source_url.sql` 已於 2026-10-18 套用至正式資料庫；既有正式快取不會自動補上 `source_url`，須在下次成功重新取得天氣後才會具備可追溯來源。正式 migration ledger 的實際版本為 `20261018085239_v3101_weather_source_url.sql`。

### Drizz.li 地名頁（評估完成、尚未實作）

Drizz.li URL 必須以獨立欄位／快取保存，不能寫入 `weather_daily_forecasts.source_url`；該欄位的正式資料庫 constraint 僅允許 Open-Meteo 文件網址。沒有距離不超過 1,000 公尺的合格地名候選時，維持原有 Open-Meteo 來源連結，不退回只有座標的 Drizz.li 頁。正式 schema／migration 檢查、公開 API 與頁面測試及後續待辦見《[94_Drizzli_地名天氣連結評估與測試紀錄](94_Drizzli_地名天氣連結評估與測試紀錄.md)》。本項尚未修改程式或正式環境。

### Weather.com 外部地點連結（評估已終止，尚未實作）

Weather.com 的 API 方案不符合本專案「排除固定費用或僅限期試用」的硬性條件：官方定價列出受企業資格限制的 30 天試用與 Standard 年約 USD 500／月，因此不採用 API／自動化地點解析。公開頁測試找到士林與京都具名預報頁，但直接拼接地名 URL 會 404，座標 URL 會導向行政區頁；中文景點、同名地點與一般 Chrome 清除 Cookie／跨地區重開未完整驗證。條款對個人非商業用途及未授權自動化有約束，純外部連結在 Travel-Companion 使用情境的授權未確認。完整證據見《[98_Weather.com_外部天氣連結可行性評估](98_Weather.com_外部天氣連結可行性評估.md)》。使用者已於 2026-10-20 指示終止圖形化天氣評估，因此本項不再補測或推進；沒有合格外部具名頁時維持 Open-Meteo 來源連結。

## 三、來源選單排版

來源選單改為 `w-72 max-w-[calc(100vw-2rem)]`、可換行，窄螢幕由左側展開，寬螢幕仍靠右對齊，避免超出 viewport。若後續變更卡片容器，須保留同等的 viewport 限制。

## 四、V3.10.6 跨日天氣異常調查狀態

使用者回報：新增地點於第 1 天無法取得天氣，複製到第 2 天成功，第 3 天又失敗。現有程式已保存 `day_number`、`forecast_date`、`card_id`、`place_id` 及安全 `diagnostic_code`，可區分卡片不存在、日期不一致、座標、Open-Meteo、租約及快取階段；但本次工作階段無法讀取最新即時資料庫：`.env.local` 指向 localhost，而本機 Docker daemon 未啟動，Supabase CLI 亦因 telemetry 暫存檔權限錯誤未能取得 status。

2026-10-18 透過正式 Supabase 唯讀查詢確認最新 Trip：士林 D1／D3 的天氣列曾有 `source = Open-Meteo`、`model = best_match` 與 `last_refresh_attempt_at`，但 `weather_code`、`fetched_at`、`last_refresh_error` 均為空；D2 有完整成功資料。進一步查到 D1／D3 當時仍持有短期 lease，之後租約到期並被 purge 清除。根因是 Edge Function 只檢查 lease release RPC 的 `error`，沒有檢查函式回傳的 `false`；而 release RPC 又要求 lease 尚未到期，導致回寫未命中時留下空白占位列。已在原始碼修正：成功回寫必須收到 `true`，失敗回寫也記錄 RPC false，並讓相同 token 的 release 不因 lease 已到期而無法清理／完成；token 不同時仍不會覆寫新的租約。

因此目前不能把 Day 1／Day 3 判定為同一個根因，也不能用歷史 dump 冒充最新資料。下一次診斷必須在本機 Supabase 啟動後，唯讀比對：

1. Trip JSON 中三張卡片的 `id`、`day_number`、`place_id`、`showWeather` 與日期。
2. `weather_daily_forecasts` 的 `(place_id, forecast_date)`、座標、狀態、`last_error` 與租約欄位。
3. 前端回應的 `diagnostic_code`／`trace_id` 與 Edge Function 對應紀錄。

不得以重新複製一次成功，取代上述證據；也不得為了查詢而寫入正式資料或修改使用者行程。

## 五、Supabase Advisor 安全提醒（待後續安全掃描再審查）

2026-10-18 正式 Supabase Advisor 掃描發現下列既存提醒。這些項目不是本次 Open-Meteo 來源網址、天氣快取租約或 DEV 硬阻擋修正的必要阻擋項，因此本次只記錄，不直接修改正式權限或資料庫結構。

- `public.weather_daily_forecasts`、`public.weather_place_coordinates`：RLS 已啟用但沒有政策。需先確認前端是否只能透過 Edge Function／service role 存取，再決定是否建立最小權限政策；不可為了消除警示而直接開放資料。
- 三個既有 `SECURITY DEFINER` 函式仍可由 `authenticated` 執行：`tc_delete_trip`、`tc_read_trip_participant_email_map`、`tc_schedule_storage_deletion`。後續需逐一檢查呼叫邊界、資料範圍與 `EXECUTE` 權限。
- `pg_net` 位於 `public` schema：需評估是否能移至非公開 schema，並確認既有排程／HTTP 呼叫不受影響。
- Supabase Auth 的洩漏密碼防護尚未啟用：後續應評估啟用時機、現有登入流程與使用者影響。

下次安全掃描或 Supabase Advisor 複查時，必須重新取得最新結果，逐項標註「仍存在／已修正／接受風險／需要設計決策」，不可直接沿用本次快照。未完成審查前，不得宣稱上述警示已解決。
