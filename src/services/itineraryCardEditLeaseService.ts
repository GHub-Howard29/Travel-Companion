import type { SupabaseClient } from "@supabase/supabase-js";

const ITINERARY_EDIT_CLIENT_STORAGE_KEY = "travel_companion_itinerary_edit_client_id";

const getItineraryEditClientId = (): string => {
  if (typeof sessionStorage === "undefined") return crypto.randomUUID();
  const existing = sessionStorage.getItem(ITINERARY_EDIT_CLIENT_STORAGE_KEY);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  const created = crypto.randomUUID();
  sessionStorage.setItem(ITINERARY_EDIT_CLIENT_STORAGE_KEY, created);
  return created;
};

export const ITINERARY_EDIT_CLIENT_ID = getItineraryEditClientId();
export const ITINERARY_EDIT_LEASE_HEARTBEAT_MS = 15_000;

const managedTripLeases = new Set<string>();
const locallyHeldTripEditorLeases = new Set<string>();

// Local ownership marker only; server RPCs remain the authority for Lease ownership.
export const setLocallyHeldTripEditorLease = (tripId: string, active: boolean): void => {
  if (active) locallyHeldTripEditorLeases.add(tripId);
  else locallyHeldTripEditorLeases.delete(tripId);
};

export const isLocallyHeldTripEditorLease = (tripId: string): boolean =>
  locallyHeldTripEditorLeases.has(tripId);

export const setManagedItineraryTripLease = (tripId: string, active: boolean): void => {
  if (active) managedTripLeases.add(tripId);
  else managedTripLeases.delete(tripId);
};

export const isManagedItineraryTripLeaseActive = (tripId: string): boolean =>
  managedTripLeases.has(tripId);

export interface ItineraryCardEditLease {
  cardId: string;
  ownerUserId: string;
  ownerClientId: string;
  expiresAt: string;
}

export interface ItineraryCardEditLeaseClaim {
  acquired: boolean;
  ownerUserId: string | null;
  ownerClientId: string | null;
  expiresAt: string | null;
}

const readLeaseRow = (data: unknown): ItineraryCardEditLeaseClaim => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("無法確認旅程編輯租約回應。");
  const value = row as Record<string, unknown>;
  return {
    acquired: value.acquired === true,
    ownerUserId: typeof value.owner_user_id === "string" ? value.owner_user_id : null,
    ownerClientId: typeof value.owner_client_id === "string" ? value.owner_client_id : null,
    expiresAt: typeof value.expires_at === "string" ? value.expires_at : null,
  };
};

export const claimItineraryCardEditLease = async (
  supabase: SupabaseClient,
  tripId: string,
  cardId: string,
): Promise<ItineraryCardEditLeaseClaim> => {
  void cardId;
  const { data, error } = await supabase.rpc("tc_claim_itinerary_trip_edit_lease", {
    p_trip_id: tripId,
    p_client_id: ITINERARY_EDIT_CLIENT_ID,
  });
  if (error) throw error;
  return readLeaseRow(data);
};

export const renewItineraryCardEditLease = async (
  supabase: SupabaseClient,
  tripId: string,
  cardId: string,
): Promise<boolean> => {
  void cardId;
  const { data, error } = await supabase.rpc("tc_renew_itinerary_trip_edit_lease", {
    p_trip_id: tripId,
    p_client_id: ITINERARY_EDIT_CLIENT_ID,
  });
  if (error) throw error;
  return data === true;
};

export const releaseItineraryCardEditLease = async (
  supabase: SupabaseClient,
  tripId: string,
  cardId: string,
): Promise<void> => {
  void cardId;
  const { error } = await supabase.rpc("tc_release_itinerary_trip_edit_lease", {
    p_trip_id: tripId,
    p_client_id: ITINERARY_EDIT_CLIENT_ID,
  });
  if (error) throw error;
};

export const listItineraryCardEditLeases = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<ItineraryCardEditLease[]> => {
  const { data, error } = await supabase.rpc("tc_list_itinerary_trip_edit_leases", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error("旅程編輯租約清單回應格式錯誤。");
  return data.flatMap((value): ItineraryCardEditLease[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.owner_user_id !== "string" || typeof row.expires_at !== "string") return [];
    return [{
      cardId: "__trip__",
      ownerUserId: row.owner_user_id,
      ownerClientId: typeof row.owner_client_id === "string" ? row.owner_client_id : "",
      expiresAt: row.expires_at,
    }];
  });
};
