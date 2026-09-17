export interface SystemUsageUserSummary {
  email: string;
  firstUsedAt: string;
  lastUsedAt: string;
  validSessionCount: number;
}

export interface SystemUsageSummary {
  totalUsers: number;
  trackedUsers: number;
  systemDeveloperEmail: string;
  checkedAt: string;
  users: SystemUsageUserSummary[];
}

interface SystemUsageSummaryRpcUser {
  email?: unknown;
  first_used_at?: unknown;
  last_used_at?: unknown;
  valid_session_count?: unknown;
}

interface SystemUsageSummaryRpc {
  total_users?: unknown;
  tracked_users?: unknown;
  system_developer_email?: unknown;
  checked_at?: unknown;
  users?: unknown;
}

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const parseSystemUsageSummary = (
  value: unknown,
): SystemUsageSummary | null => {
  if (!value || typeof value !== "object") return null;
  const rpcSummary = value as SystemUsageSummaryRpc;
  if (
    !isNonNegativeNumber(rpcSummary.total_users) ||
    !isNonNegativeNumber(rpcSummary.tracked_users) ||
    typeof rpcSummary.system_developer_email !== "string" ||
    typeof rpcSummary.checked_at !== "string" ||
    !Array.isArray(rpcSummary.users)
  ) {
    return null;
  }

  const users: SystemUsageUserSummary[] = [];
  for (const item of rpcSummary.users) {
    if (!item || typeof item !== "object") return null;
    const user = item as SystemUsageSummaryRpcUser;
    if (
      typeof user.email !== "string" ||
      typeof user.first_used_at !== "string" ||
      typeof user.last_used_at !== "string" ||
      !isNonNegativeNumber(user.valid_session_count)
    ) {
      return null;
    }
    users.push({
      email: user.email,
      firstUsedAt: user.first_used_at,
      lastUsedAt: user.last_used_at,
      validSessionCount: user.valid_session_count,
    });
  }

  return {
    totalUsers: rpcSummary.total_users,
    trackedUsers: rpcSummary.tracked_users,
    systemDeveloperEmail: rpcSummary.system_developer_email,
    checkedAt: rpcSummary.checked_at,
    users,
  };
};
