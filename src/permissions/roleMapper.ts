/**
 * Travel Companion V3
 * ==========================================
 * Role Mapper（角色映射）
 * ==========================================
 *
 * Design Principle（設計原則）
 * ------------------------------------------
 * Role Mapper（角色映射）只依賴 Workspace（工作區）
 * 提供的事實（Facts），不依賴任何外部系統。
 */

import { ROLE, type Role } from "./roles";

/**
 * Role Mapper Context（角色映射情境）
 */
export interface RoleMapperContext {
  /** 是否已登入 */
  isSignedIn: boolean;

  /** Supabase Role（Supabase 角色） */
  adminRole: string | null;

  /** 是否屬於目前 Trip */
  isAssignedTrip: boolean;
}

/**
 * 建立 System Role（系統角色）
 */
export function mapRole(
  context: RoleMapperContext,
): Role {
  if (!context.isSignedIn) {
    return ROLE.GUEST;
  }

  if (context.adminRole === ROLE.SUPER_ADMIN) {
    return ROLE.SUPER_ADMIN;
  }

  if (
    context.adminRole === ROLE.TRIP_EDITOR &&
    context.isAssignedTrip
  ) {
    return ROLE.TRIP_EDITOR;
  }

  return ROLE.USER;
}