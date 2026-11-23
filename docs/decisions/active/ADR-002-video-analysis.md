# ADR-002：新增／刪除操作畫面跳動影片切片分析

- **分析日期：** 2026-11-23
- **來源：** 使用者提供原始影片 `2791.mp4`（本文件記錄影片觀察，不代表影片檔已納入 repository）
- **定位：** ADR-002 的獨立影片證據／分析文件；不合併先前請求量測、MutationObserver 計數、viewport／scrollbar 分析或其他根因候選紀錄。

## 1. 分析目的與範圍

以影片畫面實際變化為起點，找出新增／刪除操作後造成使用者所稱畫面上下快速移動／資料閃動的具體視覺變化，再提供程式追查入口。此次不以先前程式假設、請求計數或其他分析結果替代影片證據。

只分析新增及刪除操作按下後所產生的相關變化。鍵盤出現／收起、進入或退出編輯頁、一般頁面切換等畫面均排除。

## 2. 切片與比較規則

- **新增 A／B：** 先比較是否有相同的畫面變化；若相同，兩段同時分析、交叉比對；若不同，B（第二次新增）作為主要分析對象，A 僅作參考。
- **刪除 C／D：** 兩段一律同時分析並比對，觀察刪除不同卡片時是否重現同一現象及其差異。
- 本次新增分析的焦點依使用者後續明確指出，修正為 Day 1 行程管理區灰色說明文字／暫態狀態訊息的變化；先前將導覽列出現／消失判為跳動原因的判斷撤回，不作證據。

## 3. 影片切片定位

以下為影片時間軸候選定位，供回看核對；並非程式事件時間戳。

| 切片 | 時間定位 | 操作／畫面 |
|---|---|---|
| A | 約 7.0–10.0 秒 | 第一次新增「1」及提交後列表呈現；依比較規則不作主要分析切片 |
| B | 約 16.5–18.0 秒 | 第二次新增「2」及提交後列表呈現；若與 A 不同，以 B 為主要新增切片 |
| C | 約 20.5–23.0 秒 | 刪除「2」：操作前、確認及操作後畫面 |
| D | 約 23.5–26.5 秒 | 刪除「1」：操作前、確認及操作後畫面 |

A／B 亦已補充抽幀分析，發現新增操作時同樣出現暫態狀態訊息，詳見第 4 節。這使跨裝置卡片編輯狀態確認／同步相關機制成為新增及刪除操作共同的強候選；仍需程式追查驗證因果。

## 4. A／B 與 C／D 的共同畫面現象

### 4.1 A／B：新增操作比對

已重新抽取 A／B 的 0.1 秒切片，觀察管理區灰色說明欄位及其上方暫態訊息區：

- **A（第一次新增「1」）：** 約 7.5 秒為未顯示暫態訊息的基準畫面；約 7.8 秒可見「正在確認其他裝置的卡片編輯狀態…」訊息出現，約 7.9 秒附近訊息不再可見；約 8.2 秒抽幀再次看到該訊息。訊息與原有灰色說明文字區同時呈現，令管理區增加垂直內容。
- **B（第二次新增「2」）：** 約 16.5–16.8 秒未見暫態訊息；約 16.9–17.1 秒可見同一訊息，17.2 秒附近畫面轉回列表。
- **A／B 比對：** 新增操作期間均可觀察到相同文字的暫態狀態訊息，並非只有刪除操作時才出現。A 中訊息在抽幀間呈現出現／消失／再次出現的現象；B 中訊息出現在提交流程及返回列表前的短暫區間。
- 這是影片畫面層級證據，抽幀時間為近似定位；尚不能僅憑影片確定訊息重複顯示的程式原因或精確持續時間。

### 4.2 C／D：刪除操作比對

使用者指出並以截圖示意的 Day 1 行程管理區，其灰色說明文字原本為：

> 新增依到達時間排序；編輯時間不改卡片順序。

刪除操作期間，該區域短暫呈現狀態文字（影片抽幀觀察為「正在確認其他裝置的卡片編輯狀態…」相關訊息）。該訊息出現／消失時，灰色說明區塊的內容／高度變化，令下方整個畫面資料欄位快速上下移動，使用者因此觀察到視覺資料閃動。

