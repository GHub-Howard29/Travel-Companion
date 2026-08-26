-- Travel Companion V3.5.0 Other Info security scheme
--
-- 將舊版可能存在的角色設定收斂為本版兩種模式。
-- 一般資訊使用 NULL；敏感資料固定只允許目前行程管理者與系統管理者。
-- 舊版明確列出四種角色的公開卡片仍保留為一般資訊。

begin;

update public.other_info_items
set allowed_roles = null
where allowed_roles is not null
  and cardinality(allowed_roles) = 0;

update public.other_info_items
set allowed_roles = null
where allowed_roles @> array['guest', 'user', 'trip_editor', 'super_admin']::text[]
  and cardinality(allowed_roles) = 4;

update public.other_info_items
set allowed_roles = array['trip_editor', 'super_admin']::text[]
where allowed_roles is not null
  and allowed_roles <> array['trip_editor', 'super_admin']::text[];

alter table public.other_info_items
  drop constraint if exists other_info_items_allowed_roles_check;

alter table public.other_info_items
  add constraint other_info_items_allowed_roles_check check (
    allowed_roles is null
    or allowed_roles = array['trip_editor', 'super_admin']::text[]
  );

commit;;
