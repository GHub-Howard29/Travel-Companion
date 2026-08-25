# Trip Cloud 驗證手冊

> Travel Companion V3-1
>
> 最後更新：2026-08-25

---

## V3.5.0 敏感資訊卡片權限驗證（已通過；PWA／iOS 實機列發布後）

V3.5.0 維持現行 Trip 瀏覽與角色制度，不新增 Trip 公開／私人設定或 `is_public` migration。相關模擬圖已經 Product Owner 確認，本手冊用於程式補全後的 migration 與角色驗證。

V3.5.0 候選內容已納入 V3.4.11 BUG024 的其他資訊同步修正與行程管理權限修正；候選 build 已使用 `APP_VERSION = 3.5.0` 與 `FORCE_UPDATE = true`。`013`／`014` migration 已套用正式 Supabase 專案，角色、同步與離線佇列驗證已通過；V3.4.11 是上一個正式發布基準，不得回寫其版本設定。

### A. 開發前

1. 確認新增／編輯卡片模擬圖預設為一般資訊，並包含「新增敏感資料」快捷入口與管理者限定標示；一般資訊不顯示可見範圍選項。
2. 確認 App 分享入口模擬圖與確切位置；分享只使用固定 App 首頁，不建立單一 Trip 網址。

### B. 卡片權限驗收

1. Guest、User 可讀一般資訊（`allowed_roles is null`）卡片，不可從 UI 或 REST 取得敏感卡片。
2. 目前 Trip 被指派的 `trip_editor` 與 `super_admin` 可讀取及管理兩種卡片。
3. 其他 Trip 的 `trip_editor` 在目標 Trip 視為 User，不可取得管理者限定卡片。
4. 未授權角色不顯示受限制卡片、數量或存在提示；資料夾內其他一般卡片正常顯示。
5. 新增一般資訊與新增敏感資料快捷入口後，`allowed_roles` 分別保持為 `null` 與 `['trip_editor', 'super_admin']`；編輯、複製、排序、同步及重新載入後，模式保持不變。
6. 卡片從所有人可看改為僅管理者可看後，Guest／User 下一次成功刷新時清除舊快取。
7. 登出及切換帳號後，不得讀取前一管理者的敏感卡片快取。
8. 一般資訊儲存不顯示二次提醒；敏感資料按下儲存後才顯示二次提醒，提醒文案不出現在編輯畫面。
9. 直接呼叫 Data API 驗證 RLS，前端隱藏不得作為唯一保護。
10. 確認 `docs/sql/014_other_info_sync_deleted_rows.sql` 已套用後，管理者可重新同步既有卡片；同步失敗時按下紅色提示右側的圓形雙箭頭按鈕，狀態應回到同步中並完成重試。

### B-1. V3.5.0 同步 BUG 回歸（已通過）

1. 以 `haw1971.yahoo@gmail.com` 登入，修改一般其他資訊購物卡片並儲存。
2. 進入領隊／導遊聯絡資訊，新增或修改一筆資料並儲存。
3. 於同步失敗提示按下手動重新同步按鈕，確認狀態回到同步中，成功後提示消失。
4. 於另一台管理者裝置新增其他資訊，確認原裝置可重新載入資料。
5. 以 `trip_editor` 回歸：參與者／登入 Email 為鎖定、沒有刪除整個旅程按鈕；其他旅程編輯功能仍可用。

### B-2. V3.5.0 強制更新設定確認（已通過）

1. `appVersion.ts`、`public/app-version.json` 與發布 metadata 的版本均為 V3.5.0，且 `forceUpdate` 為 `true`。
2. 確認 V3.5.0 的更新提示設定為不可關閉或選擇「稍後更新」。
3. 更新提示需說明本次敏感資訊 RLS、同步修正與權限修正；已儲存資料不被清除，未儲存表單需先儲存。
4. migration 與角色回歸完成後，才能將 V3.5.0 標示為已發布；PWA 舊版升級流程改列發布後補驗證。

### C. 發布後補驗證（Android／Chrome PWA）

1. Android 維持 V3.4.11 的單次原生 Splash 圖示，不得新增第二張圖示或改變載入順序。
2. Android 管理／編輯欄位聚焦與關閉後，畫面維持正常寬度，不左右溢出；一般縮放能力仍保留。
3. 電腦 PWA 啟動時可短暫顯示米白底並正常進入 App，不得持續停在空白頁。
4. 以 V3.4.11 作為基準升級至 V3.5.0，確認強制更新只需按一次且更新後不是空白頁；更新後已儲存資料仍在，未儲存表單警語正常。

