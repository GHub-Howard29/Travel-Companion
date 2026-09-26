# 待辦事項

> 本文件只保留未完成、待補驗或待評估工作；不累積 `[x]` 歷史。
>
> 目前狀態以《[14_專案現況總覽](14_專案現況總覽.md)》為準。最後整理：2026-09-26。

## 後續候選版本

- [x] V3.9.13：2026-09-26 正式發布完成。Cloud Translation API、專用 Translation Key、Supabase Secret 與硬性 Quota（14,000 字元／日、15,000 字元／分鐘、v2 60 requests／分鐘）均已就緒；V3.9.13 migration 與 batch session 外鍵索引已正式套用，`travel-route` v16 已部署。完整 production build、V3.9.13 專屬驗證、TypeScript、瀏覽器安全、lint、文件連結、本機 Supabase full regression 與 desktop／390×844 RC Browser 回歸均通過。正式 GitHub Pages 已發布，公開 metadata 為 3.9.13、fresh-load bundle 為 `index-w_GCmHOi.js` 且 UI 顯示 v3.9.13；發布合併提交 `bad4361`、annotated tag `v3.9.13`、gh-pages 提交 `8bd8e35` 均已推送。既有 PWA session 可能先由舊 Service Worker 載入上一版 bundle，屬正常更新接管場景；fresh-load smoke 已通過。維持既有定案範圍，不併入 BUG012／BUG032／BUG033。
- [ ] V3.9.14：修正 BUG012 多人帳本 Realtime 即時同步與 BUG033 個人／共用帳本文案。保留既有 30 秒輪詢備援；驗收需以兩設備同 Trip 帳本同畫面確認新增／刪除可即時反映，並回歸有／無共用帳本權限的文案。
- [ ] V3.9.15：修正 BUG032 行程照片離線預載。以「已載入 Trip 的目前行程卡片實際使用照片」為預載範圍，不預載 Commons 搜尋候選；預載失敗不得阻擋文字資料，並需控制重複下載、失效照片與儲存空間。

- [ ] V3.10.1：建立完整 build 的驗證群組與耗時基線，整併驗證入口與失敗報告，不縮減 release build；既有 V3.9.3 總啟動量測已確認存在，本版不重複新增程式內埋點。
- [ ] V3.10.2：沿用既有總啟動量測，分段量測離線冷啟動約 30 秒的 Service Worker、navigation、session、Trip 快取、localStorage、IndexedDB 與首個可操作畫面瓶頸，再依證據決定是否修正；不新增遠端 telemetry。
- [ ] V3.10.3：以 loopback fixture 與瀏覽器／viewport 模擬建立零費用 Playwright 響應式回歸基礎。
- [ ] V3.10.4：整理照片功能模組、型別邊界與按需載入，不新增圖庫來源。
- [ ] V3.11.0：只在需求證據足夠時重新評估使用紀錄；原逐次明細、Cron、獨立角色與 TOTP 仍為先前草案。

## 目前待修與待驗

- [ ] BUG012（V3.9.14）：修正多人帳本 Realtime 即時同步；A／B 同停留在同一帳本頁時，A 新增／刪除後 B 應即時反映。既有 30 秒輪詢備援目前正常，必須保留。
- [ ] BUG033（V3.9.14）：修正個人帳本文案；無共用帳本權限時不顯示「可代其他成員記帳」。
- [ ] BUG032（V3.9.15）：改善離線照片可用性；未事先逐一開啟的 Trip 目前離線後只有文字、沒有照片。
- [ ] 以目前正式版按風險補驗尚未被近期回歸直接覆蓋的舊功能：角色／歷史唯讀與撤權、路線付費 API／正式 OAuth／Android 外部開圖、單日／多日複製，以及離線／pending／跨裝置組合。iOS 依 Product Owner 指示暫不執行。

## Bug 與跨版本改善

- [ ] BUG007：確認帳本排序需求後再實作；目前仍為未修正。
- [ ] 只在實際需求存在時，重新排程全日時間預覽、路線批次重查、跨午夜與 API 成本控制。
- [ ] 收集帳本附件管理的具體問題與頻率，再決定功能範圍。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊與外幣換算，不共用單一合併策略。
