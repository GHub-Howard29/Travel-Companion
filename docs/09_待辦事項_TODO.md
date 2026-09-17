# 待辦事項

> 本文件只保留尚未完成或仍需驗證的工作；版本順序與範圍以《02_產品開發路線圖》為準。
>
> 最後更新：2026-09-18
>
> 已發布 App 版本：V3.9.3；production migration、Git、tag 與 GitHub Pages 部署均已完成。

## V3.9.0 已發布結果

Google 路徑、真實照片 spike、現有架構、降級與成本模型已完成；原報告遺漏免費圖庫的問題已補做 Commons／Openverse 實測，並改提出用途分流建議。詳見《45_V3.9.0_每日行程卡片地點照片可行性報告》。

- [x] 地點搜尋候選索引照片：契約與真實 Google spike 均通過；5 組搜尋共 10 個候選，10／10 有照片且成功載入，實際使用 10／25 次核准照片請求，暫時性 Edge Function 已刪除並確認 404。
- [x] 免費公開來源 spike：Commons／Openverse 以 12 地點、24 次查詢完成；知名景點與桃機／飯店 hit@3 為 7／12，租車點與四家餐廳未命中，不能自動採第一張。
- [ ] 後續研究候選：取得 API key 後，以相同代表性地點矩陣補測 Pexels、Pixabay；此項不阻擋已核准的 Google／Commons 雙方案。Unsplash 只評估 hotlink，不下載保存。
- [x] Product Owner 確認 V3.9.0 同時納入 Google 搜尋候選暫態索引照與 Commons 每日卡片管理者選圖；兩軌不混用來源或保存資料。
- [x] Commons 補充 spike：中文／英文 14 組查詢中 12 組有圖片；7 張人工確認樣本的授權 metadata 7／7 完整，但 640px 平均約 239.8 KiB，必須壓縮後保存。
- [x] 完成兩方案桌面與 390×844 模擬圖並經 Product Owner 確認；每日卡片採與「選擇正確地點」一致的左圖、中間文字、右側操作緊湊橫列，不使用大幅封面。
- [x] Product Owner 核准跨日複製沿用同一照片引用，僅在最後一個引用移除時刪除 Storage 物件。
- [x] 補齊正式 API schema、Storage migration、RLS、資料相容與清理規格，完成前端與 Edge Function 本機實作，並建立 V3.9.0 一般更新候選 metadata。
- [x] 以本機 Docker 29.7.2 與 Supabase CLI 2.115.0 啟動隔離 Postgres，實際套用 migration；Storage RLS、月額度原子性、瀏覽器角色隔離均通過，security／performance advisors 為零問題，Edge Runtime 可載入 `travel-route`。
- [x] 遠端隔離 Supabase CI run `34688235879` 通過；migration、Storage／RLS、額度、advisors 與清理均成功且無 annotations。
- [x] production logical backup、migration `20260912093527`、production-safe postflight、advisors 已完成；`travel-route` 最終部署為 version 9、ACTIVE、`verify_jwt=false`，兩個新增 action 的未登入請求均為 403。
- [x] 在本機 V3.9.0 候選以正式管理者完成 Google 候選照片、Commons 選圖、Storage 保存與重新整理 smoke；修正 Commons 縮圖 host、Supabase Storage CSP，並通過桌面／390×844 卡片文字回流版面驗證。
- [x] 作者／授權文字移至與地圖按鈕同列上緣，保留原字級與左側間距；完整 build 與結構回歸通過。
- [x] Commons 候選新增「換一批」：以 `gsroffset` 取得下一批結果，換關鍵字時重置分頁；本機契約、TypeScript、lint 與 build 通過。
- [ ] 若後續確認需移除 smoke 測試照片，須在刪除行動當下取得確認；不處理目前卡片上的其他既有照片。
- [x] Product Owner 已於 2026-09-13 解除正式前端停止線，授權合併 `main`、建立 `v3.9.0` tag、部署 GitHub Pages 及發布後文件回寫。
- [x] `main` 與 `v3.9.0` 已推送至 `7abac83`；GitHub Pages 部署 `d7b8e93` 已上線，正式 metadata、Service Worker、manifest、桌面／390×844 版本資訊及 Guest 行程載入通過。

