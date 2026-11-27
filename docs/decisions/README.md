# Travel-Companion 決策總索引

本文件是持續有效工程決策與工作進度的唯一總入口。開始相關工作時先讀本索引，再讀本次相關 ADR 主檔及依目前階段／工作需求選出的附屬文件；不得全量載入所有 ADR／階段附件。索引只維護狀態、階段、下一步、阻塞、載入條件及連結，詳細內容與證據留在各權威文件。

**跨對話續行：** 新對話／Agent 看到此索引列有 Accepted／進行中工作時，應依其下一步直接恢復並執行未完成工作，不得只做 startup status、要求手動交接 UUID、重複規劃或重跑已完成切片。執行規則及權限界線見根目錄 [AGENTS.md](../../AGENTS.md)「跨對話未完成工作自動續行」。每個切片即時保存階段紀錄並同步本索引，讓 repository 成為可接續的工作狀態來源。

## 有效決策與進度

| ID | 決策／工作 | 狀態 | 目前階段 | 下一步／阻塞 | 權威主檔 |
|---|---|---|---|---|---|
| [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) | 每日詳細行程與編輯旅程共用 Trip Lease 的互斥編輯協調 | Accepted（決策持續有效）／Implementation Completed（2026-11-24） | **原 S1／S2／S3／S4 均 Exit PASS；2026-11-24 核准新增範圍亦完成實作、自動化驗證及使用者人工 UI 驗收，Exit PASS。** | **已結案，無待辦。實作結案不代表 Accepted 決策退休；如需修改，須先核准 ADR 修訂。歷史階段紀錄由 ADR-001 主檔連結至 `history/`。** | [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) |
| [ADR-002](active/ADR-002-card-save-screen-flicker.md) | 移除已淘汰的每日行程 Preview／通知／同步衍生機制，並修復卡片保存／畫面穩定性與登入身份生命週期 | **Accepted（既有 S1／S2 Implementation Completed）；依使用者 2026-11-27 回報：BUG 6／7 已完成修正、BUG 1／4 目前觀察正常、BUG 2／3／5 仍待根因追查；BUG 編號狀態詳見新事件調查文件。BUG 3 keyed reservation 已隨 V3.11.8 部署；正式 log follow-up 進行中** | **V3.11.8 部署後正式 log 調查（UTC 10:20–10:30）：315 次 GET /trips（264 次同一 Chrome session 的 full-list GET、51 次其他 detail query），1,593 次 participant-map RPC；正式 DB 有 6 筆 Trip，264×6=1,584，與實際 RPC 數幾乎吻合。PostgREST Warp `Thread killed by timeout manager` 訊息 22 筆（依 upstream #4799 不能直接視為 API timeout；本窗 Gateway 無 5xx）；Realtime invalid-filter 10 筆；travel-route Edge 9 次 POST 全 200，但 cache／usage 只支持本窗 1 次成功 routeEstimate provider cache miss，其餘 8 次 action 未分類；Save 10 次 200、1 次 Lease gate 403。** | **本輪隔離 harness 已 PASS：相同 route input 會各自觸發 Edge invoke，Recovery reconcile 失敗／`completed=false` 後 pending 保留，後續 focus 可再次觸發；同一 in-flight 仍會合併。Chrome UI caller attribution 已 PASS：以既有本機 Superadmin 及臨時 private Trip 分別觸發 `queryTravelMode()`、`saveCopies()`、`prepareTimeAdjustment()`、`saveItem()`；同一 Place ID route target 共產生 5 次 routeEstimate provider query（saveItem 2 次、其餘各 1 次），測試 Trip/cache 已清理，未建立新帳號或操作 ADR-003 B fixture。正式 Gateway logs 仍缺 caller/page identity 與 route key，故不能將正式 9 次 POST 逐筆歸因。Workspace 高頻讀取已定位 V3.11.8 `App.tsx` 的 `loadChecklistCopySources` N×N 路徑；2026-11-28 已核准並完成最小修正：每輪 effect 共用一次完整雲端 Trip snapshot，純 Static Seed 清單不額外讀取完整雲端清單。回歸測試、完整 build 及全專案 ESLint 均 PASS；V3.11.10 已部署。使用者端效益仍待正式流量觀察。單次完整清單 hydration 仍保留既有逐 Trip participant-map RPC，不包含獨立 N+1 改造。44 輪 effect 的觸發 state update 尚未記錄，Recovery retry 可能是額外來源。PgBouncer 無連線額滿證據；PostgREST Warp 訊息未證明 API timeout；本窗 Gateway 無 5xx。Realtime invalid filter 已確認一條現行 Lease subscription 權限衝突（本機重現）；正式 10 筆尚未逐筆映射。Save 403 已找到同一 authenticated session 的成功 Lease release 緊接 61 ms 後 Save 403，且 source 存在背景 pending-save 與 cleanup release 競態；正式 trip/client IDs 缺失，尚未逐筆確認。BUG 2 真實 React Hook + isolated Supabase Auth／Lease／Save RPC 驗收仍待完成。詳細證據見新事件調查文件最新追查節。** | [ADR-002](active/ADR-002-card-save-screen-flicker.md) |
| [ADR-003](active/ADR-003-weather-interval-forecast.md) | 行程卡片時間區段天氣預報（Interval V1） | **Accepted／Implementation Completed（V3.11.7 正式發布；2026-11-26）** | **A、B、C 全數 PASS（2026-11-26）。已驗證資料保護、APP → Edge → DB、時間修改／摘要重算、冷卻保護與自然恢復、Lease 收斂、Console／LocalStorage／UI 邊界；測試 Trip 已還原。Android standalone／實機操作移至部署後回歸。** | **V3.11.7 已正式部署：migration／Edge Function／GitHub Pages 及公開 smoke 均完成。正式登入 Session 天氣刷新與 Android standalone 實機更新接管列為部署後回歸。** | [ADR-003](active/ADR-003-weather-interval-forecast.md) |
| [ADR-004](active/ADR-004-other-info-mirrored-view-order.md) | 交通資訊映射至自駕須知與雙頁獨立排序 | **Accepted（2026-11-27，已依 Product Owner 澄清管理邊界）；映射／雙排序使用者確認通過；原生卡片 CRUD 修正已實作** | **根因：isSpecialInfoPage 一刀切隱藏 CRUD，連原生卡片也被鎖住。現已按來源區分：原生自駕卡片可 CRUD，交通映射卡片唯讀。本機瀏覽器唯讀 UI 已確認新增入口、原生 CRUD 控制及映射卡片唯讀；未執行資料保存／刪除。** | **下一步：實際保存／編輯／刪除驗收、reload 與跨裝置讀回、實機 UI；未部署前不得視為正式修復。V3.11.8 其他部署後待驗項目仍未結案。** | [ADR-004](active/ADR-004-other-info-mirrored-view-order.md) |
| **[異常旅程資料修復](../09_待辦事項_TODO.md)** | **日本九州 Static Seed → 沖繩 Static→Dynamic** | **COMPLETED（2026-11-26）** | **九州及沖繩實機驗收全數通過：新增／刪除／編輯卡片、共用資料、私人資料、其他資料及帳本均正常；九州景點照片正常顯示。** | **已結案，無剩餘待驗項目。資料修正及文件均已同步 develop／main；四國相關正式旅程及 fixture 未觸碰。** | [TODO](../09_待辦事項_TODO.md) |

