# Travel-Companion 決策總索引

本文件是持續有效工程決策與工作進度的唯一總入口。開始相關工作時先讀本索引，再讀本次相關 ADR 主檔及依目前階段／工作需求選出的附屬文件；不得全量載入所有 ADR／階段附件。索引只維護狀態、階段、下一步、阻塞、載入條件及連結，詳細內容與證據留在各權威文件。

**跨對話續行：** 新對話／Agent 看到此索引列有 Accepted／進行中工作時，應依其下一步直接恢復並執行未完成工作，不得只做 startup status、要求手動交接 UUID、重複規劃或重跑已完成切片。執行規則及權限界線見根目錄 [AGENTS.md](../../AGENTS.md)「跨對話未完成工作自動續行」。每個切片即時保存階段紀錄並同步本索引，讓 repository 成為可接續的工作狀態來源。

## 有效決策與進度

| ID | 決策／工作 | 狀態 | 目前階段 | 下一步／阻塞 | 權威主檔 |
|---|---|---|---|---|---|
| [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) | 每日詳細行程與編輯旅程共用 Trip Lease 的互斥編輯協調 | Accepted（決策持續有效）／Implementation Completed（2026-11-24） | **原 S1／S2／S3／S4 均 Exit PASS；2026-11-24 核准新增範圍亦完成實作、自動化驗證及使用者人工 UI 驗收，Exit PASS。** | **已結案，無待辦。實作結案不代表 Accepted 決策退休；如需修改，須先核准 ADR 修訂。歷史階段紀錄由 ADR-001 主檔連結至 `history/`。** | [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) |
| [ADR-002](active/ADR-002-card-save-screen-flicker.md) | 移除已淘汰的每日行程 Preview／通知／同步衍生機制，並修復卡片保存／畫面穩定性與登入身份生命週期 | **Accepted（既有 S1／S2 Implementation Completed）；BUG 1／2／3 前端局部修正已完成本機驗證（2026-11-27）；BUG 3 後端 keyed reservation 已 Accepted，實作進行中** | **已核准相同 route cache key 的資料庫期限 reservation：同 key 單一處理者、其他請求等待並重讀 cache；失敗釋放、逾時接手。** | **下一步：Route reservation migration／RPC、Edge handler 與 loopback PostgreSQL 獨立 session 併發／SQL regression 均已完成本機驗證；expiry constraint 缺陷已修正，V3.11.8 正式 migration 與 `travel-route` Edge Function 已部署。正式 route request caller（含 page／client、request body 與 panel lifecycle）歸因依使用者指示列為部署後待辦，不阻擋發布。BUG 2 真實 React Hook + isolated Supabase Auth／Lease／Save RPC 驗收及正式事件 caller 歸因仍為獨立待辦。** | [ADR-002](active/ADR-002-card-save-screen-flicker.md) |
| [ADR-003](active/ADR-003-weather-interval-forecast.md) | 行程卡片時間區段天氣預報（Interval V1） | **Accepted／Implementation Completed（V3.11.7 正式發布；2026-11-26）** | **A、B、C 全數 PASS（2026-11-26）。已驗證資料保護、APP → Edge → DB、時間修改／摘要重算、冷卻保護與自然恢復、Lease 收斂、Console／LocalStorage／UI 邊界；測試 Trip 已還原。Android standalone／實機操作移至部署後回歸。** | **V3.11.7 已正式部署：migration／Edge Function／GitHub Pages 及公開 smoke 均完成。正式登入 Session 天氣刷新與 Android standalone 實機更新接管列為部署後回歸。** | [ADR-003](active/ADR-003-weather-interval-forecast.md) |
| [ADR-004](active/ADR-004-other-info-mirrored-view-order.md) | 交通資訊映射至自駕須知與雙頁獨立排序 | **Accepted（2026-11-27）／V3.11.8 已部署；部署後缺陷修正本機完成、驗收未完成** | **原生自駕 folder 資料未顯示：正式 DB 原始資料仍存在；前端已修正納入原生資料與交通映射資料，契約／lint／build PASS。** | **待確認原生資料顯示組合是否在 ADR-004 Accepted 邊界內；並完成頁面顯示、排序、reload、跨裝置驗收。V3.11.8 其他部署後待驗項目仍未結案。** | [ADR-004](active/ADR-004-other-info-mirrored-view-order.md) |
| **[異常旅程資料修復](../09_待辦事項_TODO.md)** | **日本九州 Static Seed → 沖繩 Static→Dynamic** | **COMPLETED（2026-11-26）** | **九州及沖繩實機驗收全數通過：新增／刪除／編輯卡片、共用資料、私人資料、其他資料及帳本均正常；九州景點照片正常顯示。** | **已結案，無剩餘待驗項目。資料修正及文件均已同步 develop／main；四國相關正式旅程及 fixture 未觸碰。** | [TODO](../09_待辦事項_TODO.md) |

## ADR-002 階段與證據紀錄