> App 分享功能僅完成規格、模擬圖與修改邊界確認，未納入 V3.5.0 程式；實作與實機驗證移至 V3.5.1。

### D. 發布後補驗證（iOS）

1. iOS standalone PWA 啟動時顯示專案圖示，HTML 載入階段不得只有純色底圖。
2. iOS 聚焦與退出行程、清單、其他資訊及旅程管理後，畫面維持正常寬度，不需兩指縮小且不能左右移動。
3. iOS Safari／standalone 回歸 Google 登入、附件、更新提示與同步功能。

---

# 一、目的

本文件用來完成 Trip 管理第一階段的 Supabase 實機驗證。

Trip Cloud 指的是：

- App 內新增 / 編輯旅程。
- 旅程資料寫入 Supabase `trips` table。
- 可編輯者 Email 寫入 Supabase `admin_users`。
- Guest 可讀旅程。
- `super_admin` 可新增旅程。
- `trip_editor` 可編輯被指派旅程。

---

# 二、前置條件

請先確認：

- `docs/sql/001_checklist_cloud_schema.sql` 已執行。
- `docs/sql/002_checklist_cloud_validation.sql` 已驗證通過。
- `admin_users` 已至少有一筆 `super_admin`：

```text
email = 你的 Google 登入 email
role = super_admin
trip_id = null
```

---

# 三、Trip Cloud Schema 執行狀態

已透過 Supabase connector 執行：

```text
docs/sql/003_trip_cloud_schema.sql
```

Migration：

```text
20260710101530 add_trip_cloud_schema
20260710101638 harden_trip_cloud_grants
20260710104919 tune_trip_cloud_advisor_findings
```

此 SQL 會建立或更新：

- `public.trips`
- `trips_touch_updated_at` trigger
- `trips` RLS policies
- `admin_users` RLS policies
- `admin_users_one_role_per_trip_email` unique index
- `trips` / `admin_users` grants

RLS 是 Supabase 資料列權限，用來限制誰能讀寫特定 Trip 或使用者資料。

---

# 四、執行驗證 SQL

已透過 Supabase connector 執行：

```text
docs/sql/004_trip_cloud_validation.sql
```

確認結果：

- `trips` table 存在。
- `trips` 欄位包含：
  - `id`
  - `title`
  - `departure_date`
  - `participants`
  - `currency_config`
  - `sidebar_config`
  - `content`
  - `created_by`
  - `created_at`
  - `updated_at`
- `trips` rowsecurity 為 `true`。
- `trips_select_policy` 存在。
- `trips_insert_policy` 存在。
- `trips_update_policy` 存在。
- `trips_delete_policy` 存在。
- `admin_users_select_policy` 存在。
- `admin_users_insert_policy` 存在。
- `admin_users_update_policy` 存在。
- `admin_users_delete_policy` 存在。
- `trips_departure_date_idx` 存在。
- `admin_users_one_role_per_trip_email` 存在。
- `trips_touch_updated_at` trigger 存在。
- `anon` 有 `trips` select grant。
- `authenticated` 有 `trips` select / insert / update / delete grant。
- `authenticated` 有 `admin_users` select / insert / update / delete grant。

---

# 五、自動化 Smoke Test 結果

已完成：

- 本機 Vite dev server 以正確 base path `/Travel-Companion/` 啟動。
- `GET /Travel-Companion/` 回傳 `200`。
- `GET /Travel-Companion/trips/list.json` 回傳 `200`。
- `GET /Travel-Companion/trips/group-tour-2026-10.json` 回傳 `200`。
- 使用前端 anon key 呼叫 Supabase REST：
  - `GET /rest/v1/trips?select=id,title` 回傳 `200 []`。
  - `GET /rest/v1/admin_users?select=email,role,trip_id` 回傳 `401`。

以上代表：

- Guest 可讀 `trips`。
- Guest 不可讀 `admin_users`。
- 目前 `trips` table 尚無 App 內新增旅程資料。

---

# 六、App 實機測試

## 1. Guest 瀏覽

測試步驟：

1. 登出 App。
2. 開啟左側旅程選單。
3. 確認可看到既有旅程。
4. 切換旅程。

預期結果：

- Guest 可瀏覽旅程。
- Guest 不會看到「新增旅程」或「編輯旅程」。
- Console 不應一直出現 `admin_users` 權限警告。

2026-07-11 驗證結果：

- 本機 App `http://127.0.0.1:5174/Travel-Companion/#` 未登入瀏覽模式可開啟。
- 側欄可看到既有旅程與旅程切換選單。
- 未登入時不顯示「新增旅程」、「編輯旅程」或可編輯者管理入口。
- 此項已通過。

---

