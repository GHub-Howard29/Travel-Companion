# Weathernews 外部天氣連結可行性評估與實測紀錄

> 實測日期：2026-10-20（台灣時間）
> 狀態：**網站深連結技術面初步通過，整體為「附條件保留」；授權條款仍未確認，不可據此進入整合。**
> 範圍：評估 Weathernews（ウェザーニュース）作為 Travel-Companion 行程天氣卡片的外部圖形化預報連結。只檢查公開網頁與條款線索；未修改程式、資料庫、migration、設定或部署，未 commit/push。

## 一、結論摘要

Weathernews 值得保留為候選，且本輪實測結果優於先前初步預期：台灣士林夜市、台北 101、台北城市、日本京都城市、京都市行政區及小豆島町都找到可直接開啟、可讀取逐時預報內容的具名頁面。已測頁面回傳 HTTP 200，內容包含天氣圖示、逐時降水、氣溫、風速；日本京都頁另有 10 日預報資訊。

但「具名地點頁可用」不等於「可合法把任意行程地點自動轉成 URL」。精確「士林」嘗試路徑回傳 HTTP 404；京都車站尚未找到可證實的具名頁；沒有找到官方公開的任意地點 URL 產生規格或座標 URL 契約。更重要的是，Weathernews.jp 的適用使用條款尚未確認：Weathernews 公司網站的英文及日文條款都明確排除 `https://weathernews.jp/`，因此不能把那些條款直接套用到本評估的天氣網站。

**暫定判斷：技術可行性中高；整體採用可行性中等、附條件保留。** 僅建議繼續確認官方網站的實際適用條款與地點 URL 規則；不建議現在就實作。

## 二、公開頁面實測矩陣

| 測試目標 | 實測 URL | 結果 | 可讀到的預報內容 | 判定 |
|---|---|---|---|---|
| 台灣士林夜市（中文 POI） | https://weathernews.jp/onebox/tenki/world/1/taiwan/shilin-night-market/ | HTTP 200；標題「士林夜市の天気予報」；麵包屑顯示世界天氣／亞洲／台灣／士林夜市 | 逐時天氣圖示、降水量、氣溫、風速；頁面以台灣當地時間顯示 | **通過** |
| 台北城市 | https://weathernews.jp/onebox/tenki/world/1/taiwan/taipei/ | HTTP 200；具名台北頁 | 逐時降水、氣溫、風；頁面另列周邊觀光地點 | **通過** |
| 台北 101（中文景點） | https://weathernews.jp/onebox/tenki/world/1/taiwan/taipei-101/ | HTTP 200；標題「台北101の天気予報」 | 逐時降水、氣溫、風；具名景點可直接開啟 | **通過** |
| 士林（行政區名稱直接試探） | https://weathernews.jp/onebox/tenki/world/1/taiwan/shilin/ | HTTP 404；顯示找不到頁面 | 無預報資料 | **失敗**；不能只把地名轉成 slug |
| 日本京都城市 | https://weathernews.jp/onebox/tenki/kyoto/ | HTTP 200；標題「京都の天気」 | 頁面資料列出逐時天氣與 10 日預報；含市區連結 | **通過** |
| 京都市行政區／ID 頁 | https://weathernews.jp/onebox/tenki/kyoto/26100/ | HTTP 200；標題「京都市の天気予報」 | 具名城市及預報資訊；URL 含數字 ID | **通過** |
| 京都車站（POI） | 本輪未找到能以官方搜尋結果確認的專屬頁 URL | 未驗證 | 不以城市頁代替車站級定位成功 | **未驗證** |
| 小豆島町（日本旅遊地點） | https://weathernews.jp/onebox/tenki/kanagawa/37324/ | HTTP 200；頁面標題顯示「香川県小豆島町」 | 具名地點與逐時預報資料 | **部分通過**；網址中的 `kanagawa` 與頁面所示香川縣不一致，應避免自行猜測路由 |
| 同名地點／不同城市 | 台北城市頁、京都城市頁、東京頁各自使用不同路徑 | 已證實不同具名頁可獨立直達；未完成任意同名搜尋候選的互動選取測試 | 頁面標題及麵包屑可用來人工核對地點 | **部分驗證** |
| 座標直達 | 未找到官方公開的 latitude/longitude URL 規格 | 未驗證 | 不推測座標頁是否支援 | **未驗證** |

