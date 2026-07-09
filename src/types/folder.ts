/**
 * Folder Type（其他資訊資料夾型別）
 *
 * 定義「其他資訊」功能使用的樹狀資料夾結構。
 *
 * 第一層為系統固定分類，例如景點、機票、飯店。
 * 第二層開始由使用者依照旅程需求自由建立。
 *
 * Folder 不使用 type 或 category。
 * 分類由樹狀結構的第一層 Folder 決定。
 */

// ================================
// Public Types
// ================================

export interface Folder {
  /** 唯一 ID */
  id: string;

  /** 所屬 Trip */
  tripId: string;

  /** 父資料夾，第一層固定分類為 null */
  parentId: string | null;

  /** 顯示名稱 */
  title: string;

  /** 排序 */
  order: number;

  /** 是否為系統固定分類 */
  isSystem: boolean;

  /** 建立時間 */
  createdAt: string;

  /** 更新時間 */
  updatedAt: string;
}