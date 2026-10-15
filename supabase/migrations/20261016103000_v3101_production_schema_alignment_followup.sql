-- Follow-up corrections kept separate so the already-applied alignment migration remains immutable.
-- Rename the identity sequence created from the temporary column name during UUID -> bigint conversion.
do $$
begin
  if to_regclass('public.expenses_id__production_seq') is not null then
    if to_regclass('public.expenses_id_seq') is not null then
      raise exception 'SCHEMA_ALIGNMENT_BLOCKED_DUPLICATE_EXPENSES_SEQUENCE';
    end if;
    alter sequence public.expenses_id__production_seq rename to expenses_id_seq;
  end if;
end;
$$;

-- Match the existing production admin_users constraints (production does not define these checks).
alter table public.admin_users drop constraint if exists admin_users_normalized_email_check;
alter table public.admin_users drop constraint if exists admin_users_role_check;

-- Match production identity-guard function definitions and keep trigger functions non-public.
create or replace function public.tc_prevent_checklist_identity_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.trip_id is distinct from new.trip_id
    or old.scope is distinct from new.scope
    or old.owner_user_id is distinct from new.owner_user_id
  then
    raise exception 'checklist identity fields cannot be changed';
  end if;

  return new;
end;
$$;
revoke all on function public.tc_prevent_checklist_identity_update() from public;
grant execute on function public.tc_prevent_checklist_identity_update() to postgres, service_role;

create or replace function public.tc_prevent_exchange_purchase_identity_update()
returns trigger language plpgsql set search_path = '' as $$
begin if new.trip_id <> old.trip_id then raise exception 'Cannot change exchange purchase trip_id'; end if; if new.client_item_id <> old.client_item_id then raise exception 'Cannot change exchange purchase client_item_id'; end if; return new; end;
$$;
revoke all on function public.tc_prevent_exchange_purchase_identity_update() from public;
grant execute on function public.tc_prevent_exchange_purchase_identity_update() to postgres, service_role;

create or replace function public.tc_prevent_other_info_identity_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.trip_id <> old.trip_id then
    raise exception 'Cannot change other info trip_id';
  end if;

  if new.client_item_id is distinct from old.client_item_id then
    raise exception 'Cannot change other info client_item_id';
  end if;

  return new;
end;
$$;
revoke all on function public.tc_prevent_other_info_identity_update() from public;
grant execute on function public.tc_prevent_other_info_identity_update() to postgres, service_role;