| 紀錄 | 文件 | 狀態／用途 |
|---|---|---|
| V3.11.7 新事件調查與修正 | [新事件調查](active/ADR-002-V3.11.7-regression-investigation.md) | **BUG 1 Interval 天氣 target-level dedupe、BUG 2 Pending stale-queue guard、BUG 3 Route panel generation／舊 estimate 保留顯示已完成本機局部修正及自動化回歸；Other Info 敏感資料同步狀態提示及 folder 關鍵字誤搬修正均完成本機驗證（2026-11-27）。BUG 3 後端 keyed reservation 已 Accepted 並開始實作。** | **Other Info：程式根因為 `ensureSpecialInfoItems()` 以「租車／自駕」標題關鍵字搬動一般卡片；現已收斂為 canonical title 比對並通過完整 build。既有使用者資料是否需修復及端到端驗收仍待處理；先以隔離資料驗證 normalization，不直接改寫真實資料。此前 POST 201／GET 200 後資料列消失仍是另一獨立未知事件。Route reservation：migration／RPC、travel-route Edge handler、SQL regression 及 loopback PostgreSQL 獨立 backend 併發驗證均已完成本機驗證；expiry constraint defect 已修正，正式 route reservation migration 與 `travel-route` Edge Function 已隨 V3.11.8 部署。正式 Route POST caller 歸因依使用者指示列為部署後待辦；正式 Save／Weather caller 歸因仍是獨立缺口。** |
| S1 Preview／Journal 拆除與卡片穩定性 | [ADR-002-S1](history/ADR-002-S1-root-cause-investigation.md) | **已歸檔（2026-11-26）；Exit PASS。** 主要卡片穩定性修正及 Preview／Journal 拆除已隨 V3.11.5 發布；沒有現行 S1 待辦。 |
| S2 登入身份切換與登出生命週期 | [ADR-002-S2](history/ADR-002-S2-auth-workspace-lifecycle.md) | **已歸檔（2026-11-26）；Exit PASS（2026-11-25）。** Step 1–4 完成，S2-01～14 全數 PASS；不重跑。 |
| 新增／刪除畫面跳動影片分析 | [影片證據](history/ADR-002-video-analysis.md) | **已歸檔（2026-11-26）。** 保留影片抽幀、動態量測及程式因果鏈；不是現行待辦。 |

## ADR-003 階段入口

| 階段 | 文件 | 按需載入條件 |
|---|---|---|
| Interval V1 必要整合收尾與產品驗收 | [ADR-003](active/ADR-003-weather-interval-forecast.md)／[執行證據](../112_區段預報P0技術驗證與實作前檢查紀錄.md) §7.4 | A／B／C 均 PASS；V3.11.7 已正式發布。下一步僅保留正式登入 Session 天氣刷新與 Android standalone 實機更新接管回歸；不要擴大壓力／效能測試。 |

## 載入規則

1. 每次任務必讀本 README；依工作範圍只讀對應 ADR 主檔及必要的一份階段文件。
2. ADR 主檔保存 Accepted 決策與適用範圍；進行中的階段文件是該階段持續執行紀錄的唯一維護位置，保存工作進度、執行細節、測試證據摘要、PASS／FAIL／BLOCKED、未完成項及下一步。階段完成後可依核准將完整執行紀錄移入 `history/`；此歸檔不改變 ADR 決策狀態。文件 116 僅保存根因調查、呼叫鏈分析及原始／補充證據，不承擔日常階段進度管理。三者不得互相複製大段內容。
3. 不在當前工作範圍內的階段文件不得預先載入；只有跨階段依賴、必要權威規格或故障追查時才額外讀取。
4. 開始、完成階段工作或進度／阻塞／下一步變更時，更新當前階段文件及本 README；README 只寫狀態、當前階段、下一步、阻塞與連結，不寫技術細節。
5. 新 Accepted 決策／決策修訂必須同步更新對應 ADR 主檔及本索引；不能只改階段文件。**ADR 決策主檔**只有在使用者明確核准解除／取代，或原決策明定的客觀解除條件已有可驗證證據成立時，才可移入 history；階段執行紀錄則可在工作完成並經核准後歸檔，兩者不可混淆。所有移轉均須保留原文並更新受影響連結。
6. Proposed 不構成實作授權；Accepted 僅在其明確範圍內有效。若內容或範圍不清楚，先釐清，不自行擴張。
7. 每次寫檔後回讀主檔、受影響階段文件及索引，驗證連結與狀態一致。

## 既有領域權威來源

| 領域 | 權威文件 | 使用限制 |
|---|---|---|
| 架構／V3-1 決定 | [002 V3-1 Architecture Decisions](../002%20V3-1_Architecture_Decisions.md) | 僅適用該文件明定範圍；歷史狀態須連同後續規格核對 |
| 專案目前狀態與目標 | [14 專案現況總覽](../14_專案現況總覽.md) | 不替代功能規格 |
| 功能及產品規格 | [06 功能規格](../06_功能規格.md) 與 [docs README](../README.md) 所列領域權威文件 | 依工作範圍按需讀取 |
| 工程流程及文件治理 | [08 開發規範](../08_開發規範.md) 與根目錄 [AGENTS.md](../../AGENTS.md) | 依各自責任範圍遵守 |

## 狀態定義

- `Proposed`：提案／待確認，不構成實作授權。
- `Accepted`：使用者已核准，於適用範圍內具約束力。
- `Superseded`：已被另一項核准決策取代，保留於 history。
- `Retired`：已核准解除或依明定條件失效，保留於 history。
- `Rejected`：已拒絕，不得作為實作依據；保留於 history。

## 單一權威來源

本目錄不取代既有領域規格、API／資料契約、資料庫設計及驗收文件。每個決策只指定一份完整權威內容；其他文件僅連結，不複製另一份可能漂移的規格。
