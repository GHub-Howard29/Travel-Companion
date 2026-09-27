# 待辦事項

> 本文件只保留未完成、待補驗或待評估工作；不累積 `[x]` 歷史。
>
> 目前狀態以《[14_專案現況總覽](14_專案現況總覽.md)》為準。最後整理：2026-09-27。

## 後續候選版本

- [x] V3.9.13：2026-09-26 正式發布完成。Cloud Translation API、專用 Translation Key、Supabase Secret 與硬性 Quota（14,000 字元／日、15,000 字元／分鐘、v2 60 requests／分鐘）均已就緒；V3.9.13 migration 與 batch session 外鍵索引已正式套用，`travel-route` v16 已部署。完整 production build、V3.9.13 專屬驗證、TypeScript、瀏覽器安全、lint、文件連結、本機 Supabase full regression 與 desktop／390×844 RC Browser 回歸均通過。正式 GitHub Pages 已發布，公開 metadata 為 3.9.13、fresh-load bundle 為 `index-w_GCmHOi.js` 且 UI 顯示 v3.9.13；發布合併提交 `bad4361`、annotated tag `v3.9.13`、gh-pages 提交 `8bd8e35` 均已推送。既有 PWA session 可能先由舊 Service Worker 載入上一版 bundle，屬正常更新接管場景；fresh-load smoke 已通過。維持既有定案範圍，不併入 BUG012／BUG032／BUG033。
- [x] V3.9.14：2026-09-27 正式發布完成。修正 Wikimedia Commons 廣泛搜尋排名與類別候選完整度；一般搜尋保留 Wikimedia `index` 相關性順位，類別搜尋納入符合歸屬條件的 CC BY-SA。完整 production build、瀏覽器安全與正式站實機回歸通過；`travel-route` v19、GitHub Pages、`origin/main` 合併提交 `e93d108` 與 annotated tag `v3.9.14` 均已發布。
- [x] V3.9.15：2026-09-27 正式發布完成。BUG012 多人帳本 Realtime 已修正，`expenses` 已加入 Supabase Realtime publication，保留 30 秒輪詢備援；兩個獨立瀏覽器頁面同 Trip 帳本新增約 1.0 秒同步、刪除約 0.65 秒同步。BUG033 個人／共用帳本文案已修正；手機照片裁切二次畫面與 modal 背景捲動鎖定已於 390×844 正式站驗證通過。發布合併提交 `278e544`、annotated tag `v3.9.15`、GitHub Pages metadata/UI 3.9.15 與 production migration 均已完成。
- [x] V3.9.16：2026-09-27 正式發布完成。USER 個人帳本本機代號流程與 BUG032 行程照片離線預載均完成實作與實機驗證；USER 首次登入設定代號、登出再登入不重複詢問、代號修改入口均通過。正式 Trip 16 張已選用照片背景預載 16/16，手機實體飛航模式切換其他日期照片正常；離線 revision 不再誤報「行程資料已有更新」，個人帳本記帳後也不再跳 alert，改為常駐本機保存／備份提醒。完整 production build、PWA、browser-security 與專屬 regression 均通過；發布合併提交 `f042593`、annotated tag `v3.9.16`、GitHub Pages `b0d637a`。

