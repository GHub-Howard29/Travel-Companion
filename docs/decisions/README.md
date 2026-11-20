# Travel-Companion 決策總索引

本文件是持續有效工程決策與工作進度的唯一總入口。開始相關工作時先讀本索引，再讀本次相關 ADR 主檔及依目前階段／工作需求選出的附屬文件；不得全量載入所有 ADR／階段附件。索引只維護狀態、階段、下一步、阻塞、載入條件及連結，詳細內容與證據留在各權威文件。

## 有效決策與進度

| ID | 決策／工作 | 狀態 | 目前階段 | 下一步／阻塞 | 權威主檔 |
|---|---|---|---|---|---|
| [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) | 每日詳細行程統一編輯權、保存協調與更新提示簡化 | Accepted／進行中 | S1 DB enforcement 與 Save RPC | SR-11 雙 Auth 隔離測試 PASS；SR-05／09／10／12 部分驗證／阻塞，詳見 S1 階段紀錄；下一步補足併發、unknown outcome 與輸入契約證據，不得將局部 PASS 當作階段完成 | [ADR-001](active/ADR-001-trip-daily-card-edit-lock-scope.md) |

## ADR-001 階段入口

| 階段 | 文件 | 按需載入條件 |
|---|---|---|
| S1 DB enforcement／Lease／version／Save RPC | [ADR-001-S1](active/ADR-001-S1-db-enforcement.md) | DB schema、migration、Trigger、RPC、權限及 DB 測試 |
| S2 Cloud Save 接線 | [ADR-001-S2](active/ADR-001-S2-cloud-save-integration.md) | Repository、Cloud service、所有 daysData 寫入 caller |
| S3 Client／Lock／Pending／Recovery | [ADR-001-S3](active/ADR-001-S3-client-lock-pending.md) | Hook、UI、Lease client、Pending、merge、Recovery |
| S4 整合後驗收 | [ADR-001-S4](active/ADR-001-S4-acceptance.md) | 整合後 regression、跨瀏覽器／裝置、離線恢復及結案 |
| 根因調查與原始證據 | [文件 116](../116_卡片編輯故障根因與旅程級編輯契約調查紀錄.md) | 需要根因、呼叫鏈、原始調查及補充測試證據時；不作為階段進度／下一步的維護位置 |

## 載入規則

1. 每次任務必讀本 README；依工作範圍只讀對應 ADR 主檔及必要的一份階段文件。
2. ADR 主檔保存 Accepted 決策與階段導航；階段文件是該階段持續執行紀錄的唯一維護位置，保存工作進度、執行細節、測試證據摘要、PASS／FAIL／BLOCKED、未完成項及下一步；文件 116 僅保存根因調查、呼叫鏈分析及原始／補充證據，不承擔日常階段進度管理。三者不得互相複製大段內容。
3. 不在當前工作範圍內的階段文件不得預先載入；只有跨階段依賴、必要權威規格或故障追查時才額外讀取。
4. 開始、完成階段工作或進度／阻塞／下一步變更時，更新當前階段文件及本 README；README 只寫狀態、當前階段、下一步、阻塞與連結，不寫技術細節。
5. 新 Accepted 決策／決策修訂必須同步更新對應 ADR 主檔及本索引；不能只改階段文件。使用者明確核准解除／取代，或原決策明定的客觀解除條件已有可驗證證據成立，才可移入 history；保留原文及移轉證據。
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