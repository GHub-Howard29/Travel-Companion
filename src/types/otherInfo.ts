/**
 * Other Info Type（其他資訊內容型別）
 *
 * 定義「其他資訊」功能的內容資料。
 *
 * Folder 負責分類與分層。
 * OtherInfoItem 負責實際顯示內容。
 *
 * seed data 作為預設資料，APP 內新增 / 編輯 / 刪除
 * 目前以 localStorage 作為本機覆寫層。
 *
 * allowedRoles 用於限制內容可閱讀角色，
 * 未設定代表所有角色皆可閱讀。
 */

// ================================
// Import
// ================================

import type { Role } from "../permissions/roles";

// ================================
// Public Types
// ================================

export interface OtherInfoItem {
  /** 唯一 ID */
  id: string;

  /** 所屬 Trip */
  tripId: string;

  /** 所屬 Folder */
  folderId: string;

  /** 內容標題 */
  title: string;

  /** 主要文字內容 */
  content: string;

  /** 可閱讀角色，未設定代表不限制 */
  allowedRoles?: Role[];

  /** 交通／原始分類排序 */
  order: number;

  /** 自駕須知視圖排序；未設定時沿用交通排序建立初始順序 */
  selfGuidedOrder?: number;

  /** 建立時間 */
  createdAt: string;

  /** 更新時間 */
  updatedAt: string;

  /** 本機刪除標記，用於覆蓋 seed data */
  isDeleted?: boolean;
}
