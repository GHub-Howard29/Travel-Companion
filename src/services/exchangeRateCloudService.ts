import type { SupabaseClient } from "@supabase/supabase-js";

import type { TripExchangePurchase } from "../types";

interface CloudExchangePurchaseRow {
  client_item_id: string;
  trip_id: string;
  foreign_currency: string;
  purchase_date: string;
  twd_amount: number | string;
  foreign_amount: number | string;
  created_at: string;
  updated_at: string;
}

const toPurchase = (row: CloudExchangePurchaseRow): TripExchangePurchase => ({
  id: row.client_item_id,
  tripId: row.trip_id,
  foreignCurrency: row.foreign_currency,
  purchaseDate: row.purchase_date,
  twdAmount: Number(row.twd_amount),
  foreignAmount: Number(row.foreign_amount),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toCloudRow = (item: TripExchangePurchase) => ({
  trip_id: item.tripId,
  client_item_id: item.id,
  foreign_currency: item.foreignCurrency,
  purchase_date: item.purchaseDate,
  twd_amount: item.twdAmount,
  foreign_amount: item.foreignAmount,
});

export const getCloudExchangePurchases = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<TripExchangePurchase[] | null> => {
  if (!navigator.onLine) return null;

  const { data, error } = await supabase
    .from("exchange_purchases")
    .select("client_item_id, trip_id, foreign_currency, purchase_date, twd_amount, foreign_amount, created_at, updated_at")
    .eq("trip_id", tripId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Failed to load cloud exchange purchases", error);
    return null;
  }

  return (data as CloudExchangePurchaseRow[] | null ?? []).map(toPurchase);
};

export const upsertCloudExchangePurchases = async (
  supabase: SupabaseClient,
  purchases: TripExchangePurchase[],
): Promise<boolean> => {
  if (!navigator.onLine || purchases.length === 0) return false;

  const { error } = await supabase
    .from("exchange_purchases")
    .upsert(purchases.map(toCloudRow), { onConflict: "trip_id,client_item_id" });

  if (error) {
    console.warn("Failed to sync cloud exchange purchases", error);
    return false;
  }

  return true;
};

export const deleteCloudExchangePurchase = async (
  supabase: SupabaseClient,
  tripId: string,
  purchaseId: string,
): Promise<boolean> => {
  if (!navigator.onLine) return false;

  const { error } = await supabase
    .from("exchange_purchases")
    .delete()
    .eq("trip_id", tripId)
    .eq("client_item_id", purchaseId);

  if (error) {
    console.warn("Failed to delete cloud exchange purchase", error);
    return false;
  }

  return true;
};
