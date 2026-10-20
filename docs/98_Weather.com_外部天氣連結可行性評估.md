# Weather.com（The Weather Channel）外部天氣連結可行性評估

> 評估日期：2026-10-20
> 狀態：**本輪評估已封存；依使用者指示終止圖形化方案評估。人工互動、清除 Cookie、跨地區重開與同名候選規則未完整驗證，不再追蹤後續驗證**
> 範圍：僅評估 Travel-Companion 行程天氣卡片的外部圖形化天氣連結；評估期間未修改程式、資料庫、設定或部署。其後依使用者要求彙整天氣文件並提交，未包含程式或部署。

## 一、結論摘要

**暫定可行性：中低；一般網站具名地點連結「附條件保留」，The Weather Company API 依本專案淘汰條件「排除」。**

Weather.com 公開地點頁可呈現逐時與未來 10 日預報。公開頁測試能找到台灣台北市士林區及日本京都的具名頁，並在部分路徑下回傳 HTTP 200；因此「使用者點擊後瀏覽 Weather.com」在技術上可行。但直接以地名拼接常見的 `/weather/today/l/<name>` URL 測試，京都、士林及士林夜市均回傳 404；座標形式的 URL 會被重導向成地區／行政區頁，並非原始座標永久直連。不同入口會導向不同 URL 形式，京都頁也會因語言／地區路徑而改變。官方文件未提供可依任意地名／景點穩定產生網站 URL 的公開契約。

The Weather Company Location Search API 可按城市、地址、POI 搜尋，Location Point API 可解析座標；兩者都要求 API key，配額受授權協議約束。官方 API 定價列出 30 天免費試用（50,000 次／日、100 次／分鐘），但註明限企業客戶並受資格限制；Standard 年約標示每月 USD 500、每月 100 萬次。這些方案不符合「排除固定費用或僅限期試用」條件，**API／自動化地點解析方案直接排除，不作可採用的整合方案**。

純網頁連結仍可獨立保留評估，但需人工／可信來源預先確認地點 URL，不能以未公開的 URL 拼接規則、HTML 擷取、非官方 API 或搜尋結果第一筆作為自動化方案。官方使用條款僅授予個人、非商業使用服務的有限授權，並限制未經許可的自動化監控／複製及商業用途；是否允許 Travel-Companion 在產品內大量生成／展示外部連結，公開資料不足以作肯定結論。尚未取得明確授權前，不應將此站視為已通過商用／自動化條件。

## 二、官方證據與判讀

