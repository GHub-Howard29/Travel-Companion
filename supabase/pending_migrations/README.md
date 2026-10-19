# Migration history alignment

The former `20261018100000_v3101_weather_source_url.sql` was renamed to `20261018085239_v3101_weather_source_url.sql` after checking the linked remote schema: the remote has `weather_daily_forecasts.source_url`, its check constraint, and the function body that writes `source_url`, matching that migration's effect. This aligns the filename with the remote migration-history version without changing SQL content.

The weather lease lock-order and coordinate-precision fix has been promoted into `supabase/migrations/20261019180000_v3107_weather_release_precision_fix.sql`. It is committed to `develop` for later release review but has **not** been applied to the linked remote database. The migration includes coordinate-first locking, lease-token and TTL revalidation, and a `1e-7` degree tolerance for JSONB floating-point serialization drift. Do not apply it to production until the formal release is explicitly approved.
