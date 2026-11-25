# Travel-Companion 決策總索引

本文件是持續有效工程決策與工作進度的唯一總入口。開始相關工作時先讀本索引，再讀本次相關 ADR 主檔及依目前階段／工作需求選出的附屬文件；不得全量載入所有 ADR／階段附件。索引只維護狀態、階段、下一步、阻塞、載入條件及連結，詳細內容與證據留在各權威文件。

**跨對話續行：** 新對話／Agent 看到此索引列有 Accepted／進行中工作時，應依其下一步直接恢復並執行未完成工作，不得只做 startup status、要求手動交接 UUID、重複規劃或重跑已完成切片。執行規則及權限界線見根目錄 [AGENTS.md](../../AGENTS.md)「跨對話未完成工作自動續行」。每個切片即時保存階段紀錄並同步本索引，讓 repository 成為可接續的工作狀態來源。

## 有效決策與進度

| ID | 決策／工作 | 狀態 | 目前階段 | 下一步／阻塞 | 權威主檔 |
|---|---|---|---|---|---|
| [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) | 每日詳細行程與編輯旅程共用 Trip Lease 的互斥編輯協調 | Accepted（決策持續有效）／Implementation Completed（2026-11-24） | **原 S1／S2／S3／S4 均 Exit PASS；2026-11-24 核准新增範圍亦完成實作、自動化驗證及使用者人工 UI 驗收，Exit PASS。** | **已結案，無待辦。實作結案不代表 Accepted 決策退休；如需修改，須先核准 ADR 修訂。歷史階段紀錄由 ADR-001 主檔連結至 `history/`。** | [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) |
| [ADR-002](active/ADR-002-card-save-screen-flicker.md) | 移除已淘汰的每日行程 Preview／通知／同步衍生機制，並追查卡片操作畫面上下閃動 | Accepted／S1 已完成發布範圍；S2 Step 1–4 第一輪實作完成；S2-01～04 hook-level 動態驗收 PASS；S2-05～14 待完成 | **S1：Preview 衍生機制拆除、主要卡片穩定性修正及 ADR-001 管理權／雙入口互斥新增範圍均已完成並隨 V3.11.5 正式發布。Participant RPC N+1、Weather APP 請求放大列為未來候選，不阻塞 S1。** **S2：登入身份切換與登出生命週期（2026-11-24 Accepted；2026-11-25 Step 1–4 第一輪實作完成）。2026-11-25 已建立可重複 loopback fixture／hook test harness，S2-01～04 動態 hook 驗證 PASS；真實本機雙 Auth Session 與正式 cloud service／Trip repository 驗證 PASS，fixture 已清理並還原同步資料基準。** | **S1 不再安排管理權／鎖定或跨 Auth 額外測試；若要結束原畫面根因調查，只先確認目前是否仍有實際可重現的未解現象。Participant／Weather 未來重新排程時必須重新取得最新數據、審查必要性並再次取得實作授權。S2 已完成身份／epoch Promise 隔離、已送出保存等待、共用 Lease 清理入口及登出 UI／費用簿收斂；靜態 regression、typecheck、全專案 ESLint、既有測試、完整 build、文件連結及 diff 驗證均 PASS。S2-01～04 的 hook-level 動態測試及真實本機雙 Session／repository 測試均 PASS，但不替代 App-level UI／Lease／保存驗收。下一步接續 S2-05～07：草稿／Lease 清理、管理排序狀態及 Trip Editor Modal heartbeat；之後完成 S2-08～14。S2 尚未 Exit PASS。** | [ADR-002](active/ADR-002-card-save-screen-flicker.md) |

## ADR-002 階段入口

| 階段 | 文件 | 按需載入條件 |
|---|---|---|
| S1 Preview／通知衍生機制拆除與卡片穩定性（主要發布範圍已完成；僅保留未解現象存在性判斷） | [ADR-002-S1](active/ADR-002-S1-root-cause-investigation.md) | 主要可見問題及管理權新增範圍已完成並隨 V3.11.5 發布；僅在仍有實際重現異常時才提出最小動態調查。Participant／Weather 為未來重新取證及再次授權的候選，不阻塞 S1 |
| **S2 登入身份切換與登出生命週期（ACCEPTED／Step 1–4 第一輪實作完成；S2-01～04 hook-level 動態驗收 PASS）** | [ADR-002-S2](active/ADR-002-S2-auth-workspace-lifecycle.md) | **新對話讀取 S2 第 9 節與 2026-11-25 最新驗證紀錄，直接接續 S2-05～07 草稿／Lease 清理及 Trip Editor Modal heartbeat；S2-01～04、已通過的 targeted regression、build 及文件檢查不需重跑。** |

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
