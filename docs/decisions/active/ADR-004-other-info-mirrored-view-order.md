# ADR-004：其他資訊交通卡片映射至自駕須知與雙頁獨立排序

- **ID：** ADR-004
- **狀態：** Accepted（2026-11-27；Product Owner 定案及後續澄清）；交通卡片關鍵字映射及雙視圖獨立排序已由使用者確認通過；原生自駕卡片須保留新增／編輯／刪除能力，交通映射卡片維持唯讀；頁面／跨裝置完整驗收仍待補齊
- **建立日期：** 2026-11-27
- **範圍：** 自駕行程中，將交通分類特定標題的資訊卡片額外顯示於「自駕租車須知」，並讓兩個視圖維持獨立排序。
- **不在範圍：** 新增重複資料列、建立第二套內容編輯／刪除流程、變更敏感資料權限、建立新的同步 API／服務、或直接修改正式資料。

## Accepted 決策

1. **原始分類歸屬不變。** 被映射的資訊卡片仍屬於使用者選定的「交通」分類，`folder_id`／`folderId` 不因映射而改變。
2. **映射條件。** 僅自駕行程的「交通」分類項目，且標題包含「租車」或「自駕」時，額外顯示於「自駕租車須知」。一般資訊與敏感資料皆適用；敏感資料仍依原有 `allowed_roles`／RLS 權限決定能否讀取。
3. **同一筆資料、兩個視圖。** 自駕須知只投影交通分類中的既有項目，不複製資料、不產生第二筆可同步的內容。
4. **依資料來源區分管理權限。** 交通映射卡片在自駕須知僅可排序，不提供新增、編輯及刪除；其內容管理唯一入口仍是「其他資訊 → 交通」。原生 special-info-self-guided folder 卡片則沿用既有 Other Info 管理流程，在自駕須知頁保留新增、編輯及刪除。兩者同頁呈現不代表共用 CRUD 權限。
5. **條件式提示。** 新增／編輯資訊表單目前分類為「交通」時，在標題輸入框右側顯示映射關鍵字與規則；其他分類不顯示。
6. **兩套獨立排序。** 交通視圖沿用既有 `order`／`sort_order`；自駕須知使用同筆資料新增的 `selfGuidedOrder`／`self_guided_sort_order`。自駕排序僅修改自駕排序欄位，交通排序僅修改原有排序欄位，兩邊互不改寫對方排序。
7. **既有儲存與同步。** 本機仍走既有 Other Info localStorage；跨裝置仍走既有 `other_info_items` upsert／read／sync pipeline。只在既有資料列增加 nullable 自駕排序欄位，不新增資料表、同步服務或 API。
8. **舊資料相容。** 原有資料沒有自駕排序欄位時，首次建立自駕視圖順序以當時交通映射清單順序初始化；之後才各自獨立維護。舊版錯誤歸入 `special-info-self-guided` 的非 canonical 關鍵字項目，應在自駕 Trip 載入正規化時還原到交通原始分類，canonical `自駕租車資訊` 保持專用 folder。

## 驗收條件

- 相同符合條件的項目同時出現在交通與自駕須知，且具有相同 ID、內容及敏感權限。
- 非交通分類即使標題包含關鍵字，也不出現在自駕須知。
- Guest／一般 User 不得因映射而取得原本無權限的敏感卡片或存在提示。
- 交通重排只更新 `order`；自駕須知重排只更新 `selfGuidedOrder`。
- 一個視圖重排後，另一視圖的順序保持不變；跨裝置重新載入後兩套順序均保留。
- 自駕須知的管理模式保留拖曳排序；原生 special-info-self-guided 卡片可新增、編輯、刪除；交通映射卡片僅可排序且無 CRUD 控制。交通頁保留既有內容管理功能。
- 非交通表單不顯示映射規則提示；交通表單提示顯示在標題輸入框右側。

## 實作紀錄

### 2026-11-27

- 已新增 `OtherInfoItem.selfGuidedOrder`，localStorage schema 接受此 optional number。
- 已新增交通來源篩選 helper：`folderId === "other-info-transport"` 且標題含「租車」或「自駕」；視圖套用現有 role filter 後才顯示。
- 已分離排序寫入：交通寫 `order`，自駕寫 `selfGuidedOrder`；沿用既有 defer/local save/cloud sync pipeline。
- 已修改 `otherInfoCloudService` 讀寫 `self_guided_sort_order`，並新增 migration `20261127120000_other_info_self_guided_sort_order.sql`，欄位 nullable。**Migration 尚未套用任何資料庫。**
- 已將舊版錯誤歸入 `special-info-self-guided` 的符合關鍵字非 canonical 卡片，於 Trip 正規化時還原至 `other-info-transport`；不直接寫入真實資料。
- 已保留自駕頁管理入口與拖曳排序，隱藏內容編輯／刪除／新增 controls；一般交通頁既有管理功能保留。
- 已新增／更新 `verify:v3920-other-info-categories` 契約斷言，第一次重跑通過。
- 尚待：修正表單提示精確位置後重跑驗證；ESLint／完整 Build；檢查無 migration 的本機舊 DB 會正常等待 migration、套用後可讀寫；瀏覽器端到端雙頁順序操作及跨 reload 驗收。
- Git：未 commit／push；正式資料庫、正式部署均未操作。

