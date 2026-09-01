# 待辦事項

> 本文件只保留尚未完成或仍需驗證的工作；版本順序與範圍以《02_產品開發路線圖》為準。
>
> 最後更新：2026-09-01
>
> 已發布 App 版本：V3.6.2；Git 版本標籤 `v3.6.2` 與手動部署已完成。

## V3.5.0 iOS PWA 與敏感資訊可見範圍強化（發布前不含 PWA 實機驗證）

### 發布前驗證（同步、權限與離線佇列）

- [x] `haw1971.yahoo@gmail.com` 已完成一般其他資訊、購物卡片及領隊／導遊聯絡資訊同步；同步失敗時可按手動重試。
- [x] 另一台管理者裝置新增其他資訊後，原裝置可重新載入；共同／私人同步不受影響。
- [x] `trip_editor` 欄位與刪除權限、`super_admin` 管理權限及敏感卡片可見範圍已完成角色回歸。
- [x] 離線資料與同步佇列已完成驗證，資料可保留於本機並於連線後同步。

### 發布後補驗證（Android／Chrome PWA）

- [x] ✅ 已通過（2026-08-26）：以 V3.4.11 作為基準升級至 V3.5.0，強制更新只需按一次、更新後非空白頁、提示不可稍後、資料仍在，未儲存表單警語正常。
- [x] ✅ 已通過（2026-08-26）第 2 項 Android／Chrome PWA 啟動與版面：Android 維持 V3.4.11 原生 Splash 流程，管理／編輯欄位聚焦與關閉後維持正常寬度；電腦 Chrome PWA 可由米白底正常進入 App，未停在空白頁。

> 第 1 項強制更新與第 2 項 Android／Chrome PWA 啟動／版面均已通過；iOS PWA 實機驗證仍未測試。同步、權限與離線佇列已於發布前完成驗證。

#### 實機驗證項目 2、3 的修改邊界

- 針對上述第 2、3 項進行定案修改時，只能變動為本次新增或必要的修正部分。
- 原 APP 既有文案與小圖示不得變動、替換或重新設計。

### 畫面模擬圖門檻

- [x] 已完成「一般資訊／新增敏感資料」新增／編輯卡片模擬圖；Product Owner 已確認。
- [x] 已完成 App 首頁分享入口模擬圖；入口位置與浮動視窗大方向已確認。

### 敏感資訊卡片權限

- [x] 自駕／租車、領隊／導遊及一般其他資訊維持第二層卡片；一般資訊不顯示可見範圍選項，敏感快捷入口自動設定管理者限定。
- [x] 一般資訊對 Guest、User、`trip_editor`、`super_admin` 顯示；既有受限制卡片編輯時維持敏感模式。
- [x] 敏感資料只對目前 Trip 的 `trip_editor` 與 `super_admin` 顯示；Guest、User 與其他 Trip 的編輯者完全看不到卡片、數量或存在提示。
- [x] 沿用 `allowed_roles`，完成前端過濾、RLS migration、Data API 方案、複製／排序／編輯保留權限的程式補全。
- [x] 卡片改為限制後，未授權帳號成功刷新時移除舊快取；登出後不沿用管理者敏感快取。
- [x] 敏感快捷入口加入全中文自動套用文案，並在儲存敏感資料時顯示二次提醒。
- [x] 已套用 `docs/sql/013_v350_other_info_security_scheme.sql`（migration `20260825082245`）；角色回歸已通過。
- [x] 已套用 `docs/sql/014_other_info_sync_deleted_rows.sql`（migration `20260825082258`）；管理者帳號的其他資訊／領隊導遊同步與手動重試已通過。
- [x] `trip_editor` 參與者與登入 Email 欄位不可編輯、不可刪除整個旅程；其他旅程編輯功能維持可用。

### V3.5.0 納入 V3.4.11 BUG024 修正

