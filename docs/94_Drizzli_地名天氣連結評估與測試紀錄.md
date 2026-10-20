# Drizz.li 地名天氣連結評估與測試紀錄

> 評估日期：2026-10-20
> 狀態：**本輪評估紀錄已封存；依使用者指示終止圖形化方案評估，尚未實作且不再追蹤後續驗證**
> 決策依據：使用者定案——正式資料庫獨立欄位／快取；無合格地名頁時保留 Open-Meteo；配對只以直線距離不超過 1,000 公尺為門檻。
> 範圍：唯讀檢查 schema、migration、既有前後端資料契約，並測試 Open-Meteo Geocoding API 與 Drizz.li 頁面。評估期間未修改程式、migration、正式資料或設定，未部署；其後依使用者要求將天氣相關文件彙整後提交，不包含程式或部署。

## 一、已定案規則

1. **優先顯示地名頁**：成功找到合格候選時，外部預報連結指向 Drizz.li 地名頁，頁面須能顯示地名而非只有經緯度。
2. **唯一配對門檻**：以天氣原始座標與 Geocoding 候選座標計算直線距離；距離 ≤ 1,000 m 即通過。不得再把名稱、國家或行政區一致性設為必要門檻。
3. **候選選擇**：若多個候選都在 1,000 m 內，選距離最近者；若沒有候選、查詢失敗或最近候選超過 1,000 m，視為沒有合格地名頁。
4. **安全 fallback**：沒有合格 Drizz.li 地名頁時，保留現有 Open-Meteo 來源連結；不得退回只有座標的 Drizz.li 頁，也不得自行猜測地名。
5. **來源網址分離**：source_url 永遠只保存 Open-Meteo 文件查詢網址；Drizz.li URL 必須另存，不能覆寫或放入 source_url。
6. **不擴大功能範圍**：不變更天氣預報取得、排程、快取有效期、更新租約、提醒、權限或其他行程行為；不新增付費 API。

## 二、現有程式與資料契約檢查

### 前端與天氣快取

- src/types/trip.ts：ItineraryItem 有 title、location、place?.placeId、showWeather；沒有 Drizz.li 專用欄位。行程編輯介面將 location 標示為「地圖地點」，變更該文字會清除已確認的 Place ID。
- src/services/weatherForecastService.ts：WeatherForecastItem 已含 latitude、longitude、forecast_date、source_url；getOpenMeteoSourceUrl() 先使用可信任的 Open-Meteo URL，否則依有效座標及日期生成查詢網址。天氣結果 localStorage 快取只屬於目前瀏覽器，不可當作跨裝置持久化方案。
- src/components/ItineraryPage.tsx：目前來源選單只顯示「Open-Meteo 天氣資料」連結；缺少可還原查詢位置的舊快取會顯示 fallback 提示。未發現 Drizz.li 顯示或保存邏輯。
- scripts/verify-v3101-weather-forecast.mjs：現有驗證涵蓋 Open-Meteo source URL 與 Edge Function 回應契約，尚未涵蓋 Drizz.li URL、距離門檻、多候選或 fallback。

### 正式 Supabase schema（2026-10-20 唯讀查詢）

- public.weather_daily_forecasts 主鍵為 (place_id, forecast_date)，現有 source_url 檢查約束只允許 https://open-meteo.com/en/docs% 開頭；目前已有可為空的 latitude／longitude 欄位及座標配對約束。
- 預報快取清理會清除超過 48 小時的預報列，因此**不適合把 Drizz.li URL 只加在每日預報列**：會重複保存，也可能隨預報列清理而失去連結。
- public.weather_place_coordinates 主鍵為 place_id，現有 latitude、longitude、fetched_at、expires_at、status 等欄位；未發現 Drizz.li URL 或配對資訊欄位。座標超過 30 天後，清理流程會清空座標及其取得／到期狀態，但保留該 Place ID 的資料列。
- 上述兩張表均啟用 RLS；目前正式 schema 沒有對應 RLS policy，現有設計依賴後端 Edge Function／service role 路徑，不應為了新連結而開放瀏覽器直接讀寫。
- 正式 migration ledger 包含 20261018085239_v3101_weather_source_url 與 20261019180000_v3107_weather_release_precision_fix。遠端實際 source URL migration 版本為 20261018085239；不可因文件中的舊本地版本號而新增重複 migration。
- **結論**：目前沒有可直接重用的 Drizz.li 專用欄位。首選評估方向是為現有 public.weather_place_coordinates 增加獨立的 Drizz.li 快取欄位，而非使用 weather_daily_forecasts.source_url 或把網址塞進每日預報列。實作前仍須定義座標刷新／到期時的快取失效規則，並確認 migration 對本機與正式 migration ledger 的一致性。若無法安全處理快取生命週期，再比較獨立表方案；本文件不預先建立 migration。

