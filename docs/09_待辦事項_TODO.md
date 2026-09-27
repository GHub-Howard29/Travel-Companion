# 待辦事項

> 本文件只保留未完成、待補驗或待評估工作；不累積 `[x]` 歷史。
>
> 目前狀態以《[14_專案現況總覽](14_專案現況總覽.md)》為準。最後整理：2026-09-27。

## 後續候選版本

- [x] V3.9.13：2026-09-26 正式發布完成。Cloud Translation API、專用 Translation Key、Supabase Secret 與硬性 Quota（14,000 字元／日、15,000 字元／分鐘、v2 60 requests／分鐘）均已就緒；V3.9.13 migration 與 batch session 外鍵索引已正式套用，`travel-route` v16 已部署。完整 production build、V3.9.13 專屬驗證、TypeScript、瀏覽器安全、lint、文件連結、本機 Supabase full regression 與 desktop／390×844 RC Browser 回歸均通過。正式 GitHub Pages 已發布，公開 metadata 為 3.9.13、fresh-load bundle 為 `index-w_GCmHOi.js` 且 UI 顯示 v3.9.13；發布合併提交 `bad4361`、annotated tag `v3.9.13`、gh-pages 提交 `8bd8e35` 均已推送。既有 PWA session 可能先由舊 Service Worker 載入上一版 bundle，屬正常更新接管場景；fresh-load smoke 已通過。維持既有定案範圍，不併入 BUG012／BUG032／BUG033。
- [x] V3.9.14：2026-09-27 正式發布完成。修正 Wikimedia Commons 廣泛搜尋排名與類別候選完整度；一般搜尋保留 Wikimedia `index` 相關性順位，類別搜尋納入符合歸屬條件的 CC BY-SA。完整 production build、瀏覽器安全與正式站實機回歸通過；`travel-route` v19、GitHub Pages、`origin/main` 合併提交 `e93d108` 與 annotated tag `v3.9.14` 均已發布。
- [x] V3.9.15：2026-09-27 正式發布完成。BUG012 多人帳本 Realtime 已修正，`expenses` 已加入 Supabase Realtime publication，保留 30 秒輪詢備援；兩個獨立瀏覽器頁面同 Trip 帳本新增約 1.0 秒同步、刪除約 0.65 秒同步。BUG033 個人／共用帳本文案已修正；手機照片裁切二次畫面與 modal 背景捲動鎖定已於 390×844 正式站驗證通過。發布合併提交 `278e544`、annotated tag `v3.9.15`、GitHub Pages metadata/UI 3.9.15 與 production migration 均已完成。
- [ ] V3.9.16：RC 已部署 GitHub Pages。USER 個人帳本本機代號流程與 BUG032 行程照片離線預載均已完成實作、lint/build/regression 與正式站 RC smoke；高權限正式站確認不顯示 USER 個人帳本代號入口。BUG032 正式 Trip 16 張已選用照片背景預載 16/16，未先開啟的 D4 兩張照片在離線網路模擬下 Cache Storage 均命中 200 且可解碼 640×640。封版前仍需實際 ROLE.USER 首次登入／修改代號驗收，以及實體安裝 PWA 的冷啟動離線視覺確認。

- [ ] V3.10.1：建立完整 build 的驗證群組與耗時基線，整併驗證入口與失敗報告，不縮減 release build；既有 V3.9.3 總啟動量測已確認存在，本版不重複新增程式內埋點。
- [ ] V3.10.2：沿用既有總啟動量測，分段量測離線冷啟動約 30 秒的 Service Worker、navigation、session、Trip 快取、localStorage、IndexedDB 與首個可操作畫面瓶頸，再依證據決定是否修正；不新增遠端 telemetry。
- [ ] V3.10.3：以 loopback fixture 與瀏覽器／viewport 模擬建立零費用 Playwright 響應式回歸基礎。
- [ ] V3.10.4：整理照片功能模組、型別邊界與按需載入，不新增圖庫來源。
- [ ] V3.11.0：只在需求證據足夠時重新評估使用紀錄；原逐次明細、Cron、獨立角色與 TOTP 仍為先前草案。

## 目前待修與待驗

- [x] BUG012（V3.9.15）：多人帳本 Realtime 即時同步已完成；`expenses` Realtime publication、事件後重新抓取與 30 秒輪詢備援均已驗證。
- [x] BUG033（V3.9.15）：個人／共用帳本文案條件已修正；只有共用帳本且存在其他成員可代記帳時顯示提示。
- [x] Mobile Crop UI（V3.9.15）：手機照片裁切二次畫面已改為滿高 modal，裁切區限制垂直尺寸、縮放控制不橫向溢出、確認操作保持可見，且開啟照片 modal 時底層行程頁不再跟著捲動。
- [x] USER Personal Alias（V3.9.16）：ROLE.USER 個人帳本代號本機儲存、首次必填、同 Email 再登入沿用與 USER 專用修改入口已完成實作與靜態 regression；正式站 super_admin 已確認不顯示該入口。實際 ROLE.USER 首次登入、二次登入沿用與修改入口仍待封版前帳號驗收。
- [x] BUG032（V3.9.16）：已完成 RC 實作與正式站 cache smoke。Trip 在線載入後只預載目前行程卡片已選用照片；正式 Trip 16 張照片已預載 16/16，未先開啟的 D4 兩張照片在 CDP 離線網路下皆 Cache hit 200 且 WebP 640×640 解碼正常。Service Worker 遠端檔案確認為 CacheFirst、總上限 250 張；照片更換與 Trip 刪除／撤權清理契約已納入 regression。剩餘為實體安裝 PWA 冷啟動離線視覺確認。
- [ ] 以目前正式版按風險補驗尚未被近期回歸直接覆蓋的舊功能：角色／歷史唯讀與撤權、路線付費 API／正式 OAuth／Android 外部開圖、單日／多日複製，以及離線／pending／跨裝置組合。iOS 依 Product Owner 指示暫不執行。

## Bug 與跨版本改善

- [ ] BUG007：確認帳本排序需求後再實作；目前仍為未修正。
- [ ] 只在實際需求存在時，重新排程全日時間預覽、路線批次重查、跨午夜與 API 成本控制。
- [ ] 收集帳本附件管理的具體問題與頻率，再決定功能範圍。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊與外幣換算，不共用單一合併策略。
