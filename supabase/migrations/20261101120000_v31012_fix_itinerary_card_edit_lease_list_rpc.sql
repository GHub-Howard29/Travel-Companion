begin;

drop function public.tc_list_itinerary_card_edit_leases(text);

create function public.tc_list_itinerary_card_edit_leases(p_trip_id text)
returns table (card_id text, owner_user_id uuid, owner_client_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.card_id, l.owner_user_id, l.owner_client_id, l.expires_at
  from public.itinerary_card_edit_leases l
  where l.trip_id = p_trip_id
    and l.expires_at > clock_timestamp()
    and exists (
      select 1 from public.admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (au.role = 'super_admin' or (au.role = 'trip_editor' and au.trip_id = p_trip_id))
    );
$$;

revoke all on function public.tc_list_itinerary_card_edit_leases(text) from public, anon;
grant execute on function public.tc_list_itinerary_card_edit_leases(text) to authenticated;

commit;
