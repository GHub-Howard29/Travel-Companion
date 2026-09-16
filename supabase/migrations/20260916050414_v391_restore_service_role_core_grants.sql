-- Restore the service-role privileges that existed in the pre-migration
-- production schema but were missing from a clean local rebuild.
-- RLS remains enabled; service_role needs explicit table privileges before its
-- BYPASSRLS attribute can be useful to trusted Edge Functions.

grant select, insert, update, delete on table public.trips to service_role;
grant select, insert, update, delete on table public.admin_users to service_role;
grant usage, select on sequence public.admin_users_id_seq to service_role;

-- Restore Data API privileges from the legacy checklist/other-info schemas.
-- Existing RLS policies remain the row-level authorization boundary.
grant select on table public.checklists, public.checklist_items,
  public.other_info_items to anon, authenticated;
grant insert, update, delete on table public.checklists,
  public.checklist_items, public.other_info_items to authenticated;

grant select, insert, update, delete on table public.checklists,
  public.checklist_items, public.other_info_items,
  public.exchange_purchases, public.expenses to service_role;