建議最小快取資料：Drizz.li URL、配對距離（公尺）、候選座標及最後驗證時間。座標快取失效或更新時，應一併使 Drizz.li 配對結果失效，避免舊 URL 被當成仍經驗證。精確欄位名稱與是否需要額外欄位，留待實作前 schema review 定案。

## 三、外部查詢與頁面測試

以下為 2026-10-20 對公開端點的唯讀測試；它們不會修改 Travel-Companion 資料。

| 測試 | 結果 | 判讀 |
|---|---|---|
| Open-Meteo Geocoding：Shilin ID 1669369 | HTTP 200；回傳 Shilin、Taiwan、Taipei City，座標 25.09071, 121.52259 | 可取得 ID-backed 地名候選 |
| 士林測試座標 25.0885, 121.5244 與上述候選距離 | 約 **306 m** | 通過 ≤ 1,000 m 門檻 |
| Geocoding 搜尋 Kyoto | HTTP 200；結果包含日本 Kyoto，也包含坦尚尼亞等其他同名／近似結果 | 不可直接使用第一筆；應計算各候選距離，選最近且在門檻內者 |
| Geocoding 搜尋 Tokyo | HTTP 200；結果包含日本 Tokyo，也有其他國家的同名結果 | 支持以距離門檻選擇候選，而非依搜尋順位 |
| Geocoding 搜尋中文「士林夜市」「京都站」 | HTTP 200，但沒有候選結果 | 中文景點名可能無法直接匹配；此時必須 fallback，不應為了提高命中率引入未核准的翻譯 API |
| Geocoding 搜尋英文「Shilin Night Market」「Kyoto Station」 | HTTP 200，但沒有候選結果 | API 主要提供地名／聚落候選，未必收錄具體景點或車站 |
| Drizz.li 東京地名頁 /en/weather/week/tokyo/?day=2026-10-20 | HTTP 200；頁面顯示 Tokyo、Japan，且可讀取逐日預報與逐時資料 | 地名頁基本路徑可用，符合「顯示地名」要求 |
| Drizz.li 士林 ID 路徑 /en/weather/week/shilin_1669369/?day=2026-10-20 | 取回內容顯示 Shilin、Taiwan 與地名標題，但 fetch 工具回報 HTTP 404，圖表內容停在 Loading | **部分通過／尚未確認**：頁面內容有地名，但需以一般瀏覽器實際開啟確認狀態、預報是否完整載入；不能把此項記成完全通過 |
| Drizz.li 座標路徑 /en/weather/week/25.0885N121.5244E/?day=2026-10-20 | 顯示座標標題，沒有地名 | 不符合需求，不可作為成功 fallback |
| 僅使用地名 slug、不帶候選 ID | 已觀察到同名地點可能導向其他國家／地區 | 建立網址須遵循 Drizz.li 的地名路由規則，不能只把使用者輸入直接轉成 slug；ID-backed 路徑仍須實機驗證 |

### 測試結論

- **距離演算法可行**，士林候選實測約 306 m，低於 1 km。
- Geocoding API 的搜尋命中率是主要限制，尤其中文景點名稱；「查不到」應正常回退 Open-Meteo，而不是新增複雜的翻譯或多來源搜尋流程。
- Drizz.li 頁面可顯示地名及預報，但台灣士林 ID 路徑目前只算部分驗證。正式開始實作前，應先用一般瀏覽器確認該路徑可正常顯示地名與預報；若不能，先確認官方支援的路由格式，不可退回座標頁。
- 本次尚未實作距離函式或快取，因此 999 m／1,000 m／1,001 m 的程式邊界測試尚未執行；這些是後續自動化測試，不得標成已通過。

## 四、建議實作流程（尚未授權實作）

1. 僅對已成功取得天氣且有有效原始座標、已確認 Place ID 的卡片評估地名連結。
2. 使用行程卡片的「地圖地點」文字作為 Geocoding 查詢詞，請求英文結果；若沒有候選則直接使用 Open-Meteo 來源。
3. 對所有候選計算 Haversine 直線距離，選擇最近且距離 ≤ 1,000 m 的候選。名稱、國家、行政區不另設為阻擋條件。
4. 使用官方支援的地名／ID 路由建立 Drizz.li URL，並驗證 URL 協定與 host；不要自行拼接任意 host 或將使用者輸入直接當路徑。
5. 配對成功後把 URL 與驗證資訊寫入獨立資料欄位／快取；前端優先顯示 Drizz.li，否則顯示現有 Open-Meteo 來源。
6. 配對結果應重用，不在每次卡片 render 或開啟來源選單時呼叫 Geocoding。當 Place ID 或來源座標改變、座標快取到期／重取時，清除或重驗舊配對。
7. 不變更原始 source_url、預報排程、租約、提醒、權限及其他天氣行為。

