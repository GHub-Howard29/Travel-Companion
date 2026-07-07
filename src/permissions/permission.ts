/**
 * Travel Companion V3
 * ==========================================
 * Permission（權限）定義
 * ==========================================
 *
 * 本檔案負責：
 * 1. 定義 Permission Context（權限情境）
 * 2. 定義 Permission（權限）
 * 3. 建立 Permission Object（權限物件）
 *
 * 不負責：
 * - React
 * - Supabase
 * - Storage
 * - IndexedDB
 */

import { ROLE, type Role } from "./roles";

/**
 * Permission Context（權限情境）
 *
 * 建立權限時所需的最小資訊。
 */
export interface PermissionContext {
  /** 目前登入角色 */
  role: Role;

  /** 目前選擇的 Trip */
  selectedTripId: string;

  /** 此角色所屬的 Trip（若沒有則為 null） */
  assignedTripId: string | null;
}

/**
 * Permission（權限）
 *
 * 所有畫面都只應判斷 Permission，
 * 不直接判斷 Role。
 */
export interface Permission {
  /** 是否可使用雲端帳本 */
  canUseCloudExpense: boolean;

  /** 是否可使用本機帳本 */
  canUseLocalExpense: boolean;

  /** 是否可查看 Reference */
  canViewReference: boolean;

  /** 是否可編輯 Reference */
  canEditReference: boolean;

  /** 是否可查看共用 Checklist */
  canViewSharedChecklist: boolean;

  /** 是否可編輯共用 Checklist */
  canEditSharedChecklist: boolean;

  /** 是否可使用我的 Checklist */
  canUseMyChecklist: boolean;
}

/**
 * 建立 Permission Object（權限物件）
 */
export function createPermission(
  context: PermissionContext,
): Permission {
  const isSuperAdmin =
    context.role === ROLE.SUPER_ADMIN;

  const isTripEditor =
    context.role === ROLE.TRIP_EDITOR &&
    context.assignedTripId === context.selectedTripId;

  const isEditor = isSuperAdmin || isTripEditor;

  const isSignedIn =
    context.role !== ROLE.GUEST;

  return {
    // Expense（記帳）
    canUseCloudExpense: isEditor,
    canUseLocalExpense: isSignedIn,

    // Reference（旅行資訊）
    canViewReference: true,
    canEditReference: isSuperAdmin,

    // Shared Checklist（共用清單）
    canViewSharedChecklist: true,
    canEditSharedChecklist: isEditor,

    // My Checklist（我的清單）
    canUseMyChecklist: true,
  };
}