### 測試方式與限制

- 以公開頁面 HTTP 擷取確認回應狀態、頁面標題、麵包屑及預報資料；本輪未能使用 Open Browser Use 的真實瀏覽器自動化（服務端回報找不到可連線的 browser socket）。
- 這不是使用者現有 Chrome profile 的手動互動測試，也未驗證 Cookie 清除、跨 IP／地區、手機新分頁或長期 URL 持續性。
- 頁面呈現的預報數值會隨時間更新；本紀錄重點是地點辨識、URL 與內容結構，不把擷取時的天氣數值當作固定資料。
- 小豆島頁的路徑包含 `kanagawa/37324`，但頁面名稱為香川縣小豆島町。這顯示不能僅憑 URL 路徑文字推定行政區正確；須以頁面標題／麵包屑或官方 URL 產生方式驗證。

## 三、URL 與地點解析判斷

### 已知可行的路由形式（僅為觀察到的範例，不是官方 URL 契約）

- 海外具名城市：`/onebox/tenki/world/1/taiwan/taipei/`
- 海外具名景點：`/onebox/tenki/world/1/taiwan/shilin-night-market/`
- 日本城市：`/onebox/tenki/kyoto/`
- 日本城市行政區／地點 ID：`/onebox/tenki/kyoto/26100/`

實測證明部分已知 slug／ID URL 可用，但未找到官方文件承諾這些路徑可由任意地名、地址或座標穩定產生。不得把 `地名轉小寫／連字號` 當作通用生成規則：直接試探的 `.../taiwan/shilin/` 回傳 404。

### 對 Travel-Companion 的意義

1. 如果行程地點恰好對應已確認的 Weathernews 具名 URL，技術上可直接提供外部連結。
2. 不能只用 slug 猜測任意地點 URL，也不應把非官方頁面爬取、隱藏 API 或搜尋第一筆作為自動化方案。
3. 若無可驗證的正確具名頁，應維持現有 Open-Meteo 來源連結，不可用錯誤地點頁取代。
4. 若未來要自動建立 Weathernews URL，應先取得官方可用的地點搜尋／穩定 ID 規則或書面說明；本輪不提出 DB/schema 變更。

## 四、免費與授權

### 已確認與未確認的界線

- 公開頁面在本輪可不登入直接讀取，且未遇到付費牆；這只證明本次公開瀏覽可行，不代表商業產品可自由連結、嵌入、擷取或再散布。
- Weathernews 公司網站的英文條款（https://global.weathernews.com/terms-of-use/from-20240815/）明確寫明其條款不適用於 `https://weathernews.jp/`。
- 日本公司網站的日文條款（https://jp.weathernews.com/terms-of-use）也明確排除 `https://weathernews.jp/`。
- 因此，上述條款中針對商業用途、爬取／爬蟲等規定，不能直接作為 Weathernews.jp 天氣頁的適用條款證據；本輪尚未找到可確定適用於目標天氣網站的官方使用規約頁。
- 本輪沒有把 Weathernews API 作為採用方案，也未確認是否有零固定費用、非限期試用且符合本專案用途的官方 API。**API 成本／授權狀態：未知，不可視為通過。**

### 採用前必須釐清

1. Weathernews.jp 天氣網站的實際適用服務條款／著作權聲明。
2. 第三方旅行應用只提供連至官方具名頁的外部連結，是否允許商業或公開使用。
3. URL 是否可長期分享、是否允許程式依官方地點資料產生，以及是否需要 attribution／連結標示。
4. 若任何方案必須固定付費或僅限期試用，依專案既定條件排除，不以功能優勢破例。

## 五、優缺點與暫定評分