- **C（刪除「2」）：** 約 21.7–22.3 秒附近觀察到暫態狀態訊息與管理區／下方內容位移的變化。
- **D（刪除「1」）：** 約 24.8–25.5 秒附近同樣觀察到暫態狀態訊息相關變化；使用者明確指出 C、D 都有此現象，須共同分析及比對。

時間定位為目前抽幀核對的近似區間，後續程式追查不應把時間點當作已量測的執行事件時間。

## 5. 修正過的判斷

先前分析曾將 C 的畫面跳動誤判為頂部綠色導覽列重新出現／頁面位置變化。使用者指出真正跳動來源是管理區內說明文字的短暫變化，令整個畫面資料欄位上下快速移動。

**撤回先前導覽列判斷。** 本次影片分析結論以使用者指出並核對的管理區暫態文字／區塊高度變化為主，不把導覽列變化列為根因證據。

## 6. 目前結論（影片觀察層級）

- **新增 A／B 及刪除 C／D** 均可觀察到同一暫態狀態訊息：「正在確認其他裝置的卡片編輯狀態…」。
- 暫態訊息出現及消失，改變 Day 1 行程管理區灰色說明區塊上方的內容／高度，推移其下方卡片及資料欄位，造成快速上下位移與視覺閃動。
- 因同一訊息跨新增及刪除操作均出現，影片證據更支持「跨裝置卡片編輯狀態確認／同步相關流程」是共同候選，而不只是刪除專有流程；此判斷仍屬機制候選，不能視為已證明同步機制是畫面位移的直接根因。
- **直接畫面原因與Lease effect重啟已動態確認：** 卡片資料更新使`daysData`參照變化，Lease effect重新setup，`editLeaseStatus`切至loading並條件式插入status paragraph，造成管理區49.5 px高度／卡片位置位移；refresh完成後回ready，位置復原。上游pending-sync／reconciliation參照更新迴圈仍待細化，詳見第7、8節。

## 7. 動態驗證結果與下一步（主要工作線）

1. **直接畫面因果已動態確認：** Lease loading 訊息出現時，Day 1 管理區增加 49.5 px，下面卡片位置由約 346.5 px 移至 396.0 px；訊息消失時回復。status paragraph 本身約 37.5 px，額外 spacing 造成整體 49.5 px 位移。
2. **effect teardown／setup 已直接追蹤：** 暫時 instrumentation 將 `daysData` 參照編號；pending-sync／reconciliation loop期間觀察到 2,481 次 effect setup（各次帶入新的 `daysData` 參照），約 348 秒；另有 5 秒觀察窗增加 41 次 setup。instrumentation 已移除。
3. **反覆同步狀態的來源仍需細化：** synthetic Trip pending-sync期間雲端版本從 1564 增至 1971；reload後 pending state變為 `synced`、雲端與本機均回到4張基線卡片，版本1971在5秒核對窗內保持不變。此現象支持 pending／revision／workspace reconciliation造成參照反覆更新的回饋鏈，但其每一個上游事件尚未逐一動態隔離。
4. **測試資料已清理：** `ADR002_TRACE_ADD_20261123`已移除；本機及loopback DB均恢復原4張基線卡片，sync state為`synced`。沒有新建帳號或fixture；直接SQL清除遭ADR001 guard拒絕，清理最後由應用保存／同步完成。
5. **下一步：** 審查最小修正方向——將Lease subscription lifecycle與`daysData`參照更新解耦，避免卡片資料更新重啟訂閱並插入loading UI；確認必要的保存後refresh仍由既有Realtime／明確refresh保障。尚未實作產品修正。
6. 請求計量、Weather及participant-map等其他工作線仍暫停；本次不混合先前量測。

## 8. 原始碼因果鏈定位（2026-11-23）

### 8.1 暫態文字的直接控制條件

