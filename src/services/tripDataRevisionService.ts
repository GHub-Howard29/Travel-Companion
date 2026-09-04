import type { SupabaseClient } from "@supabase/supabase-js";

export const APP_SOURCE_CLIENT_ID = crypto.randomUUID();
export const APP_SOURCE_CLIENT_HEADER = "x-travel-companion-client-id";

export interface AppDataRevision {
  revision: number;
  updatedAt: string;
  sourceClientId: string | null;
}

export interface CurrentTripRemoteAccess {
  tripExists: boolean;
  isSuperAdmin: boolean;
  isCurrentTripEditor: boolean;
  hasManagementRole: boolean;
}

interface AppDataRevisionRow {
  revision: number | string;
  updated_at: string;
  source_client_id: string | null;
}

export const toAppDataRevision = (
  value: unknown,
): AppDataRevision | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<AppDataRevisionRow>;
  const revision = Number(row.revision);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof row.updated_at !== "string" ||
    (row.source_client_id !== null &&
      row.source_client_id !== undefined &&
      typeof row.source_client_id !== "string")
  ) {
    return null;
  }

  return {
    revision,
    updatedAt: row.updated_at,
    sourceClientId: row.source_client_id ?? null,
  };
};

export const getAppDataRevision = async (
  supabase: SupabaseClient,
): Promise<AppDataRevision | null> => {
  if (!navigator.onLine) return null;

  const { data, error } = await supabase
    .from("app_data_revision")
    .select("revision, updated_at, source_client_id")
    .eq("singleton", true)
    .maybeSingle();

  if (error) throw error;
  return toAppDataRevision(data);
};

export const getCurrentTripRemoteAccess = async (
  supabase: SupabaseClient,
  tripId: string,
  userEmail: string,
): Promise<CurrentTripRemoteAccess> => {
  const normalizedEmail = userEmail.trim().toLowerCase();
  const [tripResult, roleResult] = await Promise.all([
    supabase.from("trips").select("id").eq("id", tripId).maybeSingle(),
    supabase
      .from("admin_users")
      .select("role, trip_id")
      .eq("email", normalizedEmail),
  ]);

  if (tripResult.error) throw tripResult.error;
  if (roleResult.error) throw roleResult.error;

  const roles = (roleResult.data ?? []) as Array<{
    role: string;
    trip_id: string | null;
  }>;
  const isSuperAdmin = roles.some((row) => row.role === "super_admin");
  const isCurrentTripEditor = roles.some(
    (row) => row.role === "trip_editor" && row.trip_id === tripId,
  );

  return {
    tripExists: Boolean(tripResult.data),
    isSuperAdmin,
    isCurrentTripEditor,
    hasManagementRole:
      isSuperAdmin || roles.some((row) => row.role === "trip_editor"),
  };
};

export const shouldNotifyForRevision = (
  knownRevision: number,
  nextRevision: AppDataRevision,
  sourceClientId = APP_SOURCE_CLIENT_ID,
): boolean => {
  if (nextRevision.revision <= knownRevision) return false;
  const hasGap = nextRevision.revision > knownRevision + 1;
  return hasGap || nextRevision.sourceClientId !== sourceClientId;
};
