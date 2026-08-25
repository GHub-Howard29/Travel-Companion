/**
 * Travel Companion V3
 * ==========================================
 * Role（角色）定義
 * ==========================================
 *
 * 本檔案負責：
 * 1. 定義系統角色
 * 2. 提供統一角色常數
 * 3. 提供 Role 型別
 *
 * 不負責：
 * - Permission（權限）
 * - React
 * - Supabase
 * - 商業邏輯
 */

/**
 * 系統角色常數
 *
 * 與 Supabase admin_users.role 保持一致，
 * 避免專案中直接使用字串。
 */
export const ROLE = {
  GUEST: "guest",
  USER: "user",
  TRIP_EDITOR: "trip_editor",
  SUPER_ADMIN: "super_admin",
} as const;

/**
 * 系統角色型別
 */
export type Role = (typeof ROLE)[keyof typeof ROLE];

/** 其他資訊敏感卡片的唯一可見角色集合。 */
export const MANAGER_ONLY_ROLES: Role[] = [
  ROLE.TRIP_EDITOR,
  ROLE.SUPER_ADMIN,
];

export const normalizeOtherInfoAllowedRoles = (
  roles?: readonly Role[] | null,
): Role[] | undefined => {
  if (!roles || roles.length === 0) return undefined;

  const roleSet = new Set(roles);
  const isExplicitlyPublic =
    roles.length === 4 &&
    roleSet.size === 4 &&
    roleSet.has(ROLE.GUEST) &&
    roleSet.has(ROLE.USER) &&
    roleSet.has(ROLE.TRIP_EDITOR) &&
    roleSet.has(ROLE.SUPER_ADMIN);
  if (isExplicitlyPublic) return undefined;

  return [...MANAGER_ONLY_ROLES];
};

export const isRestrictedOtherInfoRoles = (
  roles?: readonly Role[] | null,
): boolean => Boolean(roles && roles.length > 0);