- [x] 其他資訊同步改為先 UPDATE、無對應資料列才 INSERT，並加入失敗提示右側的手動重新同步按鈕。
- [x] `trip_editor` 不可修改參與者／登入 Email，也不可刪除整個旅程；`super_admin` 仍保有原管理權限。
- [x] `docs/sql/014_other_info_sync_deleted_rows.sql` 已加入 V3.5.0 候選發布內容。
- [x] V3.5.0 候選版採 `FORCE_UPDATE = true`；理由為 RLS／敏感資料快取隔離與同步流程修正需前端及 migration 一起生效。
- [x] `013`、`014` migration 已套用正式 Supabase 專案；`haw1971.yahoo@gmail.com`、`trip_editor`／`super_admin` 角色回歸已完成。
- [x] 候選 build 已同步更新 `appVersion.ts`、`public/app-version.json`、`package.json`、`package-lock.json` 與 `versionHistory.ts` 為 V3.5.0；`FORCE_UPDATE = true`。

### 分享、離線與待確認範圍

- [x] App 分享規格、模擬圖與修改邊界已確認；功能尚未納入 V3.5.0，移至 V3.5.1 實作與驗證。
- [x] Guest 不提供離線行程內容；登入帳號的離線資料依帳號與權限隔離。
- [x] 已決定 V3.5.0 候選版的 `FORCE_UPDATE = true`；PWA 舊版升級流程改列發布後補驗證，不作為發布前阻擋項目。

### 發布後補驗證（iOS）

> ⏭ 2026-08-26：目前沒有 iOS 實機設備，本大項保留未驗證並暫時跳過；不判定失敗，也不回溯阻擋已發布的 V3.5.0。

- [ ] iOS standalone PWA 啟動時顯示專案圖示，不得只有純色底圖。
- [ ] iOS 聚焦管理／編輯欄位及退出後維持正常寬度，不需兩指縮小，也不可左右移動。
- [ ] iOS Safari／standalone 回歸行程、共同／私人清單、其他資訊、旅程編輯、更新提示與同步。
- [ ] iOS Google 登入、拍照／相簿附件及附件重試回歸。

### V3.5.0 發布後驗證結案

- [x] ✅ 第 4 項已通過（2026-08-26）：V3.5.0 發布後驗證正式結案；第 1、2 項通過，第 3 項 iOS 因無設備保留未驗證，BUG026 與 App 分享移入 V3.5.1。

## 後續版本

- [x] V3.5.1：已於 2026-08-26 發布並結案；程式與正式 Supabase migration、雙端跨裝置即時刷新、角色、多帳號同筆競態、宜蘭附件與 Storage 四角色 RLS 回歸均已通過，且未新增敏感附件可見層級。
- [x] V3.5.3：前端瀏覽器安全防護已於 2026-08-26 發布。
  - [x] 範圍與 Patch 版號重新確認；不改 schema、RLS、角色或同步資料流。
  - [x] CSP、Referrer Policy、URL／外部視窗及 OAuth DOM 安全修正。
  - [x] lint、正式 build 與 postbuild 瀏覽器安全規則驗證。
  - [x] 一般瀏覽器 Google OAuth 實機回歸；iOS standalone PWA OAuth 改列日後補驗證。
  - [x] Service Worker 安裝／離線、附件、Excel、分享及外部連結實機回歸。
  - [x] ✅ 已通過（2026-08-27）：以舊版快取或既有 PWA 開啟正式站，可偵測 `3.5.3`、顯示正確更新內容，並完成非強制更新。
  - [ ] 補驗證 iOS standalone PWA Google OAuth：建立可由 iPhone／iPad 存取的 HTTPS 測試站，在 Supabase Redirect URL 加入該站精確的 `/Travel-Companion/` 回呼網址；以 Safari 加入主畫面後完成 Google 登入，確認可回到 App、登入狀態正確且沒有白畫面或停留在等待頁；驗證完畢後移除暫時 Redirect URL。
- [x] V3.5.4：管理者帳號名稱映射、統一 Trip ID 與新增旅程預帶入已於 2026-08-27 發布（`v3.5.4`、非強制更新）：`admin_profiles` 只預帶 Howard、Carol；新 Trip ID 依初始型態與出發日期固定，且新增時檢查本機、Supabase 與資料庫主鍵重複；既有 `admin_users` 維持角色／Trip 指派，既有 Trip ID 不修改。
  - [x] ✅ 已通過（2026-08-27）：離線狀態點選「新增旅程」會顯示「新增旅程需要網路連線」，且不開啟表單。
  - [x] ✅ 已通過（2026-08-27）：以已存在的候選 ID 提交新增旅程時，顯示本機重複提示，且不寫入任何資料。
  - [x] ✅ 已通過（2026-08-27）：從既有快取／已安裝 PWA 開啟正式站，可偵測 V3.5.4、顯示正確非強制更新內容，並完成非強制更新。
