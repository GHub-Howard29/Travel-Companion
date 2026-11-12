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
    BEGIN
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
