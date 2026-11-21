import type { SupabaseClient } from "@supabase/supabase-js";
import { ITINERARY_EDIT_CLIENT_ID } from "./itineraryCardEditLeaseService.ts";

export interface ItineraryCloudVersion {
  version: number;
  updatedAt: string;
}

export class ItineraryCloudVersionConflictError extends Error {
  readonly currentVersion: number;
  constructor(currentVersion: number) {
    super("雲端每日行程已更新，需重新校正本機資料。");
    this.name = "ItineraryCloudVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export const readItineraryCloudVersion = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<ItineraryCloudVersion> => {
  const { data, error } = await supabase.rpc("tc_read_itinerary_version", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !Number.isSafeInteger(Number(row.version)) || Number(row.version) < 1) {
    throw new Error("可信每日行程版本讀取回應無效。");
  }
  return {
    version: Number(row.version),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
};

export interface ItineraryCloudSaveResult {
  saved: boolean;
  currentVersion: number;
  updatedAt: string | null;
}
export const saveItineraryDaysToCloud = async (
  supabase: SupabaseClient,
  input: { tripId: string; clientId: string; expectedVersion: number; daysData: Record<string, unknown[]>; operationId: string },
): Promise<ItineraryCloudSaveResult> => {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error("Save RPC 版本基準無效。");
  const { data, error } = await supabase.rpc("tc_save_itinerary_days", {
    p_trip_id: input.tripId,
    p_client_id: input.clientId,
    p_expected_version: input.expectedVersion,
    p_days_data: input.daysData,
    p_operation_id: input.operationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.saved !== "boolean" || !Number.isSafeInteger(Number(row.current_version))) {
    throw new Error("每日行程 Save RPC 回應格式錯誤。");
  }
  if (!row.saved) throw new ItineraryCloudVersionConflictError(Number(row.current_version));
  if (typeof row.updated_at !== "string" || !row.updated_at) throw new Error("Save RPC 未回傳確認時間。");
  return { saved: row.saved, currentVersion: Number(row.current_version), updatedAt: row.updated_at };
};

export { ItineraryCloudVersionConflictError as ItineraryCasConflictError };

export const saveItineraryDaysDataCloud = async (
  supabase: SupabaseClient,
  tripId: string,
  expectedVersion: number,
  daysData: Record<string, unknown[]>,
): Promise<ItineraryCloudVersion> => {
  const { data, error } = await supabase.rpc("tc_save_itinerary_days", {
    p_trip_id: tripId,
    p_client_id: ITINERARY_EDIT_CLIENT_ID,
    p_expected_version: expectedVersion,
    p_days_data: daysData,
    p_operation_id: crypto.randomUUID(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.saved !== "boolean") {
    throw new Error("每日行程 Save RPC 回應格式無效。");
  }
  if (!row.saved) throw new ItineraryCloudVersionConflictError(Number(row.current_version));
  if (!Number.isSafeInteger(Number(row.current_version)) || Number(row.current_version) < 1) {
    throw new Error("每日行程保存成功但版本回應無效。");
  }
  return {
    version: Number(row.current_version),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
};