- [x] V3.5.5：行程返回、外部連結與資訊文字醒目（已於 2026-08-27 由 Product Owner 完成合併與部署；iOS／手機實機驗證延後）。
  - [x] ✅ 已通過（2026-08-27，電腦版）：刪除目前行程後，返回首頁直接套用與進入 App 時相同的 `findDefaultTrip` 選取規則。
  - [x] ✅ 已通過（2026-08-27，電腦版）：資訊卡片一般 HTTP／HTTPS 超連結與 Google Maps 網頁均由外部瀏覽器開啟；手機 Google Maps 專用 App 開啟與回退行為延後驗證。
  - [x] ✅ 已通過（2026-08-27，電腦版）：每日詳細行程活動的「地圖導航」由外部瀏覽器開啟 Google Maps，地點與活動設定一致。
  - [x] ✅ 已通過（2026-08-27，電腦版）：資訊卡片內容及每日詳細行程的「說明」欄皆可選取局部文字設定指定顏色，儲存及重新載入後仍正確保留；不提供整欄統一顏色。實作只修改這兩個文字編輯欄位，其他 App 欄位、圖示與功能未變動。
  - [x] ✅ 已通過（2026-08-27，電腦版）：刪除後選取、一般外部連結、Google Maps 網頁開啟、滑鼠拖曳局部套色、儲存／重載、離線同步及四種角色閱讀均通過。
  - [ ] ⏭ 延後手機實機驗證：Android／iOS 的系統外部開啟、Google Maps 專用 App 開啟／瀏覽器回退、長按控制點拖曳局部套色，以及儲存／重載／離線同步／角色讀取，待具備測試設備後再進行。
- [x] V3.5.6：版本更新最低支援版本機制與手機文字選色工具列修正（已於 2026-08-28 合併、建立 Git 版本標籤 `v3.5.6` 並部署；發布前驗證通過）。
  - [x] 擴充公開版本 metadata，加入 `minimumSupportedVersion`，並以語意版號比較目前 `APP_VERSION`。
  - [x] 將「必要更新」與 raw `forceUpdate` 相容旗標分離；新客戶端以最低支援版本決定是否必要，舊客戶端仍以 `forceUpdate: true` 被導向橋接版。
  - [x] App 啟動、回到前景與 Service Worker 更新時都重新讀取無快取版本政策；必要更新不受已讀版本、稍後更新或顯示模式限制。
  - [x] 必要更新離線時阻擋操作並提供重試；僅在新版 Service Worker 接管及重載成功後記錄已讀版本。
  - [x] 將資訊卡片「內容」及每日詳細行程「說明」的「A」選色按鈕與提示詞整塊由文字輸入框上方移到下方，分隔線配合改到工具列上緣；其餘版面與功能不變。
  - [x] ✅ Android／iOS 已通過：保留原生長按選取、反白文字與選取控制點，工具列可操作且只對原選取片段套色。
  - [x] 行程到達／離開時間接受半形或全形冒號並在儲存時正規化為 `HH:mm`；排序相容既有全形冒號資料，但明確拒絕冒號前後空白。
  - [x] 新增／編輯活動時驗證所有非空白時間欄位；遇到非數字、錯誤符號、冒號旁空白、缺少時分或超出 `00:00` 至 `23:59`，須指出錯誤欄位、顯示正確格式範例、保留表單內容並禁止儲存及進入排序。空白時間維持既有規則；歷史無效資料可讀取但再次儲存前必須修正。
  - [x] 同一天內離開時間不得早於到達時間；格式錯誤範例只顯示半形 `08:00`，另明確提示半形／全形冒號皆可且冒號前後不可空格。
  - [x] ✅ 舊版／新版、PWA／一般瀏覽器、線上／離線回歸矩陣及其餘項目均已通過。
  - [x] ✅ 已覆驗本次修正：`08:00` 到達、`06:00` 離開會阻擋儲存；格式錯誤提示不再以全形冒號時間作為範例。