## 後續候選版本

- [x] V3.9.0：已於 2026-09-13 正式發布；production Function version 9 為 ACTIVE，正式前端與發布後 smoke 均通過。
- [x] V3.9.2 BUG031：正式建置隔離、建置前 URL 驗證、產物掃描、lint、完整 verify chain、production build、`main`、`v3.9.2`、GitHub Pages、必要更新與登入／Guest 正式站 smoke 均已完成。
- [x] V3.9.3 本機發布前收斂：verify 聚合、冷啟動埋點、系統開發者 capability、使用紀錄 migration／RPC、側邊欄彙總 UI、TypeScript／lint／build、本機 Supabase 與桌面／390×844 回歸均已通過。
- [x] V3.9.3 正式發布：production preflight／migration／postflight、`main`／`develop`、annotated tag `v3.9.3`、GitHub Pages 與正式 metadata 均已完成；發布提交為 `3e92c22`。
- [ ] V3.9.4：依《56》先建立照片搜尋請求成本、hit@6、零候選、去重與快取基線，再改善前置去重、解析重用、提前停止、negative cache 與續頁效率；外部矩陣、額度調整與實作均未授權。
- [ ] V3.9.6：在已另行規劃的 V3.9.5 之後，先建立完整 build 各驗證群組、TypeScript 與 Vite build 的耗時基線；再依領域整併驗證套件與失敗報告。完整發布驗證不得縮減，快速日常檢查不得取代 release build；不含功能、資料庫、Edge、CI、版本 metadata 或部署變更。
- [ ] V3.9.7：在 V3.9.6 完成後，量測離線刷新約 30 秒載入既有資料的分段原因，再決定是否修正。只在本機記錄 Service Worker／navigation、session、Trip 快取、localStorage、IndexedDB 與首個可操作畫面耗時；不得上傳資料或破壞 Offline First、墓碑、pending 與同步安全。V3.6.5 的更新後載入改善與 V3.9.3 的冷啟動總埋點不重複安排。
- [ ] V3.9.8：在 V3.9.7 的離線回歸可重現後，建立零費用本機 Playwright E2E，使用 loopback Supabase、合成帳號與 fixture 驗證桌面／390×844 的核心流程、離線快取、可及性、水平溢位與 Commons 歧義狀態；不使用 production、外部 API、付費雲端實機或長期憑證。Android／iOS PWA、OAuth、相機與原生行為仍列人工實機補驗。
- [ ] V3.9.9：以 V3.9.8 E2E 為回歸護欄，先量測 bundle／import graph，再模組化照片搜尋、候選、裁切與放大檢視，並只在照片管理流程按需載入。保留既有頁面 lazy loading 與 Excel 動態載入，不改 Edge API、快取／配額、資料契約或 secret 邊界。
- [x] V3.9.1 跨日複製四碼時間輸入修正：本機程式、純函式、TypeScript、lint 與完整 build 已完成；2026-09-16 以登入管理者在桌面／390×844 完成半形與全形四碼、IME 組字延後格式化、游標、刪除不自動補回、雙欄警告、焦點陷阱與 Escape 返回驗收，並實際通過單日 Day 2 與多日 Day 2／Day 3 複製；synthetic fixture 已還原。詳見《51》。
- [x] V3.9.1 第一優先：Commons 實體導向候選照片精準搜尋已完成本機、正式資料庫與正式 Edge 收斂。包含 fetch transport、核准 Issues User-Agent、AES-GCM token、共享快取／配額／鎖／日彙總、前端狀態、公開候選投影、同名實體描述／QID、乾淨重建、RLS／service-role-only、四次 15 例真實矩陣、production-safe smoke、桌面／390×844 互動及 loopback fixture。正式 `travel-route` 為 version 11／ACTIVE／`verify_jwt=false`；發布前停止線已達。詳見《50》、《52》與《53》。
- [x] V3.9.1 精準搜尋用量治理：2026-09-14 核准 `commons_precision_usage_daily` 無 UI、無個資／行程資料的專案日彙總、13 完整月加當月保留與 service-role-only 原子讀寫；只有程式開發者取得每次單次明確授權後，Codex 等開發 AI 才可完整唯讀彙總，無資料庫／secret／寫入／搜尋觸發權。Gemini 等外部 AI 不在本項範圍。不依 Wikimedia 公開分析資料推估本 App 用量；只有連續兩完整月低於上限 50% 且無 429／503，才可另案建議放寬，禁止自動調高。詳見《50》8 節。
- [x] V3.9.1 精準篩選視覺辨識邊界：不導入 Gemini／其他影像 AI、不傳送 Commons 圖片；本版只依可稽核中介資料排序並人工核可，不能宣稱自動辨識主體或品質。影像辨識待文字 AI 與 Commons 實測數據後另案討論。詳見《50》3.1.1 節。
- [x] V3.9.1 精準搜尋驗證閘門：15 例矩陣已完成四次真實執行（46／64／61／63 次）。第四次確認 CDN 正規化、同檔跨證據層去重與高千穗峽均通過；桃園第一航廈 `entity-not-found` 已依核准的設施級安全停止契約驗收通過。範圍 UI、主要管理者互動、高千穗峽無 token 的 `inspection-limit-reached` 終態及 `中山站` 7 個真實多實體選項均已通過；2026-09-17 已完成「名稱＋Wikidata 描述＋QID」歧義判讀介面、離線契約與 loopback-only 選定範圍 fixture。Product Owner 確認既有真實矩陣及補驗已足以作為代表性抽查，不要求逐地名測試；真實 selected-QID 僅為可選 smoke，不再阻擋停止線。詳見《50》6.1 節與《52》。
- [x] V3.9.1 子方案 A：2026-09-15 已定案停用自動中文轉英文／自動多語擴充，避免與人工採用的單語言 Gemini 候選詞規則衝突。B 只接受原始輸入或已採用的一個 AI 候選詞；改語言須明確採用或手動換詞。
- [x] V3.9.1 子方案 B：Commons／Pexels／Pixabay 來源切換；2026-09-14 Product Owner 已核准《49_V3.9.1_Commons_Pexels_Pixabay來源切換決策規格》八項來源策略與技術邊界，並原則同意後續申請 Pexels／Pixabay 驗證用 key。每次申請或提高額度前須先說明官方費用／額度、Supabase 間接成本、條款、隱私與安全風險；帳號、條款、CAPTCHA、信箱驗證、個人／付款資料一律由 Product Owner 手動完成。2026-09-15 已核准桌面／390×844 主要選圖流程、狀態文案與完整無障礙；真實矩陣與實作屬後續開發閘門。
- [x] V3.9.1 子方案 B 免費額度限制：2026-09-14 Product Owner 已核准《49》6.3 節的 Pexels／Pixabay 單次 session、Trip／管理者日上限、來源速率、月內配速、圖片下載及快取限制；Pexels 以官方額度保留 20% 的內部硬停，Pixabay 10,000/month 為專案自訂保護預算。下一步進入文字式 UI 行為討論，仍不得製作 UI 或模擬圖。
- [x] V3.9.1 子方案 B 搜尋起點與 UI：A、C 均已於 2026-09-15 定案停用；Commons 手動原始搜尋、桌面／390×844 來源與候選直向全寬列、狀態文字及完整無障礙已實作驗收。Gemini、Pexels／Pixabay仍未接入，若日後重啟仍須各自的 key、條款、成本、實作與發布授權；詳見《49》5.1.2 節。
- [x] V3.9.1 AI 測試期來源與上限：2026-09-14 核准 Gemini 免費層作測試磨合期，不作 production 依賴；每日專案硬停 100 次、實際取官方授予的 RPM／TPM／RPD 較小值。禁止自動重試、平行／跨供應商降級與 Google grounding；公開地點文字可供產品改進的條款已接受。測試 key、實作與正式啟用仍待個別核准。
- [x] V3.9.1 AI 候選契約與本機快取：每組最多 3 個、每個 1–80 字元，只含搜尋詞、BCP 47 語言代碼與生成類型；禁止圖片、連結、地址、座標、外部來源、模型推理及未驗證正式名稱。初始集後可手動換詞最多 2 次；每次最多帶回 6 個既有候選詞排除重複，仍計每日 AI 額度且不自動發起。快取僅同裝置，以正規化原文、目標語言、契約／模型／提示詞版本及候選集序號的 SHA-256 索引；保存候選詞與語言／類型、不存原文，30 日有效、最多 100 組候選集／約 300 筆、LRU 淘汰；版本變更、過期或手動清除即失效，命中仍須人工採用且不得自動搜尋、同步、分析或送出照片請求。換詞失敗保留既有集、不重試。
- [x] V3.9.1 AI 候選 JSON：2026-09-15 核准嚴格 `ai-search-candidates/v1`；根層僅 `contractVersion`、`candidates`，候選僅 `query`／`languageTag`／`kind`，可為空陣列；非 JSON、額外欄位或任一候選不合規即整批拒絕。提示詞版本化、低隨機性，禁止搜尋／grounding／Maps；模型名、溫度、輸出 token 與實際免費額度待 key 前依官方當期資訊另案核准。
- [x] V3.9.1 AI 候選目標語言：2026-09-15 核准每次由管理者明確指定一種、不得依地點／原文／國別猜測；未指定即原文語言、不翻譯。首版僅 AI 產生繁體中文（`zh-Hant`）、英文（`en`）、日文（`ja`）；其他語言可手動直接搜尋，改語言需另取候選且計入既有額度／快取。
- [x] V3.9.1 AI 複合輸入：2026-09-15 核准自然語言可拆為最多三個依原文順序的獨立單一地點／封面主題候選，管理者只可擇一採用；不得合併多地、猜重要性、杜撰名稱／關係或保證同框照片，無法可靠處理即略過。
- [x] V3.9.1 AI 恢復行為：2026-09-15 核准 `no-ai-candidate`／`ai-invalid-response`／`ai-unavailable`／`ai-quota-reached` 均回到原始輸入並可手動搜尋；不顯示模型原文、不自動重試／照片搜尋／切換來源。僅合規新候選計兩次手動換詞；失敗不計換詞但仍計每日硬停。
- [x] V3.9.1 AI 呼叫設定：2026-09-15 核准單一非串流、無工具、強制 JSON Schema；`temperature=0.1`、輸出上限 256 tokens、逾時 10 秒，提示詞／契約／模型變更必須升版並失效快取。具體 Gemini 型號、額度、key 權限待申請測試 key 前依官方當期資料確認。
- [x] V3.9.1 AI 觸發：2026-09-15 核准開啟選圖、切換來源、輸入／修改搜尋詞均不自動呼叫 AI／圖庫；僅管理者明確要求候選詞並指定語言才送初始請求，快取命中不呼叫。採用候選與單一來源搜尋均須再次明確操作；手動搜尋不需要 AI。
- [x] V3.9.1 AI 候選區 UI 狀態：2026-09-15 核准初始隱藏且手動原始搜尋可用；產生中只鎖 AI 控制、有候選不預選、回空／錯誤／額度均非阻斷並保留原始搜尋。來源／候選為可鍵盤操作單選群組，AI 狀態 `aria-live="polite"` 且不搶焦點。
- [x] V3.9.1 來源／分頁狀態 UI：2026-09-15 核准 AI、來源未啟用／受限、離線、逾時與三種分頁狀態皆用非阻斷式提示；來源未啟用保留可見不可選、受限僅停當前來源動作、離線停所有搜尋／換批／儲存。`duplicate-page` 有下一頁才可換批、`exhausted` 隱藏換批；均 `aria-live="polite"` 不搶焦點，禁止使用者排序控制項。完整文案見《49》5.1.2。
- [x] V3.9.1 候選照片核可 UI：2026-09-15 核准候選卡先選取、確認頁才可儲存；確認頁有來源／作者／授權／來源頁，僅 Commons 精準候選有符合依據。成功才替換封面，失敗／取消不變；手機確認／返回／取消直向全寬。外層關閉丟棄未儲存 session、返回候選保留同次結果；焦點陷阱、`aria-modal`、儲存鎖定與失敗解除鎖定皆已定案。
- [x] V3.9.1 選圖搜尋欄預填：2026-09-15 核准只預填已保存 `location` 原始文字；空值留白，不用標題、`placeId` 或 Google／其他衍生資料補值，且開啟不自動搜尋。
- [x] V3.9.1 封面手動焦點裁切與放大檢視：2026-09-15 核准維持 76×76 正方形、確認候選後以固定 1:1 框手動平移／縮放、確認呈現區域才儲存；不採自動智慧裁切，橫直方向不影響候選排序。桌面拖曳／滑桿／加減、手機雙指／拖曳且保留加減、鍵盤方向鍵／縮放控制與讀屏名稱皆已定案；裁切座標不保存，下載 1280px 衍生縮圖後輸出 640×640 WebP（120 KiB）。候選與已保存封面可放大檢視，右下以非燒錄來源／作者／授權資訊浮層及外連呈現，只用既有 640px 資源、不下載原圖。
- [ ] 後續版本評估：允許使用者把候選照片標為「不適合」，在手動「換一批」時僅作同一來源／查詢範圍的減分排序參考。須另案決定資料最小化、保存期、取消標記、跨裝置／Trip 範圍、是否可影響其他使用者與防濫用；V3.9.1 不記錄、不保存也不使用此類負評。
- [x] V3.9.1 子方案 C：2026-09-15 已定案為本版停用。不得增加 Google Place Details 呼叫、以 `placeId` 取得搜尋脈絡，或把 Google Places 衍生內容傳給 Commons／Pexels／Pixabay／AI；原因為 Place Details SKU 成本及再利用條款適用性未取得明確依據。保留為後續研究，須另行確認條款、SKU、成本、attribution、保存與安全邊界後才可重啟。
- [x] V3.9.1 Commons 搜尋提示修正：三種分頁狀態、換詞／重開重置、末頁隱藏換批與離線停用已完成本機實作及自動契約驗證；2026-09-16 首輪單次授權已在 Codex 瀏覽器順序完成 `高千穂峡`（200、5 候選、`results`、Q2027215）、`桃園國際機場第一航廈`（200、`entity-not-found` 安全停止）與 `桃園國際機場`（200、`project-quota-reached`）三組查詢。後續受限 spike 以 6 個 session 完成：`高千穂峡` 依序為 6／4／1／1 張及 `inspection-limit-reached`／0，終態無 token；`中山站` 回傳 `entity-ambiguous` 與 7 個實體選項。完全順序、無重試，每個上游請求 3 秒、整體作業 20 秒上限；本機當日帳本在完成後累計 22 次精準搜尋／113 次上游請求，但無法由日彙總反推出本輪單獨次數。
- [x] V3.9.1 地點／照片介面：候選 `placeId` Maps 地點頁、核准文案、選圖只預填 `location` 且不自動搜尋，以及前後端每批 6 張已完成本機實作；Edge Function 直接整合回應、候選 UI、唯一實體續頁終態與真實多實體選項均已完成驗收。同名多實體選項已改為全寬列，顯示名稱、Wikidata 描述及 QID；真實回應類別已抽查，選定行為以本機 Edge fixture 通過，不再要求逐地名外部測試。
- [x] V3.9.1 來源選擇、候選確認、手動裁切與放大檢視：Commons 可用且 Pexels／Pixabay 保持可見停用、1:1 平移／縮放、1280px 單張下載安全檢查、640×640 WebP、固定變更聲明、焦點陷阱與舊資料相容均已完成。登入管理者桌面／390×844 的主要流程、焦點修正、末頁終態與同名實體選擇均已驗收。
- [ ] V3.9.1 正式發布閘門：正式 migration、secrets、Edge version 11、production-safe smoke、3.9.1 metadata、lint、完整回歸、release build 與 Codex 瀏覽器回歸均已完成，發布前停止線已達。尚待另行授權合併 `develop` 至 `main`、建立 `v3.9.1` tag、部署 GitHub Pages 及執行發布後正式站 smoke。真實 selected-QID 仍只是有新風險時的可選單次 smoke。
- [x] 2026-09-16 本機初始化與整合基線修正：新增歷史前置結構 baseline migration 及乾淨重建所需的 `service_role`／Data API grants；空白資料庫重建、管理者登入、Trip 載入、Edge Function 授權與無效 `selectedEntityQid` 400 修正訊息均通過。此項未呼叫 Wikimedia，也不代表正式 migration、secrets、部署或發布已核准。
- [x] 2026-09-16 舊表 RLS 補正：新增 forward-only migration，為 `checklists`、`checklist_items`、`other_info_items`、`exchange_purchases` 恢復 RLS、四種操作 policy、最小 Data API grants 及缺少的 private checklist helper；本機 migration、Guest／一般使用者／Trip Editor 角色矩陣與 security advisors 均通過，synthetic 帳號與測試列已清除。
- [x] 2026-09-16 本機瀏覽器回歸 bootstrap：`travel-companion-regression` Skill 新增 `regression:local:browser-bootstrap`，可自動刷新 synthetic 管理者與 Trip、驗證 Vite／Edge，並輸出 loopback Supabase 登入資訊。Codex 內建瀏覽器已以 Supabase client `signInWithPassword` 成功建立 session，不再手動寫入或顯示 access token；既有 session 不會因每次 bootstrap 無條件重設密碼而失效。
- [x] 2026-09-17 同名實體本機回歸 fixture：Skill 新增 `regression:local:browser-ambiguous-fixture`，以 loopback-only synthetic Edge 回應固定驗證短描述、換行描述、無描述與 QID；回應在快取、配額、鎖、用量及 Wikimedia 流程前返回，非本機 Supabase 不可啟用。Codex 內建瀏覽器已通過三選項、讀屏名稱、選定範圍與 371×698 窄視窗零水平溢位，不能冒充真實 Wikimedia 整合結果。
- [x] 2026-09-17 正式環境唯讀 preflight：遠端尚缺 `20260710100000`、`20260915105815`、`20260916050414`、`20260916153228` migration history；正式 secrets 尚缺 `WIKIMEDIA_CONTACT_URL` 與 `COMMONS_PRECISION_TOKEN_SECRET`，`travel-route` 維持 version 9／ACTIVE／`verify_jwt=false`。`20260710100000` 是本機乾淨重建 baseline，正式環境已有其物件且 helper 已經後續 hardening 為 `SECURITY INVOKER`，不得以 `--include-all` 重新執行；下一個 production 寫入閘門應先只將該版本標記 applied，再以普通 dry-run 確認並套用其餘三個 migration。
- [x] 2026-09-17 正式資料庫第一段：已只將 baseline `20260710100000` migration history repair 為 applied，普通 dry-run 精確確認其餘三筆後，正式套用 `20260915105815`、`20260916050414`、`20260916153228`。migration history 與本機完全同步；4 張 Commons 表 RLS、7 個 service-role-only／`SECURITY INVOKER` RPC、舊表 16 個明確角色 policy、anon 零寫入權限、初始化列與最終 dry-run 均通過。Advisors 僅有刻意無 policy 的 server-only 表、既有 `tc_delete_trip` 內建 super-admin 驗證、Auth leaked-password protection 未啟用及效能資訊；未發現本次 migration 的阻斷問題。
- [x] 2026-09-17 正式後端第二段：設定 `WIKIMEDIA_CONTACT_URL` 與程序內隨機產生且未落地的 `COMMONS_PRECISION_TOKEN_SECRET`；部署 `travel-route` version 11／ACTIVE／`verify_jwt=false`。OPTIONS 200、缺少 Trip 400、未登入 403 的 production-safe smoke 通過；cache／usage 維持 0，未呼叫 Wikimedia 或寫入業務資料。

