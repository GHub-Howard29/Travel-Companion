-- ADR-001 Stage 1: the Lease list RPC invokes a volatile permission assertion.
alter function public.tc_list_itinerary_trip_edit_leases(text) volatile;
