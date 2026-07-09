/**
 * Travel Companion V3
 * ==========================================
 * Permission（權限）定義
 * ==========================================
 *
 * Design Principle（設計原則）
 * ------------------------------------------
 * Permission（權限）只依賴 PermissionContext（權限情境）。
 * 不依賴 React、Supabase、Storage 或任何外部系統。
 */

import { ROLE, type Role } from "./roles";

/**
 * Permission Context（權限情境）
 *
 * Workspace（工作區）先整理好所有事實（Facts），
 * Permission（權限）只負責根據這些事實建立權限。
 */
export interface PermissionContext {
  /** 使用者角色 */
  role: Role;

  /** 是否已登入 */
  isSignedIn: boolean;

  /** 是否屬於目前選擇的 Trip */
  isAssignedTrip: boolean;
}

/**
 * Permission（權限）
 */
export interface Permission {
  canUseCloudExpense: boolean;
  canUseLocalExpense: boolean;

  canViewReference: boolean;
  canEditReference: boolean;

  canViewSharedChecklist: boolean;
  canToggleSharedChecklist: boolean;

  canViewPrivateChecklist: boolean;
  canTogglePrivateChecklist: boolean;
  canEditPrivateChecklist: boolean;
  canSyncPrivateChecklist: boolean;
}

/**
 * 建立 Permission（權限）
 */
export function createPermission(
  context: PermissionContext,
): Permission {
  const isSuperAdmin = context.role === ROLE.SUPER_ADMIN;
  const isAssignedTripEditor =
    context.role === ROLE.TRIP_EDITOR && context.isAssignedTrip;
  const canEditSharedTripData = isSuperAdmin || isAssignedTripEditor;

  return {
    // Expense（記帳）
    canUseCloudExpense: canEditSharedTripData,
    canUseLocalExpense: context.isSignedIn,

    // Reference（旅行資訊）
    canViewReference: true,
    canEditReference: isSuperAdmin,

    // Shared Checklist（共用清單）
    canViewSharedChecklist: true,
    canToggleSharedChecklist: canEditSharedTripData,

    // Private Checklist（私人清單）
    canViewPrivateChecklist: context.isSignedIn,
    canTogglePrivateChecklist: context.isSignedIn,
    canEditPrivateChecklist: context.isSignedIn,
    canSyncPrivateChecklist: isAssignedTripEditor || isSuperAdmin,
  };
}
