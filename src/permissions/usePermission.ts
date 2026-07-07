/**
 * Travel Companion V3
 * ==========================================
 * usePermission（權限 Hook）
 * ==========================================
 *
 * Design Principle（設計原則）
 * ------------------------------------------
 * 本 Hook（React 自訂 Hook）只負責呼叫 createPermission，
 * 不包含任何商業邏輯。
 */

import { useMemo } from "react";

import {
  createPermission,
  type Permission,
  type PermissionContext,
} from "./permission";

/**
 * 建立目前使用者的 Permission（權限）
 */
export default function usePermission(
  context: PermissionContext,
): Permission {
  return useMemo(() => {
    return createPermission(context);
  }, [context]);
}