- [ ] V3.9.17：RC1 實機驗收發現 Change Journal revision 邊界誤把基準版計入、共同／私人清單與帳本被錯納 Trip reload 邏輯、行程刪除 UI 被照片清理阻塞、共同／私人清單跨裝置結構同步不完整、Other Info soft-delete 不會在另一端消失，以及手機分類 `datalist` 在 Android／iOS 體驗不佳。RC2 已完成本機修正：Change Journal 改為只包含 itinerary／photo／Trip settings 並以 `revision > fromRevision` 查詢；共同／私人清單、帳本、Other Info、外幣換算改回各自同步；行程刪除先更新本機 UI、照片清理背景化；共同／私人清單補強 Realtime；Other Info 改由 cloud active rows 作為權威資料；共同清單分類改為原生 `<select>` +「新增分類」。新增 migration `20260927193000_v3917_rc2_sync_boundaries.sql`，會替 `checklist_items` 加入 category、回填既有分類、移除 checklist/expense Change Journal trigger 與舊 journal 紀錄，並把 journal category constraint 收斂為 itinerary/photo/settings。RC2 專屬 regression、TypeScript、lint、完整 production build、PWA、browser-security 全部通過；`supabase db push --dry-run` 確認只會套用此一 migration。RC2 migration `20260927193000_v3917_rc2_sync_boundaries.sql` 已成功套用正式 Supabase；`checklist_items.category` 已建立且既有 shared active rows 無空分類，checklist/expense journal triggers 已移除，現有 Change Journal 僅剩 itinerary/photo 類別。RC2 已部署 GitHub Pages（gh-pages `dbfd254`），fresh-load 以 bypass Service Worker + ignore cache 驗證 UI 為 `v3.9.17`。RC2 雙裝置實機驗收再發現同步方向不對稱：共同清單 A/B 新增可能被舊 pending/seed 狀態擋住或先顯示錯分類；私人清單 B→A 新增／刪除需重新聚焦；Other Info／領隊資訊 B→A soft-delete 甚至 F5 後仍可能殘留。RC3 已完成本機修正：共同清單 Realtime refetch 不再被舊 pending order/progress 阻擋；私人清單 Realtime 不再因 pending revision 全面跳過；Other Info pending 改為只追蹤本次實際變更 item IDs，成功寫入後立即以雲端 active rows 覆蓋本機快取，舊版無 itemIds 的 pending 不再整包回寫，避免復活另一裝置已刪除資料。RC3 專屬 regression、TypeScript、lint、完整 production build、PWA、browser-security 全部通過；RC3 不需要 DB migration。RC3 已部署 GitHub Pages（gh-pages `481603e`），fresh-load 以 bypass Service Worker + ignore cache 驗證 UI 為 `v3.9.17`。RC3 雙裝置實機驗收已通過：A=電腦、B=手機下，共同清單、私人清單、領隊資訊／其他資訊三組皆完成雙向新增與雙向刪除測試，均可即時雙向同步且結果一致。下一步回到 V3.9.17 Change Journal 摘要與其餘發布前驗收。
- [ ] V3.10.1：建立完整 build 的驗證群組與耗時基線，整併驗證入口與失敗報告，不縮減 release build；既有 V3.9.3 總啟動量測已確認存在，本版不重複新增程式內埋點。
- [ ] V3.10.2：沿用既有總啟動量測，分段量測離線冷啟動約 30 秒的 Service Worker、navigation、session、Trip 快取、localStorage、IndexedDB 與首個可操作畫面瓶頸，再依證據決定是否修正；不新增遠端 telemetry。
- [ ] V3.10.3：以 loopback fixture 與瀏覽器／viewport 模擬建立零費用 Playwright 響應式回歸基礎。
- [ ] V3.10.4：整理照片功能模組、型別邊界與按需載入，不新增圖庫來源。
- [ ] V3.11.0：只在需求證據足夠時重新評估使用紀錄；原逐次明細、Cron、獨立角色與 TOTP 仍為先前草案。

## 目前待修與待驗

- [x] BUG012（V3.9.15）：多人帳本 Realtime 即時同步已完成；`expenses` Realtime publication、事件後重新抓取與 30 秒輪詢備援均已驗證。
- [x] BUG033（V3.9.15）：個人／共用帳本文案條件已修正；只有共用帳本且存在其他成員可代記帳時顯示提示。
- [x] Mobile Crop UI（V3.9.15）：手機照片裁切二次畫面已改為滿高 modal，裁切區限制垂直尺寸、縮放控制不橫向溢出、確認操作保持可見，且開啟照片 modal 時底層行程頁不再跟著捲動。
- [x] USER Personal Alias（V3.9.16）：ROLE.USER 個人帳本代號本機儲存、首次必填、同 Email 再登入沿用與 USER 專用修改入口已完成；實際 USER 首次登入設定、登出再登入不二次設定、代號修改入口均驗證通過。正式站 super_admin 亦確認不顯示該入口。
- [x] BUG032（V3.9.16）：已完成 RC 實作與正式站 cache smoke。Trip 在線載入後只預載目前行程卡片已選用照片；正式 Trip 16 張照片已預載 16/16，未先開啟的 D4 兩張照片在 CDP 離線網路下皆 Cache hit 200 且 WebP 640×640 解碼正常；實體飛航模式亦確認切換其他日期仍可看到照片。Service Worker 遠端檔案確認為 CacheFirst、總上限 250 張；照片更換與 Trip 刪除／撤權清理契約已納入 regression。
- [x] Offline Revision Notice（V3.9.16）：已修正離線或 revision/access 檢查失敗時將「無法確認遠端」誤設為 `available` 的問題；離線不再新增「行程資料已有更新」通知，既有已確認通知維持，恢復連線後再重新檢查。
- [x] Personal Book UX（V3.9.16）：個人帳本每筆記帳成功後不再跳出 alert；帳本頁固定顯示「個人帳本僅儲存在此裝置」、備份風險說明與「個人帳本・僅存本機」標籤。
- [ ] 以目前正式版按風險補驗尚未被近期回歸直接覆蓋的舊功能：角色／歷史唯讀與撤權、路線付費 API／正式 OAuth／Android 外部開圖、單日／多日複製，以及離線／pending／跨裝置組合。iOS 依 Product Owner 指示暫不執行。

## Bug 與跨版本改善

- [ ] BUG007：確認帳本排序需求後再實作；目前仍為未修正。
- [ ] 只在實際需求存在時，重新排程全日時間預覽、路線批次重查、跨午夜與 API 成本控制。
- [ ] 收集帳本附件管理的具體問題與頻率，再決定功能範圍。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊與外幣換算，不共用單一合併策略。
- [x] V3.9.17 Change Journal 第一版範圍已定案並進入實作：按鈕文案為「預覽變更」、頁面標題為「變更摘要」；只顯示分類與數量，不做完整細節差異。