| 主題 | 官方來源與證據 | 評估 |
|---|---|---|
| Weather.com 一般地點頁 | [台灣士林區預報頁（實測最終路徑）](https://weather.com/8935/58599/taipei/locality/shilin-district/today)、[京都預報頁](https://weather.com/jp/kyoto/city/kyoto/today) | 公開頁可顯示具名地點、逐時資訊與 10 日預報；頁面可免費開啟的觀察不等於所有內容／所有用途都獲授權。 |
| Location Search API | [官方 Location Search API 文件](https://developer.weather.com/docs/openapi/location-service-search-3-0/get-location-search) | 支援自由文字城市、地址、POI 與 fuzzy matching；需要 API key，配額依授權合約；該 Location Search 產品文件標示 Attribution Required: No。這不代表天氣預報資料本身的授權要求也相同。 |
| 座標解析 API | [官方 Location Point API 文件](https://developer.weather.com/docs/openapi/location-service-point-3-0/get-location-point-by-geocode) | 可用 `latitude,longitude` 解析位置；需要 API key。Location Point 文件標示 Attribution Required: No；天氣預報資料的歸屬要求仍應依實際 API 產品合約確認。 |
| API 認證與配額 | [官方 Authentication 文件](https://developer.weather.com/docs/authentication) | 每次 API 請求都需 API key；試用上限 100 次／分鐘、50,000 次／日；超額或未授權請求可能遭拒。 |
| API 定價 | [The Weather Company API Packages & Pricing](https://www.weathercompany.com/weather-data-apis/weather-data-apis-packages-pricing/) | 免費試用 30 天，50,000 次／日、100 次／分鐘；Standard 年約為 USD 500／月、每月 100 萬次；免費試用註記限企業客戶且受條件限制。依專案硬性條件，API 排除。 |
| API 免費試用 | [官方 Weather Data API Free Trial](https://www.weathercompany.com/weather-data-api-free-trial/) | 官方明確定位為 30 天試用，不是長期免費額度。 |
| 一般網站使用條款 | [The Weather Company Terms of Use（2026-04-16 更新）](https://trust.weather.com/en-CM/privacy/terms-of-use) | 服務使用授權限定個人、非商業用途；條款禁止未經明確書面許可，為未授權或商業目的以 bots／scrapers／其他自動方式監控或複製服務／內容。並明示 B2B API 另有獨立條款。對本產品的深層連結分享權限仍需釐清。 |

## 三、指定地點／URL 測試矩陣

測試日期：2026-10-20。以下是公開 HTTP 頁面擷取與最終 URL 檢查；**不等同於已完成一般使用者 Chrome 互動測試**。頁面擷取不使用登入帳號或有效 API key。

| 測試項目 | 測試 URL／方式 | 結果 | 狀態與限制 |
|---|---|---|---|
| 台灣士林（Shilin District, Taipei） | 由公開候選頁 [Weather.com Shilin District](https://weather.com/weather/today/l/16b4fe316a64c24c6f74c7d5dea626e45b5efb18d384dd6215c8ad8e5ed2178e) 開啟；最終 URL 為 `/8935/58599/taipei/shilin-district/postcode/111/today`。另測試座標 URL `/weather/today/l/25.0878,121.5240`，最終導向 `/8935/58599/taipei/locality/shilin-district/today`。 | 顯示「Shilin District, 111, Taipei」／「Shilin District, Taipei」，具逐時與 10 日預報。 | **公開頁部分通過**。兩個入口導向不同路徑；URL 路由格式未見官方穩定性承諾。 |
| 日本京都 | [京都預報頁](https://weather.com/jp/kyoto/city/kyoto/today)；另由 `/weather/today/l/35.0116,135.7681` 測試座標。 | 京都頁顯示「Kyoto, Kyoto, Japan」及逐時／10 日預報；座標入口導向 `/jp/kyoto/kyoto/locality/nakagyou-ku/today`，顯示 Nakagyou-ku。 | **公開頁部分通過**。座標被解析為行政區而非維持原座標頁；需要確認對行程點而言的地理精度是否足夠。 |
| 中文景點：士林夜市 | 以 `https://weather.com/weather/today/l/Shilin+Night+Market+Taipei+Taiwan` 測試常見具名 URL 形式。 | HTTP 404。未找到官方文件支持的 POI 網頁 URL 產生方式。 | **未通過此 URL 測試**；不代表網站內部搜尋一定不支援此景點，但不能據此宣稱可直接生成景點頁。 |
| 中文／文字地名 URL | 以 `/weather/today/l/Kyoto+Japan`、`/weather/today/l/Shilin+District+Taipei+Taiwan` 測試。 | 均 HTTP 404。 | **未通過**。地名直接拼接不是可依賴的 URL 生成規則。 |
| 座標點 | `/weather/today/l/25.0878,121.5240`；`/weather/today/l/35.0116,135.7681` | 兩者都導向 Weather.com 的具名行政區／地點頁，且回傳 HTTP 200。 | **技術上部分通過**，但該路徑是未找到官方文件說明的實驗性形式；不能當成正式支援的永久 URL API。 |
| 同名地點 | 以 Shilin 相關公開搜尋結果及地名拼接 URL 比對 | 有公開的 Shilin District 頁面，但自由文字 URL 拼接失敗；無法從公開頁測試證明同名候選選取規則或其穩定性。 | **未驗證**。不得僅以名稱或搜尋排序第一筆自動選取；需要正式地點解析 API，而 API 不符合成本條件。 |
| 語言／地區路徑 | [京都 `/jp/` 路徑](https://weather.com/jp/kyoto/city/kyoto/today) 與 [`/en-AU/jp/` 路徑](https://weather.com/en-AU/jp/kyoto/city/kyoto/today) | 兩者均顯示京都天氣，但 URL 路徑與顯示語言／單位會因區域路徑改變。 | **部分通過**；不能假設一種語言路徑對所有使用者完全相同。 |
| 登入／Cookie | 公開頁文字可見 Sign in 入口，預報主內容可由未登入頁面擷取。 | 本次未提供帳號、未完成清除 Cookie／不同地區 IP 的 Chrome 實測。 | **未登入可讀的公開內容已觀察到；Cookie／地區重導向未完整驗證**。 |

## 四、三種能力分開判定

| 能力 | 成本／授權與證據 | 判定 |
|---|---|---|
| 一般使用者免費瀏覽 Weather.com | 測試的具名地點公開頁可開啟並呈現預報；部分功能可能受訂閱限制，條款限定個人非商業使用。 | **成立（限公開可見內容與條款允許的使用）**。 |
| 具名地點頁可直接分享 | 已找到士林與京都的可開啟頁面，但 URL 可能是雜湊 ID、地區路徑或行政區路徑；拼接地名的常見形式 404，且沒有找到官方永久 URL 契約。 | **部分成立／附條件保留**。若手動保存已驗證 URL，技術上可用；自動生成與長期穩定性未證實。 |
| 開發者免費、合法整合地點搜尋／預報 API | Location Search／Point 需 API key，配額依授權協議；試用 30 天且受企業資格限制；Standard 為 USD 500／月（年約）。 | **排除**。不符合零固定費用且不限期的硬性條件。 |
| 自動抓取網頁或自行仿造內部 URL | 官方條款對未授權自動化監控／複製與商業用途設有明確限制；沒有查到官方承諾的任意地名轉 URL 規則。 | **不建議／不作替代方案**。 |

## 五、優缺點

### 優點
- 士林與京都有現成的公開具名預報頁，可顯示逐時與未來 10 日預報。
- 公開頁不必先登入即可讀取部分預報內容。
- URL 中可觀察到地區／城市／行政區路徑，也存在雜湊型 location URL；預先驗證的連結可以作為手動外部連結候選。
- 官方 API 的 Location Search 明確支援城市、地址與 POI；Point API 支援座標解析，技術能力有官方文件說明。

### 缺點與風險
- API 只有限期試用或固定付費的公開套餐：30 天試用受企業資格限制，Standard 年約 USD 500／月，均依使用者規則排除。
- 直接把地名拼接到 URL 會 404；官方沒有公開保證的任意地名 URL 格式或永久 ID 對應契約。
- 座標路徑會重導向成具名行政區頁，可能降低景點／小範圍行程點的精度。
- 京都頁路徑會因地區／語言而變化；士林不同入口也導向不同 URL。尚未證明 Cookie、IP 或語言差異下 URL 仍可重現。
- 景點名稱（士林夜市）未能以直接 URL 成功；同名地點匹配機制未驗證。
- Terms of Use 將服務授權限定個人非商業用途，並限制未經許可的自動化監控／複製；Travel-Companion 使用情境與外部深層連結是否允許，仍需官方確認。
- 本次是公開頁 HTTP／內容檢查，並非完整一般瀏覽器端到端測試；未驗證所有頁面 Cookie、登入、IP 地區及手機重開行為。

## 六、暫定評分與去留

| 項目 | 評估 |
|---|---|
| 本站暫定適配分 | **4.0 / 10**（本站單項評估；三站彙整排名見本文件第九節及工作包第七節） |
| 可行性 | **中低**。既有城市／行政區頁存在，但直接 URL 生成、POI／同名地點匹配、跨地區穩定性與條款許可尚不足。 |
| 一般網頁連結 | **附條件保留**：只可使用已人工驗證、精確匹配的既有具名 URL；在官方確認深層連結與產品使用條款前，不宣稱可供商業／自動化使用。 |
| API／自動化地點解析 | **排除**：30 天限期試用或 USD 500／月 Standard 年約均不符合硬性條件。 |
| 建議整合方式 | 目前不實作。若未來官方書面確認純外部連結用途允許，可考慮只為經驗證地點保存固定 URL；不得依地名拼接或爬取 HTML 自動生成。 |
| 進入整合設計門檻 | 1. 官方確認深層連結／產品內連結用途；2. 一般 Chrome 清除 Cookie、新分頁、台灣與日本環境重開測試；3. 士林、京都、中文景點、座標及同名地點有可重現的精確匹配證據；4. 方案不依賴被排除的付費／限期試用 API。 |
| 備援 | 找不到符合條件的 Weather.com 具名頁時，維持現有 Open-Meteo 來源連結；不得改成 Weather.com 首頁、未驗證地名 URL 或錯誤地點。 |

## 七、終止時未解項目（封存，不是目前待辦）

1. 使用一般 Chrome／使用者可見瀏覽器，以無痕／清除 Cookie、新分頁與不同語言設定重開士林及京都 URL，記錄地址列最終 URL、登入提示與預報是否完整。
2. 透過 Weather.com 網站正常 UI 搜尋「士林夜市」「京都站」及同名地點，記錄候選排序、國家／行政區及選取後 URL；不把直接拼接 URL 的 404 當成內部搜尋必定失敗。
3. 取得 The Weather Company 對「Travel-Companion 只提供外部連結、不擷取或重用預報內容」是否符合 Terms of Use 的明確答覆；目前公開條款不足以確定產品內連結的授權邊界。
4. 不申請或使用 API 作為候選整合方案，除非使用者未來明確改變「排除固定費用／限期試用」的條件。
5. 三站已完成本輪彙整；總排名與使用情境條件見《96_圖形化天氣網站前三候選分流評估工作包》第七節。本站 4.0/10 是單站評分，不代表總排名。

## 八、來源

- [Weather.com Shilin District forecast — discovered public page](https://weather.com/weather/today/l/16b4fe316a64c24c6f74c7d5dea626e45b5efb18d384dd6215c8ad8e5ed2178e)
- [Weather.com Shilin District forecast — final canonical path](https://weather.com/8935/58599/taipei/locality/shilin-district/today)
- [Weather.com Kyoto forecast](https://weather.com/jp/kyoto/city/kyoto/today)
- [Weather.com Kyoto regional path](https://weather.com/en-AU/jp/kyoto/city/kyoto/today)
- [Location Search API — official documentation](https://developer.weather.com/docs/openapi/location-service-search-3-0/get-location-search)
- [Location Point API — official documentation](https://developer.weather.com/docs/openapi/location-service-point-3-0/get-location-point-by-geocode)
- [Authentication — official documentation](https://developer.weather.com/docs/authentication)
- [Weather Data API packages & pricing](https://www.weathercompany.com/weather-data-apis/weather-data-apis-packages-pricing/)
- [Weather Data API Free Trial](https://www.weathercompany.com/weather-data-api-free-trial/)
- [The Weather Company Terms of Use, updated 2026-04-16](https://trust.weather.com/en-CM/privacy/terms-of-use)

## 九、Chrome headless 補測與本站結論（2026-10-20）

### 渲染測試

- 使用隔離暫存 profile 的 Chrome headless 實際執行頁面 JavaScript：士林頁 [Shilin District](https://weather.com/8935/58599/taipei/locality/shilin-district/today) 顯示 `Shilin District Weather`，並有 Hourly／10 Day 導覽與預報內容；京都頁 [Kyoto](https://weather.com/jp/kyoto/city/kyoto/today) 顯示 `Kyoto Weather`，地名為 Kyoto, Kyoto, Japan，亦有逐時與 10 日預報。
- 直接拼接的 `https://weather.com/weather/today/l/Shilin+Night+Market+Taipei+Taiwan` 與 `https://weather.com/weather/today/l/Kyoto+Japan` 會顯示 `Oops! We are having trouble finding your page.`；不能用地名拼接方式產生 URL。
- 座標 URL `https://weather.com/weather/today/l/25.0878,121.5240` 可渲染士林區具名預報頁，但它被解析成行政區，而不是原始座標永久直連。這只能算部分技術可行，不證明此路由為官方承諾的穩定 URL 格式。
- 以上是 Chrome headless 渲染測試，不是使用者現有 Chrome profile 的 Cookie 清除／不同地區互動測試；後者仍未完成。

### 更新後結論

- **本站結論：不推薦作為自動化地名連結方案，暫定 4.0/10；API 方案排除。** 士林及京都現有頁可渲染，但沒有官方支持的任意地名轉 URL 契約；POI 直連測試失敗；座標 URL 只會解析成行政區；同名地點自動選取無可靠公開契約。
- [官方 API 定價](https://www.weathercompany.com/weather-data-apis/weather-data-apis-packages-pricing/) 顯示免費試用僅 30 天且有企業資格限制，Standard 年約為 USD 500／月，均不符合本專案硬性條件，故不列入採用方案。
- [官方 Terms of Use](https://trust.weather.com/en-CM/privacy/terms-of-use) 將服務授權限定於個人、非商業用途，並限制未經許可的自動化監控／複製。純外部連結是否可用於 Travel-Companion 的具體發佈情境仍未獲明確確認；在無官方答覆前，只能把人工預先驗證的 URL 視為技術備案，不應作為自動化整合的首選。
- 無合格且經確認可用的 URL 時，維持 Open-Meteo 來源連結。沒有修改程式、資料庫、設定、部署或 Git 狀態。