/**
 * ==========================================================
 * Travel Companion
 * 檔案：admin.ts
 * 功能：管理者相關型別
 *
 * 職責：
 * 1. 定義管理員資料格式
 * 2. 定義管理員角色
 * ==========================================================
 */

export interface AdminUser {
  email: string;
  role: 'super_admin' | 'trip_editor';
  trip_id: string | null;
}

export interface AdminProfile {
  user_id: string;
  email: string;
  display_name: string;
  include_in_new_trip: boolean;
  sort_order: number;
}
