/**
 * ==========================================================
 * Travel Companion
 * 檔案：attachmentStorage.ts
 * 功能：附件（IndexedDB）存取工具
 *
 * 職責：
 * 1. 管理 IndexedDB
 * 2. 儲存本機附件
 * 3. 讀取本機附件
 * 4. 更新附件與 Expense 關聯
 * 5. 查詢附件
 * 6. 刪除附件
 * ==========================================================
 */

// 附件相關常數
import {
  ATTACHMENT_DB_NAME,
  ATTACHMENT_STORE_NAME,
} from '../constants/appConstants';

// 附件型別
import type {
  LocalAttachmentRecord,
} from '../types';
/**
 * 開啟附件 IndexedDB。
 *
 * 若資料庫不存在，會自動建立 Object Store
 * 以及 expenseId、tripId 索引。
 */
export const openAttachmentDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        const store = db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: 'id' });
        store.createIndex('expenseId', 'expenseId', { unique: false });
        store.createIndex('tripId', 'tripId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 將附件儲存至 IndexedDB。
 *
 * 若 existingId 存在則覆蓋原附件，
 * 否則建立新的附件紀錄。
 */
export const saveLocalAttachment = async (
  file: File,
  expenseId: string,
  tripId: string,
  existingId?: string | null
): Promise<LocalAttachmentRecord> => {
  const db = await openAttachmentDb();
  const id = existingId || `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const record: LocalAttachmentRecord = {
    id,
    expenseId,
    tripId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACHMENT_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  return record;
};

/**
 * 依附件 ID 讀取 IndexedDB 中的附件資料。
 *
 * 找不到時回傳 null。
 */
export const getLocalAttachment = async (id: string): Promise<LocalAttachmentRecord | null> => {
  const db = await openAttachmentDb();
  const record = await new Promise<LocalAttachmentRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readonly');
    const request = tx.objectStore(ATTACHMENT_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as LocalAttachmentRecord | undefined);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return record || null;
};

/**
 * 更新附件所對應的 Expense ID。
 *
 * 用於離線新增同步成功後，
 * 將 local_xxx 改成真正的雲端 Expense ID。
 */
export const updateLocalAttachmentExpenseId = async (
  id: string | null | undefined,
  expenseId: string,
  tripId: string
) => {
  if (!id) return;
  const record = await getLocalAttachment(id);
  if (!record) return;
  const db = await openAttachmentDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACHMENT_STORE_NAME).put({ ...record, expenseId, tripId });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

/**
 * 依 Expense ID 與 Trip ID
 * 查詢對應的本機附件 ID。
 */
export const findLocalAttachmentIdByExpense = async (expenseId: string, tripId: string): Promise<string | null> => {
  const db = await openAttachmentDb();
  const id = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readonly');
    const store = tx.objectStore(ATTACHMENT_STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
      if (!cursor) {
        resolve(null);
        return;
      }
      const record = cursor.value as LocalAttachmentRecord;
      if (record.expenseId === expenseId && record.tripId === tripId) {
        resolve(record.id);
        return;
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
  db.close();
  return id;
};

/**
 * 刪除 IndexedDB 中指定附件。
 */
export const deleteLocalAttachment = async (id?: string | null) => {
  if (!id) return;
  const db = await openAttachmentDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACHMENT_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

/** 清除指定共用 Trip 尚留在本機的附件；個人帳本使用不同 tripId，不受影響。 */
export const deleteLocalAttachmentsForTrip = async (
  tripId: string,
): Promise<void> => {
  const db = await openAttachmentDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    const index = tx.objectStore(ATTACHMENT_STORE_NAME).index("tripId");
    const request = index.openKeyCursor(IDBKeyRange.only(tripId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      tx.objectStore(ATTACHMENT_STORE_NAME).delete(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
};
