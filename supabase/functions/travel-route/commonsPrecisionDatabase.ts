import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import type { CommonsPrecisionCacheKind } from "./commonsPrecisionCache.ts";
import type { CommonsPrecisionUsageDelta } from "./commonsPrecisionUsage.ts";

const throwDatabaseError = (error: unknown): void => {
  if (error) throw error;
};

export const claimCommonsPrecisionUpstreamSlot = async (admin: SupabaseClient): Promise<boolean> => {
  const { data, error } = await admin.rpc("tc_claim_commons_precision_upstream_slot", {
    maximum_per_minute: 20,
    maximum_per_day: 900,
  });
  throwDatabaseError(error);
  return data === true;
};

export const acquireCommonsPrecisionUpstreamLock = async (admin: SupabaseClient, token: string): Promise<boolean> => {
  const { data, error } = await admin.rpc("tc_acquire_commons_precision_upstream_lock", { requested_token: token });
  throwDatabaseError(error);
  return data === true;
};

export const releaseCommonsPrecisionUpstreamLock = async (admin: SupabaseClient, token: string): Promise<void> => {
  const { error } = await admin.rpc("tc_release_commons_precision_upstream_lock", { requested_token: token });
  throwDatabaseError(error);
};

export const acquireCommonsPrecisionOperationLock = async (admin: SupabaseClient, lockKey: string): Promise<boolean> => {
  const { data, error } = await admin.rpc("tc_acquire_commons_precision_cache_lock", { requested_key: lockKey });
  throwDatabaseError(error);
  return data === true;
};

export const releaseCommonsPrecisionOperationLock = async (admin: SupabaseClient, lockKey: string): Promise<void> => {
  const { error } = await admin.rpc("tc_release_commons_precision_cache_lock", { requested_key: lockKey });
  throwDatabaseError(error);
};

export const readCommonsPrecisionCache = async <T>(
  admin: SupabaseClient,
  cacheKey: string,
  expectedKind: CommonsPrecisionCacheKind,
): Promise<T | null> => {
  const { data, error } = await admin
    .from("commons_precision_cache")
    .select("payload")
    .eq("cache_key", cacheKey)
    .eq("cache_kind", expectedKind)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  throwDatabaseError(error);
  return data && typeof data === "object" && "payload" in data ? data.payload as T : null;
};

export const writeCommonsPrecisionCache = async (
  admin: SupabaseClient,
  input: { key: string; kind: Exclude<CommonsPrecisionCacheKind, "in-progress-lock">; payload: object; expiresAt: Date },
): Promise<boolean> => {
  const { data, error } = await admin.rpc("tc_put_commons_precision_cache", {
    requested_key: input.key,
    requested_kind: input.kind,
    requested_payload: input.payload,
    requested_expires_at: input.expiresAt.toISOString(),
  });
  throwDatabaseError(error);
  return data === true;
};

export const recordCommonsPrecisionUsage = async (
  admin: SupabaseClient,
  dateKey: string,
  delta: CommonsPrecisionUsageDelta,
): Promise<void> => {
  const { data, error } = await admin.rpc("tc_add_commons_precision_usage", {
    requested_date: dateKey,
    delta,
  });
  throwDatabaseError(error);
  if (data !== true) throw new Error("精準搜尋用量彙總未寫入");
};
