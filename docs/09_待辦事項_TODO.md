# 待辦事項

> 本文件只保留未完成、待補驗或待評估工作；不累積 `[x]` 歷史。
>
> 目前狀態以《[14_專案現況總覽](14_專案現況總覽.md)》為準。最後整理：2026-09-25。

## 後續候選版本

- [ ] V3.9.12 已發布待補驗：由 Product Owner 以完成 PWA 接管的正式登入驗證廣泛搜尋、類別、類別內續載與外部連結返回 Day 保留；不得以 loopback fixture 取代真實 Wikimedia 驗證。

- [ ] V3.10.1：建立完整 build 的驗證群組與耗時基線，整併驗證入口與失敗報告，不縮減 release build；既有 V3.9.3 總啟動量測已確認存在，本版不重複新增程式內埋點。
- [ ] V3.9.13：沿用既有總啟動量測，分段量測離線冷啟動約 30 秒的 Service Worker、navigation、session、Trip 快取、localStorage、IndexedDB 與首個可操作畫面瓶頸，再依證據決定是否修正；不新增遠端 telemetry。
- [ ] V3.9.14：以 loopback fixture 與瀏覽器／viewport 模擬建立零費用 Playwright 響應式回歸基礎。
- [ ] V3.9.15：整理照片功能模組、型別邊界與按需載入，不新增圖庫來源。
- [ ] V3.11.0：只在需求證據足夠時重新評估使用紀錄；原逐次明細、Cron、獨立角色與 TOTP 仍為先前草案。

## 已發布版本待補驗

- [ ] V3.9.11：Android／iOS 實機確認 Commons 候選分層、既有排列與 PWA 更新；自行上傳實際選檔驗證依 Product Owner 指示不列入本次發布門檻。桌面與 390×844 本機瀏覽器候選版、loopback Edge、完整 build 及單次外部矩陣已通過。
- [ ] V3.9.11 backend hotfix：正式資料庫已套用 `20260925140400_v3911_commons_precision_lock_v2.sql` 與 `20260925142112_v3911_commons_precision_cache_keys_v2.sql`，待 Product Owner 以正式登入手動搜尋照片確認 v2 lock／cache key 修正生效。

- [ ] V3.9.10：Android／iOS 實機確認照片卡片只顯示來源原處連結、其他資訊捷徑緊鄰「查看地圖」且整組靠右，以及 PWA 由既有 Service Worker 更新至 V3.9.10；桌面與 390×844 本機瀏覽器候選版已通過。
- [ ] V3.9.9：Android／iOS 實機以 V3.9.8 前既有快取確認卡片可安全儲存，並以第二台裝置真正修改 Trip 本體時確認仍會阻擋覆蓋；loopback 合成 fixture 的舊時間戳自癒與衝突保護已通過。
- [ ] V3.9.8：Android／iOS 實機確認有／無照片行程卡片的管理按鈕位置、其他資訊根／子分類捷徑與單次 Enter 儲存後斷行；其他資訊待同步後的行程儲存由 V3.9.9 向前修正並已完成 loopback 回歸。
- [ ] V3.8.2：Android／iOS 實體裝置安裝／更新、Service Worker 接管、正式管理者單日／多日複製及多裝置版本衝突。
- [ ] V3.8.1：Android／iOS 實體裝置、PWA 冷啟動離線及舊版實機必要更新流程。
- [ ] V3.8.0：Guest、User、`trip_editor`、`super_admin`、歷史行程、離線阻擋、跨裝置衝突與實機必要更新。
- [ ] V3.6.0 路線功能：完整角色與付費 API 邊界、正式站 OAuth、Android／iOS 外部開圖、離線與重新連線。
- [ ] V3.6.1～V3.6.5：iOS、Android 與雙裝置的單次更新、版面、版本資訊、歷史唯讀、撤權、離線、pending 與跨裝置。
- [ ] V3.7.0：桌面、Android PWA、iOS Safari／standalone、實際大眾運輸班次及跨裝置競態。
- [ ] iOS Safari／standalone PWA：Google OAuth、啟動畫面、管理欄位縮放、外部連結、附件拍照／相簿、更新提示、離線與同步。

## Bug 與跨版本改善

- [ ] BUG007：確認帳本排序需求後再實作；目前仍為未修正。
- [ ] BUG003、BUG006、BUG008～BUG015、BUG018：完成《[03_Bug修正紀錄](03_Bug修正紀錄.md)》列出的實機或情境補驗。
- [ ] 只在實際需求存在時，重新排程全日時間預覽、路線批次重查、跨午夜與 API 成本控制。
- [ ] 收集帳本附件管理的具體問題與頻率，再決定功能範圍。
- [ ] 依資料特性評估將保守聯集合併導入其他資訊與外幣換算，不共用單一合併策略。
