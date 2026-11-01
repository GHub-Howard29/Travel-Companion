import type { SupabaseClient } from "@supabase/supabase-js";

const ITINERARY_EDIT_CLIENT_STORAGE_KEY = "travel_companion_itinerary_edit_client_id";

const getItineraryEditClientId = (): string => {
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

export const claimItineraryCardEditLease = async (
  supabase: SupabaseClient,
  tripId: string,
  cardId: string,
): Promise<ItineraryCardEditLeaseClaim> => {
  const { data, error } = await supabase.rpc("tc_claim_itinerary_card_edit_lease", {
    p_trip_id: tripId,
    p_card_id: cardId,
    p_client_id: ITINERARY_EDIT_CLIENT_ID,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.acquired !== "boolean") {
    throw new Error("無法確認卡片編輯權，請稍後重試。");
  }
  return {
    acquired: row.acquired,
    ownerUserId: typeof row.owner_user_id === "string" ? row.owner_user_id : null,
    ownerClientId: typeof row.owner_client_id === "string" ? row.owner_client_id : null,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
  };
};

export const renewItineraryCardEditLease = async (
  supabase: SupabaseClient,
  tripId: string,
  cardId: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc("tc_renew_itinerary_card_edit_lease", {
    p_trip_id: tripId,
    p_card_id: cardId,
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
  const { error } = await supabase.rpc("tc_release_itinerary_card_edit_lease", {
    p_trip_id: tripId,
    p_card_id: cardId,
    p_client_id: ITINERARY_EDIT_CLIENT_ID,
  });
  if (error) throw error;
};

export const listItineraryCardEditLeases = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<ItineraryCardEditLease[]> => {
  const { data, error } = await supabase.rpc("tc_list_itinerary_card_edit_leases", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  if (data == null) return [];
  if (!Array.isArray(data)) {
    throw new Error("卡片編輯租約清單回應格式錯誤。");
  }
  return data.flatMap((value): ItineraryCardEditLease[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (
      typeof row.card_id !== "string" ||
      typeof row.owner_user_id !== "string" ||
      typeof row.expires_at !== "string"
    ) {
      return [];
    }
    return [{
      cardId: row.card_id,
      ownerUserId: row.owner_user_id,
      ownerClientId: typeof row.owner_client_id === "string" ? row.owner_client_id : "",
      expiresAt: row.expires_at,
    }];
  });
};
