# meteoblue Location Search 外部天氣連結可行性評估

> 評估日期：2026-10-20
> 狀態：**本輪評估已封存；依使用者指示終止圖形化方案評估。士林精確頁、景點及 API 端到端測試未通過或未驗證，不再追蹤後續驗證**
> 範圍：只評估 Travel-Companion 行程天氣卡片的外部圖形化天氣連結；評估期間未修改程式、資料庫、設定或部署。其後依使用者要求彙整天氣文件並提交，未包含程式或部署。

## 一、結論摘要

**最終評估結論：技術可行性中高，但目前產品採用判定為「暫不採用／需先取得官方書面許可」。** 已有的具名地點 URL 可直接開啟，且不需本產品呼叫 API；然而 meteoblue 公開 Terms & Conditions 的 referral/link 條款明定，非商業網站引用其服務須展示 meteoblue 標誌、設置直接有效連結並通知 meteoblue；商業網站引用服務須事先取得許可。該條款頁最後修改日期為 2018-05-24，雖可能有更新或其他適用條款，現有證據不足以認定 Travel-Companion 可不經確認直接採用。Location Search API 仍不列為目前首選。

官方搜尋結果可找到帶有具名地點與數字識別碼的公開預報 URL，例如京都 https://www.meteoblue.com/en/weather/week/kyoto_japan_1857910，以及台灣的 Shulin District 頁 https://www.meteoblue.com/en/weather/week/shulin-district_taiwan_1668875。這證明 meteoblue 網站存在可直接分享的具名地點頁，但目前尚未以一般瀏覽器完整測試所有需求地點，也未確認 URL 格式有正式長期穩定承諾。

官方 Location Search API 文件指出：API 可解析地名、郵遞區號、機場代碼與座標，回傳地名、國家、經緯度及可用於 meteoblue 網站連結的 url 欄位；呼叫需要 API key。官方標示非商業用途免費，商業用途需另訂使用協議。另一份官方 API 概覽則表示 Weather API 需要 API key、可申請免費試用，採需求型或固定費率計價。依本專案硬性條件，**不能把 API 免費試用視為長期免費方案；凡確認只提供限期試用或必須固定付費的 API 套餐應排除**。Location Search API 的商用合約／費用尚未查明，暫不列為可採用的免費商業整合方式。

在官方書面確認前，將 meteoblue 標記為「技術可行、產品採用暫停」，不進入實作或正式候選採用。即使不呼叫 API，純外部連結仍須先釐清 Terms & Conditions 的 referral 條款。沒有合格且授權允許的外部具名地點頁時，必須保留既有 Open-Meteo 來源連結作備援。

## 二、官方證據

