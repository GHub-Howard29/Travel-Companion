/**
 * ==========================================================
 * Travel Companion
 * 檔案：expenseActions.ts
 * 功能：Expense 操作工具
 * ==========================================================
 */

import type {
  ExpenseItem,
  EditExpenseDraft,
} from '../types';

/**
 * 啟動帳目編輯模式。
 */
export const startEditExpense = (
  item: ExpenseItem,
  expenseMembers: string[],
  currentCurrencyCode: string,
  deleteConfirmTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setPendingDeleteId: React.Dispatch<React.SetStateAction<string | null>>,
  setEditingExpenseId: React.Dispatch<React.SetStateAction<string | null>>,
  setEditAttachmentFile: React.Dispatch<React.SetStateAction<File | null>>,
  setEditDraft: React.Dispatch<React.SetStateAction<EditExpenseDraft>>
) => {
  setPendingDeleteId(null);

  if (deleteConfirmTimerRef.current) {
    clearTimeout(deleteConfirmTimerRef.current);
    deleteConfirmTimerRef.current = null;
  }

  setEditingExpenseId(String(item.id));

  setEditAttachmentFile(null);

  setEditDraft({
    title: item.title || '',
    amount: String(item.amount || ''),
    payer: item.payer || expenseMembers[0] || '',
    currency: item.currency || currentCurrencyCode,
  });
};

/**
 * 取消編輯帳目。
 */
export const cancelEditExpense = (
  currentCurrencyCode: string,
  setEditingExpenseId: React.Dispatch<React.SetStateAction<string | null>>,
  setEditDraft: React.Dispatch<React.SetStateAction<EditExpenseDraft>>,
  setEditAttachmentFile: React.Dispatch<React.SetStateAction<File | null>>
) => {
  setEditingExpenseId(null);

  setEditDraft({
    title: '',
    amount: '',
    payer: '',
    currency: currentCurrencyCode,
  });

  setEditAttachmentFile(null);
};