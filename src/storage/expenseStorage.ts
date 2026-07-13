/**
 * ==========================================================
 * Travel Companion
 * 檔案：expenseStorage.ts
 * 功能：帳目資料(LocalStorage)存取工具
 *
 * 職責：
 * 1. 統一讀取 LocalStorage
 * 2. 將 JSON 轉換為 Expense 型別
 * 3. 管理共用帳本與個人帳本快取
 * 4. 提供 App.tsx 使用，不直接處理 UI
 * ==========================================================
 */

// 帳目相關常數
import {
  ATTACHMENT_BUCKET
} from '../constants/appConstants';

// 帳目型別
import type {
  StoredExpenseItem
} from '../types';

/**
 * 判斷未知資料是否為一般物件。
 * 用於避免 JSON.parse 後直接存取屬性造成錯誤。
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

/**
 * 從 LocalStorage 讀取指定 Key。
 * 若資料不存在、格式錯誤或解析失敗，
 * 一律回傳空陣列。
 */
export const readStorageArray = (key: string): unknown[] => {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toDateOnly = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (dateOnlyMatch) return value;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate.toISOString().slice(0, 10);
};

/**
 * 將 LocalStorage 的原始 JSON
 * 轉換成 StoredExpenseItem 型別。
 *
 * 同時補齊缺少欄位、
 * 套用預設值，
 * 避免舊版資料造成錯誤。
 */
export const toStoredExpenseItem = (
  value: unknown,
  fallbackTripId: string,
  fallbackCurrency: string
): StoredExpenseItem | null => {
  if (!isRecord(value)) return null;

  const tripId = typeof value.trip_id === 'string' ? value.trip_id : fallbackTripId;
  if (!tripId) return null;
  const createdAt = typeof value.created_at === 'string' ? value.created_at : undefined;
  const expenseDate =
    toDateOnly(value.expense_date) ??
    toDateOnly(createdAt) ??
    new Date().toISOString().slice(0, 10);

  return {
    // Supabase 的 id 為 bigint（number），
    // 先轉成字串保存；只有完全沒有 id 時才建立暫時 cached id。
    id:
    value.id !== undefined && value.id !== null
    ? String(value.id)
    : `cached_${Math.random()}`,
    trip_id: tripId,
    title: typeof value.title === 'string' && value.title ? value.title : '未命名消費',
    amount: Number(value.amount) || 0,
    payer: typeof value.payer === 'string' && value.payer ? value.payer : '我',
    currency: typeof value.currency === 'string' ? value.currency : fallbackCurrency,
    expense_date: expenseDate,
    attachment_bucket: typeof value.attachment_bucket === 'string' ? value.attachment_bucket : ATTACHMENT_BUCKET,
    attachment_path: typeof value.attachment_path === 'string' ? value.attachment_path : null,
    attachment_name: typeof value.attachment_name === 'string' ? value.attachment_name : null,
    attachment_mime: typeof value.attachment_mime === 'string' ? value.attachment_mime : null,
    attachment_size: typeof value.attachment_size === 'number' ? value.attachment_size : null,
    attachment_status:
      value.attachment_status === 'local_pending' ||
      value.attachment_status === 'synced' ||
      value.attachment_status === 'upload_failed'
        ? value.attachment_status
        : 'none',
    attachment_uploaded_at: typeof value.attachment_uploaded_at === 'string' ? value.attachment_uploaded_at : null,
    attachment_uploaded_by: typeof value.attachment_uploaded_by === 'string' ? value.attachment_uploaded_by : null,
    attachment_last_error: typeof value.attachment_last_error === 'string' ? value.attachment_last_error : null,
    local_attachment_id: typeof value.local_attachment_id === 'string' ? value.local_attachment_id : null,
    created_at: createdAt,
  };
};

/**
 * 讀取指定帳本的所有 Expense。
 *
 * 流程：
 * LocalStorage
 * →
 * JSON
 * →
 * StoredExpenseItem
 */