## 2. Super Admin 新增旅程

測試步驟：

1. 使用 `super_admin` email 登入。
2. 開啟左側旅程選單。
3. 點選「新增旅程」。
4. 輸入：
   - 旅程名稱
   - 出發日期
   - 天數
   - 參與者
   - 可編輯者 Email
   - 預設幣別
5. 儲存。

預期結果：

- 新旅程會出現在旅程選單。
- App 自動切換到新旅程。
- 行程頁顯示 Day 1 到 Day N。
- Supabase `trips` table 新增一筆 row。
- Supabase `admin_users` table 新增對應 `trip_editor` rows。

2026-07-11 狀態：

- 尚待使用 `super_admin` 帳號登入後實機驗證。

---

## 3. Super Admin 編輯旅程

測試步驟：

1. 使用 `super_admin` email 登入。
2. 選擇剛新增的旅程。
3. 點選「編輯旅程」。
4. 修改旅程名稱、天數或幣別。
5. 新增或移除可編輯者 Email。
6. 儲存。

預期結果：

- 旅程標題更新。
- Day 按鈕數量依天數更新。
- Supabase `trips.updated_at` 更新。
- 新增的 editor email 會出現在 `admin_users`。
- 移除的 editor email 會從該 trip 的 `admin_users` row 移除。

2026-07-11 狀態：

- 尚待使用 `super_admin` 帳號登入後實機驗證。

---

## 4. Trip Editor 編輯被指派旅程

測試步驟：

1. 使用被指派為 `trip_editor` 的 email 登入。
2. 選擇被指派的旅程。
3. 點選「編輯旅程」。
4. 修改旅程名稱或天數。
5. 確認可編輯者 Email 欄位為鎖定狀態。
6. 確認「參與者與登入 Email」欄位為鎖定狀態，且畫面沒有「刪除整個旅程」按鈕。
6. 儲存。

預期結果：

- `trip_editor` 可編輯旅程基本資料。
- `trip_editor` 不可管理可編輯者 Email。
- `trip_editor` 不可修改參與者與登入 Email，也不可刪除整個旅程；其餘旅程編輯功能維持可用。
- Supabase `trips` row 更新。
- Supabase `admin_users` 不會被 `trip_editor` 修改。

2026-07-11 狀態：

- 尚待使用被指派的 `trip_editor` 帳號登入後實機驗證。

---

## 5. 未被指派的登入使用者

測試步驟：

1. 使用一般登入使用者 email 登入。
2. 選擇任一旅程。
3. 開啟左側旅程選單。

預期結果：

- 不會看到「新增旅程」。
- 不會看到「編輯旅程」。
- 可使用一般登入者允許的個人功能。

---

# 七、常見問題

## 新增旅程只出現在本機，Supabase 沒有資料

可能原因：

- `003_trip_cloud_schema.sql` 尚未執行。
- 目前登入帳號不是 `super_admin`。
- `trips_insert_policy` 未建立或未生效。
- 瀏覽器離線。

檢查方式：

- 跑 `004_trip_cloud_validation.sql`。
- 檢查 `admin_users` 是否有正確的 `super_admin` row。
- 查看瀏覽器 console warning。

---

## 可編輯者 Email 沒有寫入 admin_users

可能原因：

- 目前登入帳號不是 `super_admin`。
- `admin_users_insert_policy` 未建立或未生效。
- `admin_users_one_role_per_trip_email` index 未建立。

檢查方式：

- 跑 `004_trip_cloud_validation.sql`。
- 查詢 `admin_users` 是否有對應 `trip_id` 的 `trip_editor` rows。

---

## Trip Editor 無法編輯既有 JSON seed 旅程

可能原因：

- 該 email 尚未被加入 `admin_users`。
- `trips_insert_policy` 未允許 `tc_is_trip_editor(id)`。
- 前端仍讀到舊版部署。

檢查方式：

- 確認 `admin_users.email`、`role = trip_editor`、`trip_id` 與旅程 id 完全一致。
- 重新部署前端或清除瀏覽器快取後再測。

---

# 八、完成標準

Trip 管理第一階段可視為完成，需同時符合：

- `003_trip_cloud_schema.sql` 已執行。
- `004_trip_cloud_validation.sql` 檢查通過。
- Guest 可瀏覽旅程。
- `super_admin` 可新增旅程。
- `super_admin` 可管理可編輯者 Email。
- `super_admin` 可修改參與者與登入 Email，並可刪除整個旅程。
- `trip_editor` 可編輯被指派旅程。
- 未被指派的一般登入使用者不可編輯共享旅程。
- `npm run lint` 通過。
- `npm run build` 通過。
