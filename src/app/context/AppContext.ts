import { createContext } from "react";
import type { Permission } from "../../permissions/permission";
import type { Role } from "../../permissions/roles";

// ==================================================
// App Context
// 負責管理整個 App 共用的全域資料型別。
// 只包含所有 Feature 都需要的資訊，不放任何 Feature 專屬資料。
// ==================================================

export interface AppContextValue {
  userEmail: string | null;
  userId: string | null;
  selectedTripId: string;
  isSignedIn: boolean;
  isAssignedTrip: boolean;
  role: Role;
  permission: Permission;
}

// ==================================================
// 建立 App Context
// 由 AppProvider 統一提供全域資料。
// ==================================================

export const AppContext = createContext<AppContextValue | null>(null);
