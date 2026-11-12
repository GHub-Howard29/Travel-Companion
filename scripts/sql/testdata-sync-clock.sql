-- Local-only test database change clock. Never add this file to Supabase migrations.
DO $tc_setup$
DECLARE
  table_name text;
BEGIN
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS tc_testdata';
  EXECUTE 'REVOKE ALL ON SCHEMA tc_testdata FROM PUBLIC, anon, authenticated';
  EXECUTE 'CREATE TABLE IF NOT EXISTS tc_testdata.sync_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    local_last_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_synced_at timestamptz
  )';
  EXECUTE 'INSERT INTO tc_testdata.sync_state (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING';

  EXECUTE $function_ddl$
    CREATE OR REPLACE FUNCTION tc_testdata.touch_local_last_changed_at()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, tc_testdata
    AS $function_body$
    DECLARE
      was_in_sync_scope boolean := false;
      is_in_sync_scope boolean := false;
    BEGIN
      -- Membership changes count when either OLD or NEW belongs to the Git dataset.
      IF TG_OP <> 'INSERT' THEN
        IF TG_TABLE_NAME = 'trips' THEN
          was_in_sync_scope := OLD.is_public IS FALSE;
        ELSIF TG_TABLE_NAME = 'checklists' THEN
          was_in_sync_scope := OLD.scope = 'shared' AND EXISTS (
            SELECT 1 FROM public.trips t WHERE t.id = OLD.trip_id AND t.is_public IS FALSE
          );
        ELSIF TG_TABLE_NAME = 'checklist_items' THEN
          was_in_sync_scope := EXISTS (
            SELECT 1 FROM public.checklists c JOIN public.trips t ON t.id = c.trip_id
            WHERE c.id = OLD.checklist_id AND c.scope = 'shared' AND t.is_public IS FALSE
          );
        ELSIF TG_TABLE_NAME IN ('expenses', 'exchange_purchases', 'other_info_items') THEN
          was_in_sync_scope := EXISTS (
            SELECT 1 FROM public.trips t WHERE t.id = OLD.trip_id AND t.is_public IS FALSE
          );
        END IF;
      END IF;

      IF TG_OP <> 'DELETE' THEN
        IF TG_TABLE_NAME = 'trips' THEN
          is_in_sync_scope := NEW.is_public IS FALSE;
        ELSIF TG_TABLE_NAME = 'checklists' THEN
          is_in_sync_scope := NEW.scope = 'shared' AND EXISTS (
            SELECT 1 FROM public.trips t WHERE t.id = NEW.trip_id AND t.is_public IS FALSE
          );
        ELSIF TG_TABLE_NAME = 'checklist_items' THEN
          is_in_sync_scope := EXISTS (
            SELECT 1 FROM public.checklists c JOIN public.trips t ON t.id = c.trip_id
            WHERE c.id = NEW.checklist_id AND c.scope = 'shared' AND t.is_public IS FALSE
          );
        ELSIF TG_TABLE_NAME IN ('expenses', 'exchange_purchases', 'other_info_items') THEN
          is_in_sync_scope := EXISTS (
            SELECT 1 FROM public.trips t WHERE t.id = NEW.trip_id AND t.is_public IS FALSE
          );
        END IF;
      END IF;

      IF NOT was_in_sync_scope AND NOT is_in_sync_scope THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END IF;

      UPDATE tc_testdata.sync_state
      SET local_last_changed_at = clock_timestamp()
      WHERE singleton = true;

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $function_body$;
  $function_ddl$;

  EXECUTE 'REVOKE ALL ON FUNCTION tc_testdata.touch_local_last_changed_at() FROM PUBLIC, anon, authenticated';

  FOR table_name IN
    SELECT unnest(ARRAY[
      'trips',
      'checklists',
      'checklist_items',
      'expenses',
      'exchange_purchases',
      'other_info_items'
    ]::text[])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tc_testdata_track_change ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER tc_testdata_track_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION tc_testdata.touch_local_last_changed_at()',
      table_name
    );
  END LOOP;
END;
$tc_setup$;
