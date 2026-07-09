/**
 * Checklist Type（檢查清單型別）
 *
 * Trip JSON 仍提供 checklistData 作為共同檢查清單 seed。
 * 使用者勾選狀態目前以 Trip-scoped localStorage 保存。
 */

export interface ChecklistProgress {
  tripId: string;
  checkedItemIds: string[];
  updatedAt: string;
}

export interface PrivateChecklistItem {
  id: string;
  tripId: string;
  userId: string;
  label: string;
  isChecked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateChecklist {
  tripId: string;
  userId: string;
  items: PrivateChecklistItem[];
  updatedAt: string;
}