## 五、終止時未完成項目（封存，不是目前待辦）

以下項目在終止時尚未執行，僅供日後若使用者重新啟動此議題時追溯；本輪不再執行或追蹤：

- 一般瀏覽器實測士林 ID-backed Drizz.li 路徑及逐日預報完整載入。
- 再次核對本機／正式 migration ledger，並設計配對快取失效規則。
- 距離門檻、候選排序、空結果、API 失敗與無效座標的自動化測試。
- Geocoding 查詢詞／快取 key、同名候選、中文景點與舊天氣快取 fallback 測試。
- 更新來源契約與資料庫設計文件。除非使用者另行要求重新啟動，不建立 migration、不修改程式或部署。

## 六、本次未執行項目

- 沒有修改任何應用程式碼、測試腳本、migration 或正式資料。
- 沒有建立／變更 Supabase 欄位、資料表、權限、Secrets 或 Edge Function。
- 沒有部署、正式端到端寫入、commit、push、tag 或合併。

## 七、後續比較評估工作

2026-10-20 已將外部圖形化天氣連結研究拆分為三個獨立對話：Drizz.li（本文件）、meteoblue Location Search、Weather.com。本輪已補做三站 Chrome headless 頁面渲染測試、官方條款核查並完成彙整；三站仍有未驗證項目，總排名及商業／非商業使用條件見《[96_圖形化天氣網站前三候選分流評估工作包](96_圖形化天氣網站前三候選分流評估工作包.md)》第七節。

## 八、補充評估紀錄（2026-10-20，本對話）

本次依使用者提供的 Drizz.li 評估工作包，重新整理目前可支持的結論與尚未完成項目；沒有修改應用程式、資料庫、migration、正式資料或設定，也沒有部署、commit 或 push。

### 本次補充確認

