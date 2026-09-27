-- V3.9.17 RC2: narrow Change Journal to Trip master changes and
-- make shared checklist category self-contained in checklist_items.

begin;

alter table public.checklist_items
  add column if not exists category text null;

-- Existing shared rows predate the dedicated category column. Preserve their
-- current category from the Trip seed once, then let checklist_items own it.
update public.checklist_items as checklist_item
set category = seed.item ->> 'category'
from public.checklists as checklist
join public.trips as trip
  on trip.id = checklist.trip_id
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(trip.content -> 'checklistData') = 'array'
      then trip.content -> 'checklistData'
    else '[]'::jsonb
  end
) as seed(item)
where checklist_item.checklist_id = checklist.id
  and checklist.scope = 'shared'
  and checklist_item.category is null
  and checklist_item.client_item_id = seed.item ->> 'id'
  and nullif(seed.item ->> 'category', '') is not null;

drop trigger if exists trips_record_checklist_summary on public.trips;
drop trigger if exists expenses_record_change_summary on public.expenses;

drop function if exists private.tc_record_checklist_summary();
drop function if exists private.tc_record_expense_summary();

delete from public.trip_change_journal
where category in ('checklist', 'expense');

alter table public.trip_change_journal
  drop constraint if exists trip_change_journal_category_check;

alter table public.trip_change_journal
  add constraint trip_change_journal_category_check
  check (category in ('itinerary', 'photo', 'settings'));

commit;