| 主題 | 官方來源與證據 | 評估 |
|---|---|---|
| Location Search API 能力 | [Location Search API 文件](https://docs.meteoblue.com/en/weather-apis/further-apis/location-search-api) 說明可解析地名、郵遞區號、ICAO/IATA 及座標，並回傳名稱、國家、座標與 url。 | 有技術能力；需 API key。 |
| API 使用條件 | 同一文件明示 API key 為必要；非商業用途免費，商業用途需要 usage agreement。 | Travel-Companion 的具體商用／自用授權狀態需由 meteoblue 確認，不能自行推定為非商業。 |
| Weather API 定價入口 | [API 概覽](https://docs.meteoblue.com/en/weather-apis/introduction/overview) 指出 API 需 key，可申請 free API key trial，並採 demand-based 或 flat-rate pricing。 | 免費試用不是永久免費方案；付費或限期試用 API 不符合硬性條件。 |
| 一般地點預報頁 | [京都逐週預報](https://www.meteoblue.com/en/weather/week/kyoto_japan_1857910) | URL 直接指向 Kyoto，日本與座標資訊可見；頁面資料包含逐日預報及逐時 meteogram 資訊。 |
| 台灣具名頁示例 | [Shulin District 逐週預報](https://www.meteoblue.com/en/weather/week/shulin-district_taiwan_1668875) | 具名頁存在，但它是新北市樹林區，不是台北市士林區；不可將其誤當成士林測試通過。 |
| 同名地點風險 | 搜尋結果中 Shilin 會出現中國雲南石林等不同地點，例如 [Shilin, China](https://www.meteoblue.com/en/weather/week/shilin_china_10008281)。 | 不能只用地名 slug 或搜尋排名第一筆；需要核對國家、行政區及座標。 |
| 轉介／外部連結條款 | [meteoblue Terms & Conditions](https://content.meteoblue.com/en/legal/terms-conditions) 第 9.02–9.04 節 | 非商業網站引用需顯示 meteoblue 標誌、設置直接有效連結並通知 meteoblue；商業網站引用須事先取得許可。頁面最後修改日期為 2018-05-24，因此應向官方確認該條款目前是否仍適用及 Travel-Companion 的連結方式如何分類。 |

## 三、指定測試矩陣

評估日期：2026-10-20。已使用官方文件、搜尋引擎索引及 OpenChatX fetch_url 取得公開頁面 HTTP 狀態與主要頁面文字；瀏覽器自動化 MCP 的 open_tab／tabs 呼叫連續回傳內部錯誤，未能完成互動式瀏覽器測試。以下明確區分頁面內容檢查與尚未完成的互動實測。

| 測試項目 | URL／方式 | 結果 | 狀態與限制 |
|---|---|---|---|
| 台灣士林（Shilin District, Taipei） | 官方頁面搜尋未找到可確認為台北市士林區的具名預報 URL；已直接檢查的樹林區 URL 為 https://www.meteoblue.com/en/weather/week/shulin-district_taiwan_1668875（HTTP 200）。 | 該頁標題為 Shulin District，座標 24.99°N 121.42°E，屬新北市樹林區，不是士林區。 | **未通過**：沒有可證實的正確士林頁，不得拿樹林區代替。 |
| 日本京都 | https://www.meteoblue.com/en/weather/week/kyoto_japan_1857910（fetch_url HTTP 200） | 頁面標題 Weather Kyoto；顯示 Japan、35.02°N 135.75°E，頁面含逐日預報與逐時 meteogram 內容。 | **頁面內容檢查通過**；未完成瀏覽器互動、跨地區重開及長期穩定性測試。 |
| 中文景點：士林夜市／京都站 | 搜尋官方域名索引及候選名稱，未找到足以確認景點精確定位的獨立具名預報頁。 | 沒有證據證明景點名可穩定映射到正確天氣點。 | **未驗證／不算通過**。 |
| 座標點 | 官方 Location Search API 文件列出座標查詢範例，且說明回傳附近地點與 URL 欄位；API 需有效 key。 | 功能僅在文件層面獲證實；未使用有效 API key 執行士林／京都座標查詢。 | **不符合目前免 API 整合條件**；若不使用 API，無法證明可自動將任意座標轉為具名頁。 |
| 同名地點 | https://www.meteoblue.com/en/weather/week/shilin_china_10008281（fetch_url HTTP 200） | 頁面標題 Weather Shilin，顯示 Yunnan、China、24.24°N 102.36°E；與台灣士林明顯不同。官方 API 文件亦說排序會受相關性、語言、重要性、人口及使用者位置影響。 | **誤配風險已實證**：必須核對國家、行政區與座標，不能直接取第一筆。 |
| 分享與重現 | 京都與 Shilin China 的具名 URL 直接 fetch 均回 HTTP 200；URL 使用 slug 與數字 ID。 | 已確認特定現存 URL 可開啟並呈現對應地點；未找到永久 URL 穩定性承諾。 | **既有 URL 可用；動態產生與長期穩定性未證實**。 |

## 四、一般網站與 API 必須分開判斷

| 方案 | 成本／授權已知情況 | 是否符合硬性條件 | 判斷 |
|---|---|---|---|
| 使用者點擊既有 meteoblue 具名預報頁 | 已驗證特定既有 URL 可直接開啟，未見需要 API key 才能瀏覽該頁；但 Terms & Conditions 的 referral 條款對非商業與商業引用分別設有條件。 | **技術上符合，授權尚未符合／未確認**。 | 暫不採用；先取得 meteoblue 書面確認。 |
| Location Search API | 需要 API key；非商業免費，商業用途須 usage agreement。 | **尚不能判定符合**；商業條件及費用未知。 | 不作目前方案。若需固定費用或僅限期試用，依規則直接排除。 |
| Forecast／Image／Maps 等 Weather API | 官方概覽指出 API key、免費試用申請、需求型或固定費率。 | 若方案只有限期試用或必須固定付費，即不符合。 | 不納入目前零固定費用方案。 |
| 解析網站 HTML 或依搜尋排序推測 URL | 沒有本次查到的官方支持保證；頁面結構或排名變更可能破壞連結。 | 不符合穩定性與低維護原則。 | 不建議。 |

## 五、優缺點

### 優點
- 有現成具名地點頁，可呈現逐日預報、逐時圖表／meteogram，且部分頁面有雷達、衛星或天氣圖層。
- URL 帶有可辨識的地名 slug 與數字識別碼，能直接連到具名頁，而非只能進入首頁。
- 若直接使用已驗證的網頁 URL，理論上可不新增 API key、後端、資料表或排程。

### 缺點與風險
- 「士林」目前搜尋結果容易命中中國雲南石林；台灣士林的精確頁尚未確認。
- 中文景點與座標轉成穩定具名頁的自動化流程尚未證實；Location Search API 雖可做到部分地名／座標解析，但需要 key。
- API 非商業免費不等於 Travel-Companion 的使用情境必然屬非商業；商業使用須另有協議。
- API 概覽提到免費試用與需求型／固定費率，不可把試用視為長期免費。
- 未確認網站是否承諾深層連結的永久穩定性，也未完成一般瀏覽器跨地區／跨語言重開測試。
- Terms & Conditions 第 9.02–9.04 節對外部 referral 明列條件：非商業網站需顯示標誌、直接有效連結並通知 meteoblue；商業網站須事先取得許可。頁面標示最後修改於 2018-05-24，應向官方確認現行適用版本與本產品分類，不能把條款舊視為自動免除條件。
- 瀏覽器自動化 MCP 的 open_tab／tabs 呼叫回傳內部錯誤；已改用官方文件及 fetch_url 直接檢查頁面 HTTP 狀態和內容，故本次能證實頁面可開啟，但無法宣稱完成一般瀏覽器互動測試。

## 六、暫定評分與去留

| 項目 | 評估 |
|---|---|
| 終止時適配分 | **5.0 / 10**（只代表 meteoblue 單站評估；三站彙整排名見本文件第九節及工作包第七節） |
| 技術可行性 | **中高（限已知具名 URL）**：京都頁直接開啟且具圖形化預報；無法證明可免 API 動態解析任意地點。 |
| 合規／產品可採用性 | **目前不通過**：公開條款要求非商業 referral 條件，商業 referral 須事先許可；需向 meteoblue 確認現行條款及本產品情境。 |
| 成本判斷 | 既有網站頁可直接瀏覽；Location Search API 需 key，非商業免費但商業需 usage agreement；其他 Weather API 需 key，官方只承諾可申請 trial 並提供需求型或固定費率。付費或限期試用方案排除。 |
| 終止時去留 | **暫不採用**：未取得官方書面確認；依使用者指示終止評估，不再追蹤授權或進入程式整合。 |
| 解除阻擋門檻 | 1. 官方書面確認外部具名頁連結的使用條件；2. 取得士林正確頁或明確決定該地點不使用 meteoblue；3. 若要支援任意座標，須有符合硬性費用條件的合法解析方案，否則只允許已知且核實過的 URL 白名單；4. 後續補一般瀏覽器重開測試。 |
| 備援 | 找不到精確且合格的 meteoblue 頁時，保留原本 Open-Meteo 來源連結，不以錯誤地點或僅座標頁代替。 |

## 七、終止時未解項目（封存，不是目前待辦）

1. **先向 meteoblue 取得書面確認**：Travel-Companion 只顯示外部連結、不複製天氣資料的情境，是否仍屬 Terms & Conditions 9.02–9.04 的 referral；是否需標誌、通知或商業使用許可，是否有費用。
2. 若後續需要人工互動驗證，再以一般 Chrome 新分頁／清除 Cookie 重開京都頁；目前已用 Chrome headless 確認京都與樹林區頁面能渲染，但不是使用者現有 Chrome profile 的互動測試。士林精確頁與中文景點仍未驗證。
3. 若不採用 Location Search API，任意座標與中文景點不應動態猜 URL；只可使用經人工核實且授權允許的既有具名 URL。若需 API，先確認正式 key、商用協議與成本；不得將 DEMOKEY 當有效 key，也不得把 key 暴露在公開客戶端。
4. 若官方要求固定費用或方案只限期試用，依專案硬性條件排除該方案；未獲允許前維持 Open-Meteo 來源連結。
5. 三站已完成本輪彙整；總排名與使用情境條件見《96_圖形化天氣網站前三候選分流評估工作包》第七節。本站 5.0/10 是單站評分，不是總排名。

## 八、來源

- [meteoblue Location Search API — Technical Documentation](https://docs.meteoblue.com/en/weather-apis/further-apis/location-search-api)
- [meteoblue Terms & Conditions — Sections 9.02–9.04 Referrals & Links](https://content.meteoblue.com/en/legal/terms-conditions)
- [meteoblue API Overview — Technical Documentation](https://docs.meteoblue.com/en/weather-apis/introduction/overview)
- [Weather Kyoto — weekly forecast](https://www.meteoblue.com/en/weather/week/kyoto_japan_1857910)
- [Weather Shulin District — weekly forecast](https://www.meteoblue.com/en/weather/week/shulin-district_taiwan_1668875)
- [Weather Shilin, China — weekly forecast](https://www.meteoblue.com/en/weather/week/shilin_china_10008281)
- [meteoblue Terms & Conditions](https://content.meteoblue.com/en/legal/terms-conditions)

## 九、Chrome headless 補測與本站結論（2026-10-20）

### 渲染測試

- 以獨立暫存 profile 的 Chrome headless 執行 JavaScript 渲染：京都頁 [kyoto_japan_1857910](https://www.meteoblue.com/en/weather/week/kyoto_japan_1857910) 顯示 `Weather Kyoto`，頁面內容包含逐日預報與逐時／meteogram 相關區塊；公開具名頁的圖形化預報能力確認。
- 同一方式測試 [shulin-district_taiwan_1668875](https://www.meteoblue.com/en/weather/week/shulin-district_taiwan_1668875)，頁面顯示 `Weather Shulin District` 與預報資料；但 **Shulin 是樹林區，不是台北市士林區**，不能當成士林測試通過。
- 仍未找到能確認為台北市士林區的 meteoblue 具名頁；景點「士林夜市／京都站」也未證實有獨立精確頁。座標搜尋能力有官方 API 文件支持，但 API 需要 key，本次未取得有效 key 做端到端 API 測試。

### 新確認的條款限制

- 官方 [Location Search API 文件](https://docs.meteoblue.com/en/weather-apis/further-apis/location-search-api) 明示需要有效 API key；非商業用途免費，商業用途需另訂 usage agreement。API 回應的 `url` 欄位可提供 meteoblue 網站路徑，技術上比自行猜 URL 可靠，但引入 key、伺服器端保管及條款確認工作。
- 官方 [Terms & Conditions 第 9 節 Referrals & Links](https://content.meteoblue.com/en/legal/terms-conditions) 的公開文字規定：非商業網站引用 meteoblue 服務，需在網站顯示 meteoblue logo、提供直接且可用的連結，並通知 meteoblue；商業網站引用服務需事先取得許可。該條款頁最後修改日期標示為 2018-05-24，因此正式採用前仍應向官方確認目前適用規則。

### 更新後結論

- **本站終止時結論：暫不採用，5.0/10。** 京都頁的具名圖形化預報成立，但士林精確頁未找到；Location Search API 需 key；若將連結放入非商業網站，依公開條款還需 logo、直接連結及通知；商業使用需事先許可。依使用者指示，本輪不再追蹤授權或補測。
- 若 Travel-Companion 為非商業使用，且願意完成條款要求與 key 管理，可繼續保留為備選；若不希望新增 API key／聯絡供應商／品牌標示，或 app 屬商業用途而未取得許可，則不建議採用。
- 沒有把 API 免費試用當作可採用方案；Weather API 付費／試用方案仍依既定條件排除。沒有修改程式、資料庫、設定、部署或 Git 狀態。