- `src/components/ItineraryPage.tsx:2914–2917`：Day 1 管理區在 `editLeaseStatus === "loading"` 時條件式渲染「正在確認其他裝置的卡片編輯狀態…」訊息。訊息並非另有獨立 UI timer；其顯示由 Lease status state 控制。
- 原本灰色說明文字 `新增依到達時間排序；編輯時間不改卡片順序。` 在 `:2940–2942` 仍固定渲染。Loading訊息是另加一個 `mt-3` status paragraph，因此 loading state 出現時管理區增加垂直內容，消失時恢復。

### 8.2 Lease effect 為何進入 loading

- `src/components/ItineraryPage.tsx:537–654`：Lease effect dependencies包含 `[activeDay, canUseEditLeases, supabase, trip.content.daysData, trip.id]`。
- effect setup在 dynamic import完成後執行 `setEditLeaseStatus("loading")`（約 :615），再呼叫 `refresh()`；refresh成功取得 `listItineraryCardEditLeases()` rows後設為 `ready`（約 :595），失敗則設為 `error`。
- 因 `trip.content.daysData` 被列入 effect dependency，當卡片保存更新這個資料物件參照時，React會cleanup舊effect（移除Realtime channel／foreground listeners），重新setup；新setup會短暫將 status切到 `loading`，等待Lease list refresh結果後回 `ready`。這是目前直接定位到的暫態訊息觸發機制。

### 8.3 新增／刪除如何改變 dependency

- `src/components/ItineraryPage.tsx:2223–2379`：新增／編輯 `saveItem()` 組出新的 `daysData`，呼叫 `onSaveTripDetail()`。
- `src/components/ItineraryPage.tsx:2381–2406`：`deleteItem()` filter掉目標卡片並呼叫 `onSaveTripDetail()`，同樣傳入新 `daysData`。
- `src/hooks/useTripWorkspace.ts:952–1024`：線上保存先寫本機Pending並 `setCurrentTrip(localRecord.detail)`；這個detail包含本次更新的daysData新參照。後續 reconciliation又以新 `content/daysData`參照更新 `setCurrentTrip`（約 :1081–1083）；成功後還會從 storage readback再次更新 `currentTrip`。不同分支更新數量不一，不能宣稱每次固定次數。
- 因這些保存階段更新 `daysData`參照，而Lease effect依賴整份物件參照，一次操作可能造成一輪或多輪 effect teardown/setup與 `loading→ready`，具體數量取決於分支、React batching及實際參照變化。

### 8.4 目前證據判定

- **直接畫面原因已確認：** `editLeaseStatus === "loading"`條件式新增的status paragraph會令管理區增加49.5 px，下面卡片位置同步移動49.5 px；ready後paragraph移除，位置復原。這與A/B/C/D影片中共同訊息及上下閃動吻合。
- **effect teardown／setup已動態確認：** 暫時instrumentation記錄每次setup帶入新的`daysData` object reference。pending-sync／reconciliation loop期間觀察到2,481次effect setup（約348秒）；另有5秒觀察窗41次setup。這不是單一保存所需的固定次數，且觀察窗涵蓋測試同步迴圈。
- **上游參照反覆更新來源仍需細化：** synthetic Trip pending-sync期間雲端版本1564→1971；reload後pending state變為`synced`、雲端及本機均回到4張基線卡片，版本1971在5秒核對窗保持不變。此現象支持pending／revision／workspace reconciliation造成參照反覆更新的回饋鏈，但每個上游事件尚未逐一動態隔離。

### 8.5 測試環境與清理

- 使用既有已登入的受控瀏覽器、本機loopback DEV與synthetic Trip `ADR-002-人工測試`；沒有新建使用者或fixture。
- `ADR002_TRACE_ADD_20261123`已清除；本機及loopback DB回到原4張基線卡片，pending state為`synced`。cloud version1971在reload後5秒核對窗保持穩定。
- 直接SQL清除遭ADR001 guard拒絕，未繞過Save RPC／資料庫保護；最後透過應用保存／同步完成清理。

## 9. 範圍隔離

本文件只保存此次影片切片觀察、判斷修正及程式追查入口。先前請求計量、MutationObserver 次數、Lease effect／daysData dependency 候選、viewport／scrollbar reflow 及其他調查均留在原權威紀錄，不複製或混合。