### V3.9.1 停止線前工作順序

1. [x] 固定 `高千穂峡` 已從首批續頁至無 token 的 `inspection-limit-reached` 終態；固定 `中山站` 已取得 7 個真實 `entity-ambiguous` 選項。
2. [x] 2026-09-17 Product Owner 確認既有四輪矩陣與真實多實體補驗已足以作為代表性抽查；selected-QID 真實查詢降為按新風險執行的可選單次 smoke，不要求逐地名測試，也不阻擋停止線。
3. [x] 乾淨重建、管理者授權、Edge action、續頁 token、快取／配額／鎖、舊表 RLS 與角色矩陣均已完成本機驗證。
4. [x] 正式 migration、secrets、Edge Function version 11 與無外部請求／無業務寫入的 production-safe smoke 已完成。
5. [x] 3.9.1 metadata、一般更新政策、版本歷史、lint、完整本機回歸、release build 與桌面／390×844 Codex 瀏覽器發布候選回歸已完成；發布前停止線已達。
6. [ ] 正式發布另案執行：合併 `develop` 至 `main`、建立 `v3.9.1` tag、部署 GitHub Pages，並完成發布後正式站 smoke。
- [ ] V3.10.0：重新確認使用紀錄的必要性與最小資料範圍；原 App 查詢介面、逐次明細、Cron、獨立角色與 TOTP 預覽均標記為先前草案、尚未定案。
- [ ] 後續版本評估：Google Maps「任意地圖落針」座標作為行程交通估算點。V3.9.1 維持確認地點後只保存 `placeId`、交由既有路線估算，因官方建議 `placeId` 通常較精準；本項若重啟，須獨立確認座標資料契約、手動落針 UI、隱私／保存期限、Routes 成本與 Google 條款。不得傳送座標給 Commons／Pexels／Pixabay／AI，也不得藉此重啟 V3.9.1 子方案 C。

