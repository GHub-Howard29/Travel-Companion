-- V3.6.4 Trip data revision rollback.
-- Apply only when intentionally reverting the V3.6.4 database layer.

begin;

drop trigger if exists trips_broadcast_data_revision_insert on public.trips;
drop trigger if exists trips_broadcast_data_revision_update on public.trips;
drop trigger if exists trips_broadcast_data_revision_delete on public.trips;
drop trigger if exists admin_users_broadcast_trip_editor_insert on public.admin_users;
drop trigger if exists admin_users_broadcast_trip_editor_update on public.admin_users;
drop trigger if exists admin_users_broadcast_trip_editor_delete on public.admin_users;

drop policy if exists app_data_revision_receive_broadcast on realtime.messages;
drop policy if exists app_data_revision_select_managers on public.app_data_revision;

drop function if exists private.tc_broadcast_trip_data_revision();
drop function if exists private.tc_request_source_client_id();
drop table if exists public.app_data_revision;

commit;
