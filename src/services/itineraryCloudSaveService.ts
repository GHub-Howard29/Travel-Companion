import type { SupabaseClient } from "@supabase/supabase-js";

export interface ItineraryCloudSaveResult {
  saved: boolean;
  currentVersion: number;
  updatedAt: string | null;
}

export class ItineraryCloudVersionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("每日行程雲端版本已變更，不能覆寫舊版本");
    this.name = "ItineraryCloudVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

const parseSaveResult = (value: unknown): ItineraryCloudSaveResult => {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    throw new Error("每日行程保存 RPC 回應格式錯誤");
  }

  const result = row as Record<string, unknown>;
  const currentVersion = Number(result.current_version);
  if (
    typeof result.saved !== "boolean" ||
    !Number.isSafeInteger(currentVersion) ||
    currentVersion < 1 ||
    !(result.updated_at === null || typeof result.updated_at === "string")
  ) {
    throw new Error("每日行程保存 RPC 回應格式錯誤");
  }

  return {
    saved: result.saved,
    currentVersion,
    updatedAt: result.updated_at as string | null,
  };
};

export const saveItineraryDaysToCloud = async (
  supabase: SupabaseClient,
  input: {
    tripId: string;
    clientId: string;
    expectedVersion: number;
    daysData: Record<string, unknown[]>;
    operationId: string;
  },
): Promise<ItineraryCloudSaveResult> => {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("每日行程保存版本基準無效");
  }

  const { data, error } = await supabase.rpc("tc_save_itinerary_days", {
    p_trip_id: input.tripId,
    p_client_id: input.clientId,
    p_expected_version: input.expectedVersion,
    p_days_data: input.daysData,
    p_operation_id: input.operationId,
  });
  if (error) throw error;

  const result = parseSaveResult(data);
  if (!result.saved) {
    throw new ItineraryCloudVersionConflictError(result.currentVersion);
  }
  if (!result.updatedAt) {
    throw new Error("每日行程保存 RPC 未回傳確認時間");
  }
  return result;
};
