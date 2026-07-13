export interface ExpenseItem { 
  id: string; 
  trip_id: string; 
  title: string; 
  amount: number; 
  payer: string; 
  currency?: string;
  expense_date?: string;
  created_at?: string;
  attachment_bucket?: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_status?: 'none' | 'local_pending' | 'synced' | 'upload_failed';
  attachment_uploaded_at?: string | null;
  attachment_uploaded_by?: string | null;
  attachment_last_error?: string | null;
  local_attachment_id?: string | null;
}

export type StoredExpenseItem = ExpenseItem;

export interface EditExpenseDraft {
  title: string;
  amount: string;
  payer: string;
  currency: string;
  expenseDate: string;
}