### 2026-11-27 V3.11.8 部署後修正追蹤：原生自駕資訊未顯示

- 使用者回報 V3.11.8 部署後，原本存放於 `special-info-self-guided` 的自駕資訊未出現在「自駕租車須知」頁。
- 正式資料庫唯讀核對：該 Trip 原生自駕資料仍有 5 筆 active records；另有 2 筆 soft-deleted records，經內容辨識為測試資料，並非原始使用者資料。原始資料未遭刪除，本次不執行 DB restore／undelete／資料搬移。
- 根因定位於 `OtherInfoPage.tsx`：自駕頁只組合交通分類映射項目，未納入目前自駕專用 folder 的原生項目。
- 本機修正已加入 `getOtherInfoItemsByFolderId(visibleItems, effectiveActiveFolderId)` 取得原生項目，並與既有交通映射項目合併顯示；沿用 `selfGuidedOrder`，未改動資料列、原始分類或資料庫。
- 本機驗證：`npm run verify:v3920-other-info-categories`、`npm run lint`、`npm run build`、`git diff --check` 均 PASS。尚未完成正式頁面瀏覽器／實機驗收、跨裝置讀回及部署後驗證；此修正目前僅在本機，未 commit／push／deploy。
- **ADR 邊界待確認：** ADR-004 明確規範交通分類映射與 canonical `自駕租車資訊` 專用 folder，但 Accepted 範圍未明文描述原生 folder 項目在自駕頁的顯示組合。先記錄為 V3.11.8 部署後缺陷修正候選，不自行擴張或修改 Accepted 決策；完成 ADR 原文與產品契約核對後再判定是否需 ADR 修訂。
- 下一步：完成 ADR 邊界判定及自駕原生資料／交通映射資料同頁顯示、排序、reload、跨裝置驗收；其他 V3.11.8 部署後待驗項目仍維持未完成。

### 2026-11-27 使用者補充驗收結果與原生自駕卡片管理問題

- **已通過（使用者回報）：** 交通卡片標題符合關鍵字時，會同步映射顯示於自駕分類；交通與自駕兩個分類各自排序，互不影響對方排序。此處記錄使用者確認的功能結果，不額外推定其他情境均已完成驗收。
- **原始回報（已定位並修正）：** 自駕分類只能排序的原因是頁面以 isSpecialInfoPage 一刀切隱藏 CRUD，誤將原生卡片也套用映射卡片唯讀規則。
- **原先的待確認事項（已由本次程式檢查釐清）：** 初始回報時尚未確認是否由隱藏控制項造成；後續檢查已確認就是 isSpecialInfoPage 條件一刀切隱藏 CRUD。
- **範圍區分：** 交通映射卡片在自駕頁唯讀；原生自駕卡片依 Product Owner 後續澄清保留 CRUD。不得將兩種來源混為同一權限。
- **目前狀態：** 映射及雙排序：使用者確認通過。原生自駕卡片 CRUD：根因已定位，本機程式已修正；自動化契約及 production build 通過，瀏覽器／實機 UI、reload、跨裝置驗收與正式發布仍待完成。

### 2026-11-27 原生自駕卡片 CRUD 邊界修復

- **根因已定位：** OtherInfoPage.tsx 以 isSpecialInfoPage 一刀切隱藏新增表單、編輯／刪除按鈕，導致原生 special-info-self-guided 卡片也被套用映射卡片唯讀規則。
- **Product Owner 澄清後的正確邊界：** 原生自駕 folder 卡片恢復新增／編輯／刪除；由 other-info-transport 關鍵字投影而來的映射卡片維持唯讀，只能排序。映射卡片的編輯／刪除仍只能在交通分類操作。
- **修正方式：** 以既有 isSelfGuidedTransportInfoItem 識別映射來源，僅對映射項目隱藏 CRUD 控制，且不新增 save／delete handler 防護；自駕頁新增表單仍寫入目前原生 folder。沿用既有 Other Info save／sync pipeline。
- **未變更：** 卡片 ID、folder 歸屬、資料內容、敏感權限、order／selfGuidedOrder 排序契約、資料庫 schema、migration、正式資料及同步 API。
- **驗證：** npm run verify:v3920-other-info-categories PASS；npm run lint PASS；npm run build PASS（完整 regression／TypeScript／production build／PWA postbuild checks）；git diff --check PASS。本機瀏覽器唯讀 UI 已確認：自駕原生卡片顯示新增入口及編輯／刪除控制；交通映射卡片在自駕頁僅有拖曳排序；交通分類頁仍有映射卡片編輯／刪除控制。新增表單仍顯示既有一般／敏感資料選項；未執行資料保存／刪除。尚未完成實際 CRUD 保存驗收、reload、跨裝置及實機驗收；未部署、未 commit／push。
