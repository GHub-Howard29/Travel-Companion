create index if not exists trips_created_by_idx
on public.trips (created_by);

drop policy if exists trips_insert_policy on public.trips;
create policy trips_insert_policy
on public.trips
for insert
with check (
  (select auth.uid()) is not null
  and (
    (select public.tc_is_super_admin())
    or (select public.tc_is_trip_editor(id))
  )
);

drop policy if exists trips_update_policy on public.trips;
create policy trips_update_policy
on public.trips
for update
using (
  (select public.tc_is_super_admin())
  or (select public.tc_is_trip_editor(id))
)
with check (
  (select public.tc_is_super_admin())
  or (select public.tc_is_trip_editor(id))
);

drop policy if exists trips_delete_policy on public.trips;
create policy trips_delete_policy
on public.trips
for delete
using ((select public.tc_is_super_admin()));;