| 項目 | 判斷 |
|---|---|
| 優點 | 多個台灣具名城市／景點與日本城市頁可直接開啟；逐時預報包含降水、氣溫、風；日本頁另有多日預報；不需要在 Travel-Companion 內擷取天氣資料就能展示圖形化預報 |
| 缺點 | 具名 URL 路由規則未有官方契約；士林行政區 slug 試探 404；京都車站與座標直達未驗證；小豆島路徑行政區片段與頁面縣名不一致；目標網站適用條款尚未找到 |
| 技術可行性 | **中高**：對已確認具名頁可行，任意地點的自動 URL 產生仍未知 |
| 授權可行性 | **未知**：不能套用被明確排除的公司網站條款 |
| 暫定適配分 | **6.5/10（條件式）** |
| 建議去留 | **附條件保留，暫不整合** |
| 是否符合零固定費用硬條件 | 一般頁面本次公開可讀；整合授權與 API 條件未知，因此整體尚不能判為符合 |

## 六、外部連結呈現方式（簡化定案方向）

使用者觀察到 Google 的呈現方式：點選天氣連結後，先顯示資料來源／提供者宣告，再呈現 Weathernews 官方首頁網址文字；實際超連結目的地則是特定地點的天氣預報頁。這可作為 Travel-Companion 外部連結確認提示的 UX 參考，但要區分顯示文字與實際目的地，避免讓使用者誤以為點擊後會開啟首頁。

- 使用者點選「Weathernews 區域預報」後，可先顯示輕量確認提示，說明即將離開 Travel-Companion 並開啟 Weathernews 官方網站的外部天氣頁。
- 本 App 目前的行程天氣仍使用 Open-Meteo；Weathernews 只是額外的外部圖形化預報頁。**不應照抄「這則回覆使用 Weathernews 提供的資料」**，除非畫面中的天氣內容確實使用 Weathernews 資料。
- 建議連結標籤使用「Weathernews 官方天氣頁（weathernews.jp）」或「在 Weathernews 查看香川縣區域預報」，實際開啟經核實的地點深層連結。官方首頁可另作清楚標示的獨立連結。
- 若把 `https://weathernews.jp/` 顯示為可點擊文字，但 href 實際指向地點深層連結，提示必須明確說明將開啟該地點預報頁。更直覺的做法是顯示官方網域／品牌名稱，同時標明實際預報地點。
- 若只能退階至自治體、城市或縣級，提示與連結標籤都必須寫出實際涵蓋層級，例如「香川縣區域預報」，不能稱為「小豆島精確預報」。
- 確認提示和署名只能改善透明度與使用者體驗，不代表取得法律授權；適用條款、深層連結政策及品牌／署名要求仍須確認。

### 設計原則

> **即將開啟外部天氣網站**
>
> Travel-Companion 的行程天氣仍使用 Open-Meteo。你可以另外開啟 Weathernews 查看此地區的圖形化預報；預報頁由 Weathernews 維護，將在外部網站開啟。
>
> **目的地：香川縣區域預報**
>
> 連結：Weathernews 官方天氣頁（weathernews.jp）

此為 UX 草案，未代表條款／署名要求已獲確認，也尚未核准實作。

## 六、官方／實測來源

- Weathernews 官方首頁：https://weathernews.jp/
- 台灣天氣列表：https://weathernews.jp/onebox/tenki/world/1/taiwan/
- 台北具名頁：https://weathernews.jp/onebox/tenki/world/1/taiwan/taipei/
- 士林夜市具名頁：https://weathernews.jp/onebox/tenki/world/1/taiwan/shilin-night-market/
- 台北 101 具名頁：https://weathernews.jp/onebox/tenki/world/1/taiwan/taipei-101/
- 京都具名頁：https://weathernews.jp/onebox/tenki/kyoto/
- 京都市 ID 頁：https://weathernews.jp/onebox/tenki/kyoto/26100/
- 小豆島町頁：https://weathernews.jp/onebox/tenki/kanagawa/37324/
- 公司英文條款（明確排除 weathernews.jp）：https://global.weathernews.com/terms-of-use/from-20240815/
- 公司日文條款（明確排除 weathernews.jp）：https://jp.weathernews.com/terms-of-use

## 七、後續建議

- 先只釐清適用於 `weathernews.jp` 的官方條款及外部深連結政策；必要時向 Weathernews 取得書面確認。
- 如授權可接受，再確認是否有官方地點搜尋／URL 產生規格，並補測京都車站、座標、同名地點及一般瀏覽器／手機重開。
- 在以上兩點確認前，不修改程式、DB、migration、設定，不部署，不 commit/push；既有 Open-Meteo 來源連結保持不變。