## 已發布版本待補驗證

- [ ] V3.8.2：Android／iOS 實體裝置安裝／更新、Service Worker 接管、正式管理者單日／多日複製及多裝置版本衝突回歸。
- [ ] V3.8.1：Android／iOS 實體裝置、PWA 冷啟動離線及舊版實機必要更新流程。
- [ ] V3.8.0：Guest、User、`trip_editor`、`super_admin`、歷史行程、離線阻擋、跨裝置版本衝突，以及實機必要更新與更新後版本資訊。
- [ ] iOS Safari／standalone PWA：Google OAuth、啟動畫面、管理欄位縮放、外部連結、附件拍照／相簿、更新提示、離線與同步。
- [ ] V3.6.0 路線功能：完整角色與付費 API 邊界、正式站 OAuth、Android／iOS 外部開圖、離線與重新連線。
- [ ] V3.6.1～V3.6.3：iOS、桌面／PWA 單次更新、版面、版本資訊、交通圖示及縮短天數確認流程。
- [ ] V3.6.4～V3.6.5：Android、iOS 與兩台實體裝置的登入、歷史唯讀、撤權、離線、pending、跨裝置與單次更新流程。
- [ ] V3.7.0：桌面、Android PWA、iOS Safari／standalone、實際大眾運輸班次及跨裝置競態。

## 跨版本改善候選

- [ ] 只在實際使用證明有需要時，重新排程排序後全日時間預覽、路線批次重查、跨午夜與 API 成本控制；不再占用 V3.8.1。
- [ ] 收集帳本附件管理的具體操作問題與頻率，再決定功能範圍。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊及外幣換算，不共用單一合併策略。
