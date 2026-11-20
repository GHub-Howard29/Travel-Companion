# ADR-001-S2：Cloud Save 整合與 Repository 接線


### Save RPC 整合架構審查紀錄（2026-11-20）

本輪核對既有 migration／trigger 契約，確認：

- V3.5.2 database function hardening 已建立 private schema helper、API role 權限撤銷、固定空 search_path 與 public tc_ SECURITY DEFINER 禁止基準；新 RPC／helper 不得降低此基準。
- V3.6.2 historical Trip trigger 是既有 shared-data 寫入限制，依 stored Trip 與 authenticated role判定；Save RPC 不得以 SECURITY DEFINER、Lease 或受控授權豁免此限制。
- itinerary history trigger 在 content 更新時精準比較 daysData，並使用 advisory transaction lock及歷程保存；RPC 必須正常經過此 trigger，不得停用／bypass。
- visibility/email-map trigger亦會在 trips 更新時執行。Save RPC只更新 daysData並以DB當下content精準替換，需保留此trigger契約與其拒絕／正規化行為。
- 既有歷史限制與其他欄位trigger屬各自原有資料安全／功能契約，不等同將其他功能納入 Trip Edit Lock；ADR-001的鎖仍只保護每日詳細行程。

**整合方案補充（審查基準，非實作授權）：** Save RPC須在同一交易中依固定順序鎖定及驗證 Lease、version，之後更新 Trip 的 daysData，讓既有 Trip row locking、history trigger/advisory lock及其他 trigger自然執行；失敗一律交易rollback。所有新增SECURITY DEFINER入口需空 search_path、schema-qualified reference、明確REVOKE／GRANT，且不得直接暴露私有helper。正式驗收仍須驗證實際Supabase role／auth context及兩個獨立Auth context。

**本輪結論：** 未發現需變更ADR-001核心決策的證據；上述既有Trigger契約已明確列入Save RPC整合驗收。尚未進行正式RPC或正式資料庫實作。

詳見文件 116 的 SR-01 至 SR-12 Acceptance Matrix 與施工藍圖；此處只保留 Cloud／Repository 接線的階段進入及退出條件。