- [ ] V3.6.0：地點間預估移動資訊已於 2026-08-30 發布；完整角色矩陣、正式站 OAuth 自動化登入與 Android／iOS 實機仍待發布後補驗證。
  - [x] 已完成 UI 方向與正式文案確認：卡片「在地圖中查看」、路線面板「使用 Google Maps 查看路線」、地點確認「保留原設定地點」。
  - [x] 已完成 Place ID、永久交通方式偏好、交通結果、時間警告與 30 天快取失效的前端型別及純函式；過期後保留區段並顯示「路線資訊待更新」。
  - [x] route cache／每日 100 次配額 migration 已套用正式 Supabase；`020`、advisors、migration history 與 dry-run 已通過，Edge Function 已部署且保持 JWT 驗證。
  - [x] 已接上按需地點搜尋、相鄰卡片交通區段、三種交通方式、Google Maps 外部路線及時間警告 UI。
  - [x] 已補強離線過期資料清除、同地點排除、Edge Function 日期／時間／Place ID 驗證及可獨立執行的格式測試。
  - [x] 2026-08-30 已核對 Google Cloud：Places API (New)、Routes API、同一把 Server Key 的兩項 API 限制、每日 50／每分鐘 10 的初始查詢配額，以及每月 US$5 的 50%／90%／100% 預算警示均有效。
  - [x] 以正式 Google Maps API key 完成 `localhost:4173` 的 Routes 整合驗證；正式 Console 亦已有 Places 成功請求紀錄，瀏覽器 bundle／Network 未洩漏 key。
  - [x] 已執行資料庫 advisors、`020`、migration history 與 dry-run；V3.6.0 新增物件沒有警告，既有 Auth／checklist advisor 項目另行追蹤。
  - [ ] 補驗證 Guest／User／其他 Trip editor／所屬 Trip editor／super_admin 的完整電腦版整合、權限與付費 API 邊界回歸；目前已有 Guest 顯示、super_admin 成功查詢與未登入 401 證據。
  - [x] 2026-08-29 決定因目前沒有 staging，採正式環境受控發布；先完成電腦版整合與角色 smoke test，通過後才發布前端。
  - [ ] 發布後補驗證 Android／iOS 手機版面、PWA、外部開圖、離線與重新連線；未取得設備時保留為未驗證。
  - [x] 已建立《21_V3.6.0_發布前測試與正式發布流程》，記錄完整測試、候選版、正式 migration、Edge Function、smoke test、前端發布與停止原則。
  - [x] 候選程式 `3e89cbc` 已合併至 `main`（`0cce637`），建立 Git 版本標籤 `v3.6.0` 並部署；正式 `app-version.json`、V3.6.0 Service Worker 接管、版本顯示、Guest 行程及已存路線均已通過。
  - [ ] 正式站 Google OAuth 本次自動化點擊未完成跳轉；既有 OAuth 設定未修改，`localhost:4173` 已登入驗證，正式站登入列為發布後補驗證。
- [ ] V3.6.1：Android 記帳金額欄位與 PWA 更新流程修正已於 2026-09-01 發布；保留跨平台補驗證與更新效能檢查。
  - [x] 確認 Android Chrome 網頁版與 PWA 聚焦新增金額欄位後會超出卡片右側；桌面目前未重現，iOS 狀態未知。
  - [x] 原因定位為幣別／金額 `flex` 列未限制數字輸入欄位的最小寬度，Android 原生控制項的內在寬度撐破容器。
  - [x] 新增表單改為幣別欄＋`minmax(0, 1fr)` 金額欄，補齊寬度限制並統一不改變版面的聚焦提示。
  - [ ] 同步覆驗既有帳目編輯金額列、所有幣別、長數字、附件與付款人操作。
  - [x] 確認手機與桌面第一次點擊「馬上更新」便提前結束、第二次才執行的原因，是 `registration.update()` 完成檢查時新版 Service Worker 尚未完成下載，程式卻立即以 `workerReadyRef` 判定尚未就緒；背景完成 `onNeedRefresh` 後第二次點擊才具備接管條件。
  - [x] 更新流程改為在單次按鈕操作內等待新版 Service Worker 進入可接管狀態，再沿用既有 `controllerchange`、單次重載及自動重送保護完成更新；逾時或失敗時保留提示與明確重試訊息。
  - [x] Android 手機由 V3.6.0 更新至 V3.6.1，第一次點擊即可完成更新，不需第二次點擊。
  - [x] Android 手機記帳金額輸入欄位實機驗證通過，不再變形或超出畫面。
  - [ ] 補驗 iOS 手機與桌面瀏覽器／PWA 的單次更新、提示消失、頁面載入及無空白頁／重複重載。
  - [ ] 完成 Android Chrome／PWA、iOS Safari／standalone PWA、桌面瀏覽器／PWA 版面與功能矩陣。
  - [x] `npm run lint`、`npm run build`、PWA build 與瀏覽器安全驗證通過。
  - [x] 2026-09-01 已完成合併、建立 Git 版本標籤 `v3.6.1`、部署與正式版本文件更新。
  - [ ] 量測有更新時的新版下載、Service Worker 接管、reload 與 App 初始化耗時，定位使用者介面重新顯示體感偏慢的階段後再決定是否修正。
