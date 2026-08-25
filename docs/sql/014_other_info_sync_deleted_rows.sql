-- Travel Companion Other Info sync repair
--
-- 管理者需要讀取已軟刪除的同 client_item_id 列，才能重新啟用同一張卡片，
-- 避免因 RLS 隱藏舊列而改走 INSERT，觸發 client_item_id 唯一索引衝突。

drop policy if exists other_info_items_select_policy on public.other_info_items;
create policy other_info_items_select_policy
on public.other_info_items
for select
using (
  (deleted_at is null or public.tc_can_edit_other_info(trip_id))
  and (
    allowed_roles is null
    or cardinality(allowed_roles) = 0
    or allowed_roles @> array[public.tc_other_info_role(trip_id)]::text[]
  )
);
