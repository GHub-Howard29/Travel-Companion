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