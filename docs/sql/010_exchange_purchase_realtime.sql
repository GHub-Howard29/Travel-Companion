-- Travel Companion V3.3.0 Exchange Purchase Realtime
-- Updated: 2026-07-20
--
-- Publish exchange purchase changes so active Trip editors and super admins
-- can refresh their calculator when another permitted client updates history.

alter publication supabase_realtime add table public.exchange_purchases;