## ADR-002 階段與證據紀錄

| 紀錄 | 文件 | 狀態／用途 |
|---|---|---|
| V3.11.7 新事件調查與修正 | [新事件調查](active/ADR-002-V3.11.7-regression-investigation.md) | **原技術調查中的 BUG 1／2／3 子項局部修正及 Other Info 同步提示修正有各自的本機驗證紀錄；其中 BUG 3 keyed reservation 已隨 V3.11.8 部署。使用者另提供的 BUG 1–7 狀態已獨立記錄於新事件調查文件開頭；兩套 BUG 編號尚未建立對照，不可直接視為同一項。2026-11-27 18:25 正式 log 事件已記錄：Route POST 9 次全 200；Save 1 次 Lease gate 403，約 53 秒後 Save 200；同窗另有 29 筆 PostgREST Warp `Thread killed by timeout manager` 訊息（不是已確認的 API timeout）、14 次 Realtime invalid filter 及大量 workspace／participant map 讀取。** | **下一步：追查 Save 403 的 release/save 是否同一 Trip/client、Realtime 10 筆錯誤的逐筆歸因，以及正式 Route POST 的 action／caller 歸因。Workspace N×N 最小修正已在本機完成並通過完整 build，仍待部署後正式流量回歸；不把 44 輪舊 effect 觸發來源追查當作本次修正的前置條件。29 筆 Warp 訊息沒有證據代表 API timeout；若沒有獨立健康狀態異常，不列為應用程式故障。Lease subscription 權限衝突已定位但尚未授權修正。Chrome 隔離 harness 已確認四個 UI Route caller 分別可觸發同一 route target；正式 Gateway logs 缺 caller/page identity 與 route key，正式 9 次 POST 仍無法逐筆對應 UI caller。Other Info 原始資料是否需修復及端到端驗收仍待處理；此前 POST 201／GET 200 後資料列消失仍是獨立未知事件。** |
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
