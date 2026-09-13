# 待辦事項

> 本文件只保留尚未完成或仍需驗證的工作；版本順序與範圍以《02_產品開發路線圖》為準。
>
> 最後更新：2026-09-14
>
> 已發布 App 版本：V3.9.0。

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
- [ ] V3.9.1 子方案 A：中文搜尋自動擴充英文關鍵詞；討論詞彙來源、雙語結果合併去重、專有名詞、失敗降級、成本及提示文案。
- [ ] V3.9.1 子方案 B：Commons／Pexels／Pixabay 來源切換；討論來源切換、重新搜尋、換一批、API 額度、快取、授權與保存規則。
- [ ] V3.9.1 子方案 C：已確認 MAP 地點脈絡輔助搜尋；評估以保存的 `placeId` 暫態取得正式／英文名稱、城市／國家與座標，組合 Commons 文字及鄰近搜尋。後續須實測命中率，並計算 Place Details 欄位／SKU、每次搜尋與換批請求數、月額度及最壞成本；討論完成前不得實作或擴增正式 API 呼叫。
- [ ] V3.9.1 Commons 搜尋提示修正：首次搜尋零結果應提示調整關鍵字；只有執行過「換一批」且該批經 `fileTitle` 去重後沒有新候選，才顯示本批無新照片。開發前須確認去重紀錄範圍、換詞／重開重置時機與三種無結果狀態文案。
- [ ] V3.9.1 地點／照片介面：Google Maps 連結須另開候選地點的實際 Maps 地點頁，不得沿用照片層級 `photo.googleMapsUri`；文案改為「在 Google Maps 查看地點資訊」。MAP 候選不理想時顯示已核准的調整地點關鍵字提示；Commons 每批候選由 8 張改為 6 張，前後端分頁、去重、測試及桌面／390×844 必須同步驗證。尚未核准實作。
- [ ] V3.9.1 共同停止條件：三個子方案獨立追蹤、互不取代；各自規格定稿並經 Product Owner 核准前，禁止程式實作、正式 API 呼叫擴增、API key 建立、UI 設計及模擬圖製作。詳見《48_V3.9.1_每日行程照片來源擴充規劃草案》。
- [ ] V3.10.0：重新確認使用紀錄的必要性與最小資料範圍；原 App 查詢介面、逐次明細、Cron、獨立角色與 TOTP 預覽均標記為先前草案、尚未定案。

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
- [ ] 先量測離線刷新約 30 秒才載入既有資料的原因，再決定是否開發效能改善。
- [ ] 收集帳本附件管理的具體操作問題與頻率，再決定功能範圍。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊及外幣換算，不共用單一合併策略。