export const readStoredExpenses = (
  key: string,
  fallbackTripId: string,
  fallbackCurrency: string
): StoredExpenseItem[] => {
  return readStorageArray(key)
    .map((item) => toStoredExpenseItem(item, fallbackTripId, fallbackCurrency))
    .filter((item): item is StoredExpenseItem => item !== null);
};

/**
 * 合併目前旅程的：
 *
 * 1. 已快取帳目
 * 2. 離線新增帳目
 *
 * 回傳完整帳目清單。
 */
export const getStoredExpensesForTrip = (tripId: string, fallbackCurrency: string): StoredExpenseItem[] => {
  const cachedExpenses = readStoredExpenses(`cached_expenses_${tripId}`, tripId, fallbackCurrency);
  const offlineExpenses = readStoredExpenses('offline_expenses', '', fallbackCurrency)
    .filter((item) => item.trip_id === tripId);

  return [...cachedExpenses, ...offlineExpenses];
};

/**
 * 建立旅程帳本在 LocalStorage
 * 使用的 Key 名稱。
 */
export const toBookStorageKey = (bookTripId: string) => {
  return `cached_expenses_${bookTripId}`;
};

/**
 * 建立個人帳本專屬 Trip ID。
 *
 * 格式：
 * 原 Trip ID + 使用者 Email
 */
export const toPersonalBookTripId = (tripId: string, email: string) => {
  return `${tripId}::personal::${email.trim().toLowerCase()}`;
};

/**
 * 判斷目前 Trip ID
 * 是否屬於個人帳本。
 */
export const isPersonalBookTripId = (tripId: string) => {
  return tripId.includes('::personal::');
};

/**
 * 更新 LocalStorage 中指定帳目。
 *
 * 若為離線共用帳本，更新 offline_expenses；
 * 否則更新目前帳本快取。
 */
export const replaceExpenseInStorage = (
  updatedExpense: StoredExpenseItem,
  isUsingSharedExpenseBook: boolean,
  expenseBookTripId: string,
  currentCurrencyCode: string
) => {
  const targetId = String(updatedExpense.id);

  if (targetId.startsWith('local_') && isUsingSharedExpenseBook) {
    const localQueue = readStoredExpenses(
      'offline_expenses',
      '',
      currentCurrencyCode
    );

    const updatedQueue = localQueue.map((item) =>
      String(item.id) === targetId ? updatedExpense : item
    );

    localStorage.setItem(
      'offline_expenses',
      JSON.stringify(updatedQueue)
    );

    return;
  }

  const storageKey = toBookStorageKey(expenseBookTripId);

  const localBook = readStoredExpenses(
    storageKey,
    expenseBookTripId,
    currentCurrencyCode
  );

  const updatedBook = localBook.map((item) =>
    String(item.id) === targetId ? updatedExpense : item
  );

  localStorage.setItem(
    storageKey,
    JSON.stringify(updatedBook)
  );
};

/**
 * 自 LocalStorage 移除指定帳目。
 *
 * 若為離線共用帳本，
 * 移除 offline_expenses；
 * 否則移除目前帳本快取。
 */
export const removeExpenseFromStorage = (
  removedExpense: StoredExpenseItem,
  isUsingSharedExpenseBook: boolean,
  expenseBookTripId: string,
  currentCurrencyCode: string
) => {
  const targetId = String(removedExpense.id);

  if (targetId.startsWith('local_') && isUsingSharedExpenseBook) {
    const localQueue = readStoredExpenses(
      'offline_expenses',
      '',
      currentCurrencyCode
    );

    const filteredQueue = localQueue.filter(
      (item) => String(item.id) !== targetId
    );

    localStorage.setItem(
      'offline_expenses',
      JSON.stringify(filteredQueue)
    );

    return;
  }

  const storageKey = toBookStorageKey(expenseBookTripId);

  const localBook = readStoredExpenses(
    storageKey,
    expenseBookTripId,
    currentCurrencyCode
  );

  const filteredBook = localBook.filter(
    (item) => String(item.id) !== targetId
  );

  localStorage.setItem(
    storageKey,
    JSON.stringify(filteredBook)
  );
};
