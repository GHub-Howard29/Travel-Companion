# Trip Cloud 驗證手冊

> Travel Companion V3-1
>
> 最後更新：2026-07-10

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

# 五、App 實機測試

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

---

## 4. Trip Editor 編輯被指派旅程

測試步驟：

1. 使用被指派為 `trip_editor` 的 email 登入。
2. 選擇被指派的旅程。
3. 點選「編輯旅程」。
4. 修改旅程名稱或天數。
5. 確認可編輯者 Email 欄位為鎖定狀態。
6. 儲存。

預期結果：

- `trip_editor` 可編輯旅程基本資料。
- `trip_editor` 不可管理可編輯者 Email。
- Supabase `trips` row 更新。
- Supabase `admin_users` 不會被 `trip_editor` 修改。

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

# 六、常見問題

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

# 七、完成標準

Trip 管理第一階段可視為完成，需同時符合：

- `003_trip_cloud_schema.sql` 已執行。
- `004_trip_cloud_validation.sql` 檢查通過。
- Guest 可瀏覽旅程。
- `super_admin` 可新增旅程。
- `super_admin` 可管理可編輯者 Email。
- `trip_editor` 可編輯被指派旅程。
- 未被指派的一般登入使用者不可編輯共享旅程。
- `npm run lint` 通過。
- `npm run build` 通過。