- 官方專案入口為 [open-meteo/drizz.li](https://github.com/open-meteo/drizz.li)，網址規則與網站行為應以官方 README／目前原始碼為準；本次已用隔離 Chrome headless 補測士林 ID-backed、京都 slug 與座標路徑，細節及圖表完成狀態限制見第十節。
- Open-Meteo Geocoding API 官方文件：[Geocoding API](https://open-meteo.com/en/docs/geocoding-api)；服務條款：[Terms of Use](https://open-meteo.com/en/terms)。免費 API 的非商業使用條件不能直接推導為適用所有商業情境；產品用途／授權仍須依條款核對。
- 一般網頁可免費瀏覽、可分享具名地點 URL、開發者可免費合法自動建立 URL／呼叫 API，是三個不同判斷項目，不得混為一談。
- 本次已透過 Chrome headless 執行 JavaScript 渲染：士林與京都的地名及預報資料通過；完整圖表視覺完成狀態仍部分驗證；座標頁明確不符合具名地點需求。這不是使用者現有 Chrome profile 的人工互動測試。
- 既定產品限制維持不變：不開始實作；無合格具名地點頁時保留 Open-Meteo 來源連結；不得把只有座標標題的 Drizz.li 頁當作成功結果；不得覆寫 `source_url`。

### 本次結果與後續動作

| 項目 | 本次狀態 |
|---|---|
| 官方專案／文件入口 | 已記錄 |
| Geocoding 官方文件與條款入口 | 已記錄；仍須針對預定使用情境完成條款判讀 |
| 東京地名頁 | 沿用既有測試結果，不宣稱本次重新實測 |
| 士林 ID-backed 頁 | Chrome headless 已渲染地名與逐日／逐時預報資料；圖表視覺完成狀態部分驗證 |
| 京都具名頁／座標頁 | 京都地名與預報資料已渲染；座標頁只有座標標題，不合格 |
| 中文景點／同名地點 | 中文景點查詢無結果；Shilin 同名候選已測試，須按距離選最近候選 |
| 成本／授權 | 不因網站可瀏覽就推定整合免費；待依使用情境核對 |
| 程式／資料庫／部署 | 未修改、未部署 |

## 九、參考來源

- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)：地名搜尋 API 與候選座標來源。
- [Open-Meteo Terms of Use](https://open-meteo.com/en/terms)：使用條件與授權判讀入口。
- [Drizz.li 官方專案 README](https://github.com/open-meteo/drizz.li)：路由格式與網站行為應以此專案目前版本為準。
- [Drizz.li 東京地名頁測試樣本](https://drizz.li/en/weather/week/tokyo/?day=2026-10-20)：既有 2026-10-20 測試樣本；不是本次重新測試證據。

## 十、Chrome headless 渲染補測與本站結論（2026-10-20）

### 測試工具問題與處理

- Open Browser Use 的 `tabs`／`open_tab` 呼叫回報內部錯誤；Open Computer Use 可以讀取 Chrome 狀態，但 `press_key`／`set_value` 操作也回報內部錯誤。
- 沒有重啟或修改 MCP 設定，以免影響使用者現有瀏覽器工作；改用同一 Windows 主機上的 Chrome headless，搭配獨立暫存 profile 執行 JavaScript 渲染測試。此方式沒有沿用使用者 Chrome 的登入或 Cookie，屬於實際瀏覽器引擎渲染，但不是人工操作既有 Chrome 分頁的測試。

### 實測結果

| 測試 | Chrome headless 渲染結果 | 判讀 |
|---|---|---|
| 士林 ID-backed 頁：[shilin_1669369](https://drizz.li/en/weather/week/shilin_1669369/?day=2026-10-20) | H1 顯示 `Weekly forecast for Shilin`；地點標籤為 `Shilin · 8m · Taiwan, Taiwan`；已渲染逐日預報卡片、逐時資料表，DOM 有 3 個 canvas。初始 HTTP 回應雖為 404，但 SPA fallback 執行後有預報資料。 | **地名與預報資料通過；圖表視覺完成狀態部分驗證**。DOM 仍存在 `Loading charts...` 字串，因此不宣稱所有圖表已完全完成視覺載入。 |
| 京都具名頁：[kyoto](https://drizz.li/en/weather/week/kyoto/?day=2026-10-20) | H1 顯示 Kyoto；地點標籤為 `Kyoto · 50m · Japan, Kyoto`；逐日預報卡片、逐時資料表及 3 個 canvas 存在。 | **地名與預報資料通過；圖表視覺完成狀態部分驗證**。 |
| 京都 ID 路徑 | `/en/weather/week/kyoto_1857910/` 會被解析／導向 canonical `/en/weather/week/kyoto/`。官方原始碼 `src/lib/utils/location.ts` 的 `buildLocationRoute()` 說明人口大於 543,000 的地點使用 slug；其他地點通常使用 `slug_id`。 | 應依官方路由邏輯建立 URL，不應一律附加 ID。來源：[官方 location.ts](https://github.com/open-meteo/drizz.li/blob/main/src/lib/utils/location.ts)。 |
| 座標頁：[25.0885N121.5244E](https://drizz.li/en/weather/week/25.0885N121.5244E/?day=2026-10-20) | 預報資料有渲染，但 H1／地點標籤只顯示 `25.09°N 121.52°E`。 | **不符合具名地點需求；不可作為成功結果**。 |

### Geocoding 與距離補測

- `Shilin` 英文搜尋 `count=10` 回傳 10 個候選，前幾筆包含中國、俄羅斯、白俄羅斯等同名地點；台灣士林候選 ID `1669369` 仍在候選內，座標為 `25.09071, 121.52259`。
- 原始測試座標 `25.0885, 121.5244` 到台灣士林候選距離約 **306 m**；按既定規則，以候選距離排序即可選到此候選，不以國家／行政區一致性作額外通過門檻。
- `Kyoto` 搜尋結果同時有日本京都及坦尚尼亞等同名地點；應依原始座標計算距離。以 `35.0116, 135.7681` 為測試點，至京都市 Geocoding 座標 `35.02107, 135.75385` 約 **1,671 m**，因此該點應 fallback 到 Open-Meteo；若原始座標本身就是京都市候選座標，則可匹配城市頁。
- `Shilin Night Market`、`Kyoto Station` 及中文 `士林夜市`、`京都站` 查詢均沒有 Geocoding 結果。對這些景點應 fallback，不得猜測地名或把座標頁當成合格具名頁。

### 成本／授權與本站結論

- [Open-Meteo Geocoding API 官方文件](https://open-meteo.com/en/docs/geocoding-api) 明示免費 API 僅供非商業用途，並有每日呼叫限制；[官方條款](https://open-meteo.com/en/terms) 將有訂閱／廣告的網站或 app、商業產品等列為商業使用。Open-Meteo 商業方案為固定月費，因此依本專案排除條件，不把商業方案列為候選。
- **本站結論：條件式推薦，暫定 7.5/10（只代表 Drizz.li 單站，不是最終總排名）。** 若 Travel-Companion 維持非商業、無廣告／訂閱的使用方式，Drizz.li 是三站中目前最適合進一步整合設計的選項：具名城市頁可由官方路由規則建立、無需額外 API key，並可用既定 1,000 m 門檻避免錯配。若此 app 屬商業產品，則 Geocoding 的免費授權不適用，而固定月費方案又被排除，本站不能判為符合硬性條件。
- 保留既定 fallback：無結果、查詢失敗、最近候選超過 1,000 m 或只有座標頁時，顯示 Open-Meteo 來源連結；不得覆寫 `source_url`。
- 本次僅補充評估文件，沒有修改應用程式、資料庫、migration、正式設定或部署，沒有 commit/push。