- [x] V3.6.2：行程天數縮短刪除與歷史行程鎖定（開發、migration、驗證、Git 版本標籤與手動部署已完成；發布狀態為「已發布」）。
  - [x] 確認縮短天數採直接永久刪除，不封存、不建立復原區。
  - [x] 確認支援一次縮短任意 N 天，二次確認須逐 Day 顯示將刪除的行程卡片與路線資訊數量。
  - [x] 確認行程最後一天後的翌日 `00:00` 起，依台灣時間將 `trip_editor` 的整個歷史行程共用資料設為全面唯讀；`super_admin` 保留完整修改權。
  - [x] 確認使用者介面的 `super_admin` 一律顯示為「管理者」。
  - [x] 確認直接刪除、N 天影響摘要與二次確認只針對行程天數變動；其他欄位及刪除整個行程不新增本次確認，並依歷史／非歷史角色規則執行。
  - [x] Product Owner 核准縮短確認與歷史角色提示模擬圖；除本版必要 UI 外不調整既有畫面。
  - [x] Product Owner 確認 V3.6.2 採必要更新；正式 metadata 為 `minimumSupportedVersion: 3.6.2`，並保留 `forceUpdate: true` 供舊版 App 橋接。
  - [x] 實作縮短影響統計、可捲動的多 Day 二次確認，以及確認後一次刪除所有超出天數的 `daysData`。
  - [x] 歷史行程的 `trip_editor` 停用所有共用資料管理與編輯入口並顯示完整唯讀說明；仍可查看完整雲端共用資料。
  - [x] 建立 Supabase migration，在 Trip、共同清單、共同帳本、換匯紀錄、其他資訊與共同帳本附件政策中，以台灣日期阻擋歷史行程 `trip_editor` 寫入；`super_admin` 保留原有權限。
  - [ ] 發布後補驗縮短 1 天、縮短多天、移除空白 Day、移除有卡片／路線 Day、取消確認、增加天數、歷史角色矩陣、離線與同步失敗。
  - [x] lint、build、V3.6.2 純函式、migration 靜態驗證及已連結資料庫角色 SQL 已通過。
  - [x] App 版本、公開 metadata、版本歷史與發布說明已完成 V3.6.2 必要更新正式設定並完成部署。
  - [x] Product Owner 已完成合併至 `main`（`e9333f5`）、建立並推送 Git 版本標籤 `v3.6.2`、手動部署及發布完成回報。
  - [ ] 完成發布後桌面、Android／iOS PWA 實機矩陣並記錄結果。
