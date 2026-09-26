# 待辦事項

> 本文件只保留未完成、待補驗或待評估工作；不累積 `[x]` 歷史。
>
> 目前狀態以《[14_專案現況總覽](14_專案現況總覽.md)》為準。最後整理：2026-09-26。

## 後續候選版本

- [ ] V3.9.13：本機實作與正式後端前置均已完成。Cloud Translation API 已啟用，專用 Translation Key 已建立並限制 API 範圍，Supabase Secret 已設定；Google Cloud Translation Quota 已加上硬性保護：14,000 字元／日、15,000 字元／分鐘、v2 60 requests／分鐘。V3.9.13 主 migration 與 batch session 外鍵索引補充 migration 已正式套用，`travel-route` v16 已部署。正式 App 授權 smoke 已確認分類原文＋繁中與 `google-nmt` fallback 快取正常。已升版為 V3.9.13 release candidate；完整 production build、V3.9.13 專屬驗證、TypeScript、瀏覽器安全、lint 與文件連結均通過，dist metadata 已確認為 3.9.13。本機 Supabase full regression 已於 2026-09-26 通過；先前失敗原因並非未安裝 Docker，而是 OpenChatX bash 未繼承 Windows User／Machine PATH。以單次 shell 合併 Windows PATH 後，Node 22.23.2、npx、Docker 29.8.0 與 Supabase local 均正常，並已套齊本機 V3.9.11～V3.9.13 migrations；regression skill 也已更新為 V3.9.13 batch v2 loopback 邊界，不再測已停用的 commonsPrecisionSearch fixture。正式後端 smoke 亦已通過。RC Browser 回歸已完成：desktop 與 390×844 的正式設定照片 dialog 無水平溢出，Commons／自行上傳來源、預填搜尋詞、1 字搜尋停用、dialog ARIA／focus trap 與 loopback batch-v2 邊界均通過，且未送出 Wikimedia／Google 請求。自動化環境對開窗後初始 focus 的觀察不穩定，但 focus-return 程式與 V3.9.12 相同，關窗可回到原設定照片按鈕；不視為 V3.9.13 regression。下一閘門為前端部署／正式發布；尚未部署 GitHub Pages、合併 main、建立 tag 或正式發布。維持既有定案範圍，不併入 BUG012／BUG032／BUG033。
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