- [ ] V3.7.0：當日後續行程時間連動調整（2026-08-31 開發內容與細節已定案，可進入實作）。
  - [x] 完成版本範圍、互動流程、權限、文案、計算規則、警告層級、批次儲存與非本版範圍定案。
  - [x] 採 Day 管理中的單次「調整時間」模式；一般卡片儲存不自動觸發連動。
  - [x] 文案確認：「調整時間」、「從這站開始」、「退出」、「取消調整」、「套用調整」。
  - [x] 逐行預覽須在景點間顯示交通方式、約略時間及距離，不重複完整卡片。
  - [x] 交通圖示採自託管 Google Material Symbols `directions_car`、`directions_walk`、`directions_transit`，保留文字與可存取名稱。
  - [x] 保留各站原停留時間；路線／時間異常停止計算，整批成功才寫入，不允許部分更新。
  - [x] 每站推算到達時間無條件進位至下一個 30 分鐘刻度；剛好為 `00` 或 `30` 分時維持原值，再從進位後時間加上原停留時間。
  - [x] 已製作互動模擬，確認模式入口、逐行預覽、交通區段、按鈕文案與跨午夜警告。
  - [ ] 實作時補齊錯誤聚焦狀態，且不得破壞既有 iOS viewport／縮放修正。
  - [ ] 實作純函式計算、批次儲存、競態／離線保護與完整測試矩陣。

### V3.5.1 已確認新增功能（App 分享）

- [x] 頁首於既有關閉按鈕左側新增小型分享圖示；既有 App 文案與小圖示未變動。
- [x] 浮動視窗顯示本專案圖示、首頁超連結與分享連結；系統原生分享面板依平台以 App 圖示清單呈現，超出時由原生面板滑動。
- [x] 原生分享由使用者選擇通訊軟體頻道或其他系統分享目標；未新增「更多」按鈕。
- [x] 保留原本關閉按鈕，點擊後返回當下 App 主畫面；未建立單一 Trip 分享網址。

### V3.5.1 待修正開發（跨裝置即時刷新）

- [x] 監聽 `other_info_items` 針對目前 `trip_id` 的 Supabase Realtime 事件，涵蓋新增、修改及軟刪除（UPDATE）。
- [x] 監聽 shared `checklists`（`trip_id`、`scope = shared`）及 `checklist_items`（shared checklist ID）的 Supabase Realtime 事件，涵蓋新增、修改、勾選、刪除／軟刪除與排序。
- [x] 收到事件後以 RLS-safe query 重新載入目前行程資料，不直接採用事件 payload。
- [x] 保留 focus／visibility／reconnect 重新載入備援，且 pending／本機 cloud write 期間略過遠端刷新。
- [x] 以兩個不同帳號同時編輯共同清單，最後成功雲端寫入狀態會成為最新資料，完成同步後不回滾；不新增衝突 UI。
- [x] Realtime publication migration 已於正式 Supabase 套用並驗證；Codex 內建瀏覽器與電腦桌面版 PWA 雙端在同步完成後均於 1 秒內顯示更新，跨裝置即時刷新回歸通過，既有 `trip_editor`／`super_admin` 權限矩陣不變。

### V3.5.1 Storage 驗證

- [x] 已建立 private bucket／Storage RLS migration、路徑檢查及 15 分鐘簽名網址檢查。
- [x] `npm run lint`、`npm run build` 與 release history 驗證已通過。
- [x] 正式 Supabase migration 已套用並驗證：private bucket、1 MiB／MIME 限制、四項 Storage RLS policy、三張 Realtime publication table 與 migration history 均正確；既有附件物件為 0。
- [x] BUG027 含中文舊 Trip ID 的附件 key 修正已套用正式 Supabase；UTF-8 hex scope 函式與四項 Storage RLS policy 已驗證。
- [x] 以宜蘭行程的兩筆既有失敗照片按「同步照片」回歸，兩筆均成功上傳。
- [x] 以 anon、其他 Trip editor、所屬 Trip editor、super admin 完成 Storage RLS 回歸（2026-08-26）：以自動 ROLLBACK 的遠端資料庫交易模擬 JWT／Postgres role；讀取／簽名可見性、上傳與更新均符合預期，刪除 policy 已驗證存在。直接 SQL 刪除由 Supabase `protect_objects_delete` 內建觸發器禁止，實際刪除須經 Storage HTTP API 與登入 session 執行。

### V3.5.1 補充實機權限回歸

- [x] Guest、User 的相關操作介面依權限阻擋。
- [x] `trip_editor` 無法建立行程，且只能修改被授權的行程。

## 跨版本待驗證／改善

- [ ] 評估離線刷新約 30 秒才載入既有資料的效能改善。
- [ ] 評估帳本附件管理體驗。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊及外幣換算，不共用單一合併策略。
