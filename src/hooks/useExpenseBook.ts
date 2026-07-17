import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import {
  ATTACHMENT_BUCKET,
  SUPPORTED_CURRENCIES,
} from "../constants/appConstants";
import {
  getLocalAttachment,
  saveLocalAttachment,
  updateLocalAttachmentExpenseId,
  findLocalAttachmentIdByExpense,
  deleteLocalAttachment,
} from "../storage/attachmentStorage";
import {
  getStoredExpensesForTrip,
  isPersonalBookTripId,
  readStoredExpenses,
  removeExpenseFromStorage,
  replaceExpenseInStorage,
  toBookStorageKey,
} from "../storage/expenseStorage";
import {
  compressImageFile,
  formatFileSize,
  sanitizeStorageFileName,
} from "../utils/attachmentUtils";
import { cancelEditExpense, startEditExpense } from "../utils/expenseActions";
import { getExportFileNameXlsx } from "../utils/exportUtils";
import type { EditExpenseDraft, ExpenseItem, LocalAttachmentRecord } from "../types";

interface UseExpenseBookOptions {
  supabase: SupabaseClient;
  userEmail: string | null;
  selectedTripId: string;
  expenseBookTripId: string;
  isUsingSharedExpenseBook: boolean;
  currentCurrencyCode: string;
  currentCurrencySymbol: string;
  expenseMembers: string[];
  lockedPayerName: string | null;
  tripTitle: string;
}

const shouldRecoverLocalAttachment = (item: ExpenseItem) => {
  return (
    item.attachment_status !== "synced" &&
    item.attachment_status !== "none" &&
    Boolean(item.attachment_name)
  );
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const details = error as {
      message?: unknown;
      error?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    const message =
      typeof details.message === "string"
        ? details.message
        : typeof details.error === "string"
          ? details.error
          : "unknown-error";
    const status =
      typeof details.status === "number" || typeof details.status === "string"
        ? details.status
        : details.statusCode;

    return status ? `${message} (${status})` : message;
  }

  return String(error || "unknown-error");
};

const getTodayDateString = () => {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60_000;
  return new Date(localTime).toISOString().slice(0, 10);
};

const getExpenseDate = (item: ExpenseItem): string => {
  if (item.expense_date) return item.expense_date;
  if (item.created_at) return item.created_at.slice(0, 10);
  return getTodayDateString();
};

const getExpenseTimestamp = (item: ExpenseItem): string => {
  return item.created_at || `${getExpenseDate(item)}T00:00:00.000Z`;
};

const sortExpensesByLatestDate = (items: ExpenseItem[]): ExpenseItem[] => {
  return [...items].sort((left, right) => {
    const dateCompare = getExpenseDate(right).localeCompare(getExpenseDate(left));
    if (dateCompare !== 0) return dateCompare;

    return getExpenseTimestamp(right).localeCompare(getExpenseTimestamp(left));
  });
};

export default function useExpenseBook({
  supabase,
  userEmail,
  selectedTripId,
  expenseBookTripId,
  isUsingSharedExpenseBook,
  currentCurrencyCode,
  currentCurrencySymbol,
  expenseMembers,
  lockedPayerName,
  tripTitle,
}: UseExpenseBookOptions) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  
/* =========================================
   📦 重新載入目前帳本資料
   從 LocalStorage 讀取帳目，
   並重新補回 IndexedDB 的附件關聯。
   ========================================= */
const reloadExpenses = useCallback(async (bookId = expenseBookTripId) => {
  if (!bookId) return;

  const local = getStoredExpensesForTrip(
    bookId,
    currentCurrencyCode,
  );

  // 重新查詢每筆帳目的本機附件，
  // 避免 F5 後 local_attachment_id 遺失。
  const hydrated = await Promise.all(
    local.map(async (item) => {
      if (
        item.local_attachment_id ||
        !shouldRecoverLocalAttachment(item)
      ) {
        return item;
      }

      const recoveredId = await findLocalAttachmentIdByExpense(
        String(item.id),
        bookId,
      );

      return {
        ...item,
        local_attachment_id: recoveredId,
      };
    }),
  );

  setExpenses(hydrated);
}, [currentCurrencyCode, expenseBookTripId]);

  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newExpenseDate, setNewExpenseDate] = useState(getTodayDateString);
  const [newPayer, setNewPayer] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditExpenseDraft>({
    title: "",
    amount: "",
    payer: "",
    currency: "JPY",
    expenseDate: getTodayDateString(),
  });
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null);
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);
  const [removedAttachmentExpenseIds, setRemovedAttachmentExpenseIds] =
    useState<Set<string>>(() => new Set());
  const [isSyncingAttachments, setIsSyncingAttachments] = useState(false);
  const [lastAttachmentSyncStamp, setLastAttachmentSyncStamp] = useState<{
    bookId: string;
    value: string;
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeCurrency, setActiveCurrency] = useState("ALL");
  const [activeExpenseDate, setActiveExpenseDate] = useState("");
  const [formCurrency, setFormCurrency] = useState("JPY");
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expenseRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ================================
   📦 帳本統一載入核心（新增）
   ================================ */

/**
 * 🧠 功能：統一載入帳本資料（唯一資料入口）
 * 
 * 負責處理：
 * 1. Supabase 雲端資料載入
 * 2. LocalStorage fallback
 * 3. 離線資料整合
 * 4. state 統一更新（避免分散 setExpenses）
 */
const loadExpenseBook = useCallback(async (bookId: string) => {
  if (!bookId) return;

  try {
    // =========================
    // 🌐 1. 雲端模式（共用帳本 + 有網路）
    // =========================
    if (isUsingSharedExpenseBook && navigator.onLine) {
      const { data } = await supabase
        .from("expenses")
        .select("*")
        .eq("trip_id", bookId)
        .order("created_at", { ascending: true });

      if (data) {
        const hydrated = await Promise.all(
  (data as ExpenseItem[]).map(async (item) => {
    const recoveredId =
      item.local_attachment_id ??
      (shouldRecoverLocalAttachment(item)
        ? await findLocalAttachmentIdByExpense(
            String(item.id),
            bookId,
          )
        : null);

    return {
      ...item,
      local_attachment_id: recoveredId,
    };
  }),
);

        localStorage.setItem(
          toBookStorageKey(bookId),
          JSON.stringify(hydrated)
        );

        await reloadExpenses(bookId);
        return;
      }
    }

    // =========================
    // 💾 2. 離線 / 個人帳本 fallback
    // =========================
    const local = getStoredExpensesForTrip(
      bookId,
      currentCurrencyCode
    );

    setExpenses(local);

  } catch (error) {
    console.error("loadExpenseBook failed:", error);
  }
}, [
  currentCurrencyCode,
  isUsingSharedExpenseBook,
  reloadExpenses,
  supabase,
]);

/* =========================================
   📦 帳本載入 useEffect（統一入口）
   ========================================= */
useEffect(() => {
  if (!expenseBookTripId) return;

  const timer = window.setTimeout(() => {
    void loadExpenseBook(expenseBookTripId);
  }, 0);

  return () => window.clearTimeout(timer);
}, [expenseBookTripId, loadExpenseBook]);

useEffect(() => {
  if (!expenseBookTripId || !isUsingSharedExpenseBook || !userEmail) return;

  const refreshExpenseBook = () => {
    if (!navigator.onLine) return;
    void loadExpenseBook(expenseBookTripId);
  };

  const scheduleRefresh = () => {
    if (expenseRefreshTimerRef.current) {
      clearTimeout(expenseRefreshTimerRef.current);
    }

    expenseRefreshTimerRef.current = setTimeout(refreshExpenseBook, 600);
  };

  const channel = supabase
    .channel(`travel-companion-expenses-${expenseBookTripId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "expenses",
        filter: `trip_id=eq.${expenseBookTripId}`,
      },
      scheduleRefresh,
    )
    .subscribe();

  const interval = window.setInterval(refreshExpenseBook, 30_000);
  const handleFocus = () => refreshExpenseBook();
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      refreshExpenseBook();
    }
  };

  window.addEventListener("focus", handleFocus);
  window.addEventListener("online", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    if (expenseRefreshTimerRef.current) {
      clearTimeout(expenseRefreshTimerRef.current);
      expenseRefreshTimerRef.current = null;
    }

    window.clearInterval(interval);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("online", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    void supabase.removeChannel(channel);
  };
}, [
  expenseBookTripId,
  isUsingSharedExpenseBook,
  loadExpenseBook,
  supabase,
  userEmail,
]);

  const handleAttachmentSelection = async (
    file: File | undefined,
    setter: (file: File | null) => void,
  ) => {
    if (!file) {
      setter(null);
      return;
    }

    try {
      const compressed = await compressImageFile(file);
      setter(compressed);
      if (compressed.size < file.size) {
        alert(
          `照片已自動壓縮：${formatFileSize(file.size)} → ${formatFileSize(compressed.size)}。`,
        );
      }
    } catch (error) {
      setter(null);
      alert(
        error instanceof Error ? error.message : "照片處理失敗，請重新選擇。",
      );
    }
  };

  useEffect(() => {
    return () => {
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncOfflineData = async () => {
      if (
        !navigator.onLine ||
        !userEmail ||
        !expenseBookTripId ||
        !isUsingSharedExpenseBook
      )
        return;

      const localQueue = readStoredExpenses("offline_expenses", "", "JPY");
      const sharedQueue = localQueue.filter((item) => {
        return (
          item.trip_id === expenseBookTripId &&
          !isPersonalBookTripId(item.trip_id)
        );
      });
      if (sharedQueue.length === 0) return;

      try {
        const syncedIds = new Set<string>();
        const syncedLocalAttachmentIds = new Map<string, string | null>();

        for (const item of sharedQueue) {
          const { data, error } = await supabase
            .from("expenses")
            .insert([
              {
                trip_id: item.trip_id,
                title: item.title,
                amount: item.amount,
                payer: item.payer,
                currency: item.currency || "JPY",
                expense_date: getExpenseDate(item),
                attachment_bucket: item.attachment_bucket || ATTACHMENT_BUCKET,
                attachment_path: null,
                attachment_name: item.attachment_name || null,
                attachment_mime: item.attachment_mime || null,
                attachment_size: item.attachment_size || null,
                attachment_status: item.local_attachment_id
                  ? "local_pending"
                  : item.attachment_status || "none",
                attachment_uploaded_at: null,
                attachment_uploaded_by: null,
                attachment_last_error: null,
              },
            ])
            .select()
            .single();

          if (error) throw error;

          syncedIds.add(String(item.id));
          const savedId = data ? String((data as ExpenseItem).id) : "";
          if (savedId && item.local_attachment_id) {
            await updateLocalAttachmentExpenseId(
              item.local_attachment_id,
              savedId,
              expenseBookTripId,
            );
            syncedLocalAttachmentIds.set(savedId, item.local_attachment_id);
          }
        }

        if (syncedIds.size > 0) {
          const remainingQueue = localQueue.filter(
            (item) => !syncedIds.has(item.id),
          );
          if (remainingQueue.length > 0) {
            localStorage.setItem(
              "offline_expenses",
              JSON.stringify(remainingQueue),
            );
          } else {
            localStorage.removeItem("offline_expenses");
          }

          if (expenseBookTripId) {
            const { data } = await supabase
              .from("expenses")
              .select("*")
              .eq("trip_id", expenseBookTripId)
              .order("created_at", { ascending: true });
            if (data) {
              const hydratedData = (data as ExpenseItem[]).map((item) => ({
                ...item,
                local_attachment_id:
                  syncedLocalAttachmentIds.get(String(item.id)) ||
                  item.local_attachment_id ||
                  null,
              }));
              localStorage.setItem(
                toBookStorageKey(expenseBookTripId),
                JSON.stringify(hydratedData),
              );
              await reloadExpenses();
            }
          }
        }

      } catch (err) {
        console.error(err);
      }
    };

    window.addEventListener("online", syncOfflineData);
    const timer = setTimeout(syncOfflineData, 1000);

    return () => {
      window.removeEventListener("online", syncOfflineData);
      clearTimeout(timer);
    };
  }, [
    expenseBookTripId,
    isUsingSharedExpenseBook,
    reloadExpenses,
    selectedTripId,
    supabase,
    userEmail,
  ]);

  const handleAddExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!userEmail || !expenseBookTripId) {
      alert("此功能須先登入");
      return;
    }
    if (!newTitle || !newAmount || isNaN(Number(newAmount))) return;

    const amountNum = Math.abs(Math.floor(Number(newAmount)));
    const selectedFile = newAttachmentFile;
    const attachmentFields = selectedFile
      ? {
          attachment_bucket: ATTACHMENT_BUCKET,
          attachment_path: null,
          attachment_name: selectedFile.name,
          attachment_mime: selectedFile.type || "application/octet-stream",
          attachment_size: selectedFile.size,
          attachment_status: "local_pending" as const,
          attachment_uploaded_at: null,
          attachment_uploaded_by: null,
          attachment_last_error: null,
        }
      : {
          attachment_bucket: ATTACHMENT_BUCKET,
          attachment_path: null,
          attachment_name: null,
          attachment_mime: null,
          attachment_size: null,
          attachment_status: "none" as const,
          attachment_uploaded_at: null,
          attachment_uploaded_by: null,
          attachment_last_error: null,
        };

    const newExpenseData = {
      trip_id: expenseBookTripId,
      title: newTitle,
      amount: amountNum,
      payer: isUsingSharedExpenseBook
        ? lockedPayerName || newPayer || expenseMembers[0]
        : userEmail,
      currency: formCurrency,
      expense_date: newExpenseDate || getTodayDateString(),
      ...attachmentFields,
    };

    const clearAddForm = () => {
      setNewTitle("");
      setNewAmount("");
      setNewExpenseDate(getTodayDateString());
      setNewAttachmentFile(null);
    };

    const createLocalExpenseItem = async (): Promise<
      ExpenseItem & { created_at: string }
    > => {
      const localId = `local_${Date.now()}_${Math.random()}`;
      const localItem: ExpenseItem & { created_at: string } = {
        id: localId,
        created_at: new Date().toISOString(),
        ...newExpenseData,
        local_attachment_id: null,
      };

      if (selectedFile) {
        const attachment = await saveLocalAttachment(
          selectedFile,
          localId,
          expenseBookTripId,
        );
        localItem.local_attachment_id = attachment.id;
      }

      return localItem;
    };

    const saveToPersonalBook = async () => {
      const storageKey = toBookStorageKey(expenseBookTripId);
      const localBook = readStoredExpenses(
        storageKey,
        expenseBookTripId,
        currentCurrencyCode,
      );
      const localItem = await createLocalExpenseItem();

      localBook.push(localItem);
      localStorage.setItem(storageKey, JSON.stringify(localBook));

      await reloadExpenses();
      setActiveExpenseDate(newExpenseData.expense_date);
      clearAddForm();
      alert(
        selectedFile
          ? "已儲存在此裝置的個人帳本，照片也只保存在本機。Excel 內會標註附件名稱，但不會產生雲端下載網址。"
          : "已儲存在此裝置的個人帳本，不會上傳到共用雲端。你仍可匯出 Excel 備份或分享。",
      );
    };

    const saveToOfflineSandbox = async () => {
      const localQueue = readStoredExpenses(
        "offline_expenses",
        "",
        currentCurrencyCode,
      );
      const offlineItem = await createLocalExpenseItem();
      localQueue.push(offlineItem);
      localStorage.setItem("offline_expenses", JSON.stringify(localQueue));

      await reloadExpenses();
      setActiveExpenseDate(newExpenseData.expense_date);
      clearAddForm();
      alert(
        selectedFile
          ? "已先儲存在本機暫存箱；恢復連線後會自動同步帳目，照片仍需按「同步照片」上傳。"
          : "已先儲存在本機暫存箱；恢復連線後會自動同步到共用帳本。",
      );
    };

    if (!isUsingSharedExpenseBook) {
      await saveToPersonalBook();
      return;
    }

    if (!navigator.onLine) {
      await saveToOfflineSandbox();
      return;
    }

    try {
      const { data, error } = await supabase
        .from("expenses")
        .insert([newExpenseData])
        .select();
      if (error) throw error;

      if (data) {
        const savedExpense = data[0] as ExpenseItem;
        let localAttachmentId: string | null = null;
        if (selectedFile) {
          const attachment = await saveLocalAttachment(
            selectedFile,
            String(savedExpense.id),
            expenseBookTripId,
          );
          localAttachmentId = attachment.id;
        }

        const currentExpenses = Array.isArray(expenses) ? expenses : [];
        const updated = [
          ...currentExpenses,
          { ...savedExpense, local_attachment_id: localAttachmentId },
        ];
        
        localStorage.setItem(
          toBookStorageKey(expenseBookTripId),
          JSON.stringify(updated),
        ); 
        // 雲端新增完成後，重新從目前帳本載入資料，
        // 讓畫面與 LocalStorage 保持一致。
        await reloadExpenses();

        setActiveExpenseDate(newExpenseData.expense_date);
        clearAddForm();
      }
    } catch {
      await saveToOfflineSandbox();
    }
  };

  const cancelPendingDelete = () => {
    setPendingDeleteId(null);
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
  };

  const finalizeDeleteExpense = async (
    removedExpense: ExpenseItem,
    restoreIndex: number,
  ) => {
    const targetId = String(removedExpense.id);

    try {
      if (!targetId.startsWith("local_") && isUsingSharedExpenseBook) {
        if (!navigator.onLine) throw new Error("offline");

        const { error } = await supabase
          .from("expenses")
          .delete()
          .eq("id", removedExpense.id);
        if (error) throw error;

        if (removedExpense.attachment_path) {
          void supabase.storage
            .from(ATTACHMENT_BUCKET)
            .remove([removedExpense.attachment_path]);
        }
      }

      removeExpenseFromStorage(
        removedExpense,
        isUsingSharedExpenseBook,
        expenseBookTripId,
        currentCurrencyCode,
      );
      void deleteLocalAttachment(removedExpense.local_attachment_id);
    } catch (error) {
  console.error("Delete failed:", error);

  setExpenses((current) => {
    if (current.some((expense) => String(expense.id) === targetId))
      return current;

    const restored = [...current];
    restored.splice(
      Math.min(restoreIndex, restored.length),
      0,
      removedExpense,
    );
    return restored;
  });

  alert("無法完成刪除，已將帳目放回清單。");
}
  };

  const handleSaveEditExpense = async (id: string) => {
    if (!userEmail || !expenseBookTripId) {
      alert("此功能須先登入");
      return;
    }
    if (!editDraft.title || !editDraft.amount || isNaN(Number(editDraft.amount)))
      return;

    const targetExpense = expenses.find(
      (item) => String(item.id) === String(id),
    );
    if (!targetExpense) return;
    const shouldRemoveAttachment =
      removedAttachmentExpenseIds.has(String(id)) && !editAttachmentFile;

    let updatedExpense: ExpenseItem = {
      ...targetExpense,
      title: editDraft.title,
      amount: Math.abs(Math.floor(Number(editDraft.amount))),
      payer: isUsingSharedExpenseBook ? editDraft.payer : userEmail,
      currency: editDraft.currency,
      expense_date: editDraft.expenseDate || getExpenseDate(targetExpense),
    };

    if (editAttachmentFile) {
      const attachment = await saveLocalAttachment(
        editAttachmentFile,
        String(id),
        expenseBookTripId,
        targetExpense.local_attachment_id,
      );
      updatedExpense = {
        ...updatedExpense,
        attachment_bucket: ATTACHMENT_BUCKET,
        attachment_path: null,
        attachment_name: attachment.fileName,
        attachment_mime: attachment.mimeType,
        attachment_size: attachment.size,
        attachment_status: "local_pending",
        attachment_uploaded_at: null,
        attachment_uploaded_by: null,
        attachment_last_error: null,
        local_attachment_id: attachment.id,
      };
    } else if (shouldRemoveAttachment) {
      updatedExpense = {
        ...updatedExpense,
        attachment_bucket: ATTACHMENT_BUCKET,
        attachment_path: null,
        attachment_name: null,
        attachment_mime: null,
        attachment_size: null,
        attachment_status: "none",
        attachment_uploaded_at: null,
        attachment_uploaded_by: null,
        attachment_last_error: null,
        local_attachment_id: null,
      };
    }

    if (String(id).startsWith("local_") || !isUsingSharedExpenseBook) {
      replaceExpenseInStorage(
        updatedExpense,
        isUsingSharedExpenseBook,
        expenseBookTripId,
        currentCurrencyCode,
      );
      setExpenses((current) =>
        current.map((item) =>
          String(item.id) === String(id) ? updatedExpense : item,
        ),
      );
      if (shouldRemoveAttachment) {
        void deleteLocalAttachment(targetExpense.local_attachment_id);
      }
      setRemovedAttachmentExpenseIds((current) => {
        const next = new Set(current);
        next.delete(String(id));
        return next;
      });
      setActiveExpenseDate(updatedExpense.expense_date || getExpenseDate(updatedExpense));
      cancelEditExpenseHandler();
      return;
    }

    if (!navigator.onLine) {
      alert("目前處於離線狀態，無法修改雲端歷史帳目。");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("expenses")
        .update({
          title: updatedExpense.title,
          amount: updatedExpense.amount,
          payer: updatedExpense.payer,
          currency: updatedExpense.currency,
          expense_date: updatedExpense.expense_date,
          attachment_bucket: updatedExpense.attachment_bucket || ATTACHMENT_BUCKET,
          attachment_path: updatedExpense.attachment_path || null,
          attachment_name: updatedExpense.attachment_name || null,
          attachment_mime: updatedExpense.attachment_mime || null,
          attachment_size: updatedExpense.attachment_size || null,
          attachment_status: updatedExpense.attachment_status || "none",
          attachment_uploaded_at: updatedExpense.attachment_uploaded_at || null,
          attachment_uploaded_by: updatedExpense.attachment_uploaded_by || null,
          attachment_last_error: updatedExpense.attachment_last_error || null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      const savedExpense = {
        ...(data || updatedExpense),
        local_attachment_id: updatedExpense.local_attachment_id || null,
      } as ExpenseItem;
      setExpenses((current) => {
        const updated = current.map((item) =>
          String(item.id) === String(id) ? savedExpense : item,
        );
        localStorage.setItem(
          toBookStorageKey(expenseBookTripId),
          JSON.stringify(updated),
        );
        return updated;
      });
      if (shouldRemoveAttachment) {
        if (targetExpense.attachment_path) {
          void supabase.storage
            .from(ATTACHMENT_BUCKET)
            .remove([targetExpense.attachment_path]);
        }
        void deleteLocalAttachment(targetExpense.local_attachment_id);
      }
      setRemovedAttachmentExpenseIds((current) => {
        const next = new Set(current);
        next.delete(String(id));
        return next;
      });
      setActiveExpenseDate(savedExpense.expense_date || getExpenseDate(savedExpense));
      cancelEditExpenseHandler();
    } catch {
      alert("無法連接雲端資料庫，目前無法修改雲端歷史帳目。");
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (!userEmail || !expenseBookTripId) {
      alert("此功能須先登入");
      return;
    }

    const targetId = String(id);
    if (pendingDeleteId !== targetId) {
      setEditingExpenseId(null);
      setPendingDeleteId(targetId);
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
      deleteConfirmTimerRef.current = setTimeout(() => {
        setPendingDeleteId((current) =>
          current === targetId ? null : current,
        );
        deleteConfirmTimerRef.current = null;
      }, 3000);
      return;
    }

    const currentExpenses = Array.isArray(expenses) ? expenses : [];
    const targetIndex = currentExpenses.findIndex(
      (item) => String(item.id) === targetId,
    );
    const targetExpense = currentExpenses[targetIndex];
    if (!targetExpense) return;

    if (
      !String(targetExpense.id).startsWith("local_") &&
      isUsingSharedExpenseBook &&
      !navigator.onLine
    ) {
      alert("目前處於離線狀態，無法刪除雲端歷史帳目。");
      return;
    }

    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }

    setPendingDeleteId(null);
    const nextExpenses = currentExpenses.filter(
      (item) => String(item.id) !== targetId,
    );
    const deletedDate = getExpenseDate(targetExpense);
    if (effectiveActiveExpenseDate === deletedDate) {
      const remainingDates = Array.from(
        new Set(
          sortExpensesByLatestDate(nextExpenses)
            .filter(
              (item) =>
                effectiveActiveCurrency === "ALL" ||
                (item.currency || currentCurrencyCode) === effectiveActiveCurrency,
            )
            .map(getExpenseDate),
        ),
      );
      if (!remainingDates.includes(deletedDate)) {
        const nearestNewerDate = remainingDates
          .filter((date) => date > deletedDate)
          .at(-1);
        const nearestOlderDate = remainingDates.find((date) => date < deletedDate);
        setActiveExpenseDate(nearestNewerDate ?? nearestOlderDate ?? "");
      }
    }
    setExpenses(nextExpenses);
    void finalizeDeleteExpense(targetExpense, targetIndex);
  };

  const getSignedAttachmentUrl = async (path?: string | null) => {
    if (!path) return "";
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    return data?.signedUrl || "";
  };

  const uploadAttachmentToStorage = async (
    path: string,
    attachment: LocalAttachmentRecord,
  ) => {
    const contentType = attachment.mimeType || "image/jpeg";
    const normalizedBlob = new Blob([attachment.blob], { type: contentType });
    const firstUpload = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, normalizedBlob, {
        contentType,
        upsert: true,
      });

    if (!firstUpload.error) return;

    const firstError = firstUpload.error;
    const arrayBuffer = await normalizedBlob.arrayBuffer();
    const retryUpload = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (retryUpload.error) {
      throw new Error(
        `blob:${getErrorMessage(firstError)}; arrayBuffer:${getErrorMessage(
          retryUpload.error,
        )}`,
      );
    }
  };

  const handleOpenAttachment = async (item: ExpenseItem) => {
    if (
      !(
        (item.attachment_path && item.attachment_status === "synced") ||
        item.local_attachment_id
      )
    ) {
      alert("這筆支出沒有可開啟的照片。");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
    }
    const openUrl = (url: string) => {
      if (popup) {
        popup.location.href = url;
        return;
      }

      window.location.href = url;
    };

    const closePopup = () => {
      if (popup) {
        popup.close();
      }
    };

    try {
      if (item.attachment_path && item.attachment_status === "synced") {
        const url = await getSignedAttachmentUrl(item.attachment_path);
        if (url) {
          openUrl(url);
        } else {
          closePopup();
          alert("無法取得照片連結，請稍後再試。");
        }
        return;
      }

      if (item.local_attachment_id) {
        const attachment = await getLocalAttachment(item.local_attachment_id);
        if (!attachment) {
          closePopup();
          alert("這張照片只存在原本的瀏覽器本機，目前找不到附件檔。");
          return;
        }
        const url = URL.createObjectURL(attachment.blob);
        openUrl(url);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      closePopup();
      alert("這筆支出沒有可開啟的照片。");
    } catch {
      closePopup();
      alert("無法開啟照片，請確認網路或登入權限。");
    }
  };

  const hasLocalAttachmentId = (
    item: ExpenseItem,
  ): item is ExpenseItem & { local_attachment_id: string } => {
    return typeof item.local_attachment_id === "string";
  };

  const handleSyncAttachments = async () => {
    if (!userEmail || !expenseBookTripId) {
      alert("此功能須先登入");
      return;
    }
    if (!isUsingSharedExpenseBook) {
      alert("個人帳本照片只存放在本機，不會同步到雲端。");
      return;
    }
    if (!navigator.onLine) {
      alert("目前離線，請連線後再同步照片。建議在 Wi-Fi 環境下上傳。");
      return;
    }

    const pendingItems = await Promise.all(
      expenses.map(async (item) => {
        if (
          item.attachment_status === "synced" ||
          String(item.id).startsWith("local_")
        )
          return null;
        if (hasLocalAttachmentId(item)) return item;
        if (shouldRecoverLocalAttachment(item)) {
          const recoveredId = await findLocalAttachmentIdByExpense(
            String(item.id),
            expenseBookTripId,
          );
          if (recoveredId) {
            return {
              ...item,
              local_attachment_id: recoveredId,
            } as ExpenseItem & { local_attachment_id: string };
          }
        }
        return null;
      }),
    );

    const filteredPendingItems = pendingItems.filter(
      (item): item is ExpenseItem & { local_attachment_id: string } =>
        Boolean(item),
    );

    if (filteredPendingItems.length === 0) {
      const failedItemsWithoutLocalPhoto = expenses.some(
        (item) =>
          item.attachment_status === "upload_failed" &&
          Boolean(item.attachment_name) &&
          !item.local_attachment_id,
      );

      alert(
        failedItemsWithoutLocalPhoto
          ? "有照片曾同步失敗，但此裝置已找不到可重試上傳的本機照片。請進入編輯後重新拍照或選擇照片。"
          : "目前沒有尚未同步的照片。",
      );
      return;
    }

    setIsSyncingAttachments(true);
    const savedItems: ExpenseItem[] = [];

    for (const item of filteredPendingItems) {
      try {
        const attachment = await getLocalAttachment(item.local_attachment_id);
        if (!attachment) {
          const errorMessage = "local-attachment-not-found";
          const failedExpense: ExpenseItem = {
            ...item,
            attachment_status: "upload_failed",
            attachment_last_error: errorMessage,
          };

          savedItems.push(failedExpense);
          if (!String(item.id).startsWith("local_")) {
            await supabase
              .from("expenses")
              .update({
                attachment_status: "upload_failed",
                attachment_last_error: errorMessage,
              })
              .eq("id", item.id);
          }
          continue;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = sanitizeStorageFileName(attachment.fileName);
        const path = `${selectedTripId}/${item.id}/${stamp}-${fileName}`;

        await uploadAttachmentToStorage(path, attachment);

        const updatePayload = {
          attachment_bucket: ATTACHMENT_BUCKET,
          attachment_path: path,
          attachment_name: attachment.fileName,
          attachment_mime: attachment.mimeType,
          attachment_size: attachment.size,
          attachment_status: "synced",
          attachment_uploaded_at: new Date().toISOString(),
          attachment_uploaded_by: userEmail,
          attachment_last_error: null,
        };

        const { data, error: updateError } = await supabase
          .from("expenses")
          .update(updatePayload)
          .eq("id", item.id)
          .select()
          .single();
        if (updateError) throw updateError;

        savedItems.push({
          ...(data as ExpenseItem),
          local_attachment_id: item.local_attachment_id,
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        const failedExpense: ExpenseItem = {
          ...item,
          attachment_status: "upload_failed",
          attachment_last_error: errorMessage,
        };

        savedItems.push(failedExpense);
        if (!String(item.id).startsWith("local_")) {
          await supabase
            .from("expenses")
            .update({
              attachment_status: "upload_failed",
              attachment_last_error: errorMessage,
            })
            .eq("id", item.id);
        }
      }
    }

    setExpenses((current) => {
      const savedMap = new Map(
        savedItems.map((item) => [String(item.id), item]),
      );
      const updated = current.map(
        (item) => savedMap.get(String(item.id)) || item,
      );
      localStorage.setItem(
        toBookStorageKey(expenseBookTripId),
        JSON.stringify(updated),
      );
      return updated;
    });

    if (expenseBookTripId) {
      const { data: refreshedData } = await supabase
        .from("expenses")
        .select("*")
        .eq("trip_id", expenseBookTripId)
        .order("created_at", { ascending: true });
      if (refreshedData) {
        const cachedItems = readStoredExpenses(
          toBookStorageKey(expenseBookTripId),
          expenseBookTripId,
          currentCurrencyCode,
        );
        const cachedLocalAttachmentIds = new Map(
          cachedItems.map((item) => [
            String(item.id),
            item.local_attachment_id || null,
          ]),
        );
        const hydrated = await Promise.all(
          (refreshedData as ExpenseItem[]).map(async (item) => {
            const cachedLocalAttachmentId =
              cachedLocalAttachmentIds.get(String(item.id)) || null;
            const recoveredId =
              item.local_attachment_id ||
              cachedLocalAttachmentId ||
              (shouldRecoverLocalAttachment(item)
                ? await findLocalAttachmentIdByExpense(
                    String(item.id),
                    expenseBookTripId,
                  )
                : null);

            return {
              ...item,
              local_attachment_id: recoveredId,
            };
          }),
        );
        setExpenses(hydrated);
        localStorage.setItem(
          toBookStorageKey(expenseBookTripId),
          JSON.stringify(hydrated),
        );
      }
    }

    const now = new Date().toISOString();
    localStorage.setItem(`attachment_last_sync_${expenseBookTripId}`, now);
    setLastAttachmentSyncStamp({ bookId: expenseBookTripId, value: now });
    setIsSyncingAttachments(false);
    const failedCount = savedItems.filter(
      (item) => item.attachment_status !== "synced",
    ).length;
    const successCount = savedItems.length - failedCount;
    const firstFailedError =
      savedItems.find((item) => item.attachment_status !== "synced")
        ?.attachment_last_error ?? "";

    alert(
      failedCount > 0
        ? `照片同步完成 ${successCount} 筆，失敗 ${failedCount} 筆。失敗項目會保留本機照片供下次重試。${firstFailedError ? `\n錯誤原因：${firstFailedError}` : ""}`
        : `照片同步完成，共 ${successCount} 筆。`,
    );
  };

  const buildExpenseXlsx = async () => {
    const exportItems = isUsingSharedExpenseBook ? filteredExpenses : safeExpenses;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Expenses");

    const rows: Array<(string | number)[]> = [
      ["記帳日期", "消費項目", "支出人", "幣別代碼", "幣別符號", "金額", "附件下載連結"],
    ];

    const hyperlinkRows: Array<{ index: number; url: string; text: string }> = [];

    for (const item of exportItems) {
      const currencyCode = item.currency || currentCurrencyCode;
      const targetConfig = SUPPORTED_CURRENCIES.find(
        (c) => c.code === currencyCode,
      );
      let attachmentUrl = "";
      if (
        isUsingSharedExpenseBook &&
        item.attachment_path &&
        item.attachment_status === "synced"
      ) {
        try {
          attachmentUrl = await getSignedAttachmentUrl(item.attachment_path);
        } catch {
          attachmentUrl = "";
        }
      }
      const attachmentName = item.attachment_name || "無附件";

      rows.push([
        getExpenseDate(item),
        item.title,
        item.payer || "未知",
        currencyCode,
        targetConfig?.symbol || currentCurrencySymbol,
        item.amount || 0,
        attachmentName,
      ]);

      if (attachmentUrl) {
        hyperlinkRows.push({
          index: rows.length,
          url: attachmentUrl,
          text: attachmentName,
        });
      }
    }

    rows.forEach((rowData) => worksheet.addRow(rowData));

    for (const link of hyperlinkRows) {
      const row = worksheet.getRow(link.index);
      const hyperlinkCell = row.getCell(7);
      hyperlinkCell.value = {
        text: link.text,
        hyperlink: link.url,
      };
      hyperlinkCell.font = {
        color: { argb: "FF0000FF" },
        underline: true,
      };
    }

    return workbook;
  };

  const handleExportXlsx = async () => {
    if (!userEmail) {
      alert("此功能須先登入");
      return;
    }
    const exportItems = isUsingSharedExpenseBook ? filteredExpenses : safeExpenses;
    if (exportItems.length === 0) {
      alert("目前沒有可匯出的帳本資料");
      return;
    }

    const workbook = await buildExpenseXlsx();
    const suggestedName = getExportFileNameXlsx(
      tripTitle || "travel",
      isUsingSharedExpenseBook,
    );
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    try {
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options: {
            suggestedName: string;
            types: Array<{
              description: string;
              accept: Record<string, string[]>;
            }>;
          }) => Promise<{
            createWritable: () => Promise<{
              write: (data: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }
      ).showSaveFilePicker;

      if (picker) {
        const handle = await picker({
          suggestedName,
          types: [
            {
              description: "Excel file",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
                  ".xlsx",
                ],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const safeExpenses = sortExpensesByLatestDate(Array.isArray(expenses) ? expenses : []);
  const availableCurrencies = SUPPORTED_CURRENCIES.filter((currency) =>
    safeExpenses.some(
      (expense) => (expense.currency || currentCurrencyCode) === currency.code,
    ),
  );
  const effectiveActiveCurrency =
    activeCurrency === "ALL" ||
    availableCurrencies.some((currency) => currency.code === activeCurrency)
      ? activeCurrency
      : "ALL";

  const filteredExpenses = safeExpenses.filter((item) => {
    if (!item) return false;
    if (effectiveActiveCurrency === "ALL") return true;
    const itemCurrency = item.currency || currentCurrencyCode;
    return itemCurrency === effectiveActiveCurrency;
  });

  const availableExpenseDates = Array.from(
    new Set(filteredExpenses.map(getExpenseDate)),
  ).sort();

  const effectiveActiveExpenseDate = availableExpenseDates.includes(activeExpenseDate)
    ? activeExpenseDate
    : (availableExpenseDates.at(-1) ?? "");

  const dateFilteredExpenses = effectiveActiveExpenseDate
    ? filteredExpenses.filter(
        (item) => getExpenseDate(item) === effectiveActiveExpenseDate,
      )
    : [];

// =========================================
// 待同步照片數
// 只要本機存在附件、且尚未同步完成，
// 不論 Expense 是雲端資料或離線新增(local_)
// 都應列入待同步照片數。
// =========================================
const pendingAttachmentCount = isUsingSharedExpenseBook
  ? safeExpenses.filter(
      (item) =>
        item.local_attachment_id &&
        item.attachment_status !== "synced" &&
        item.attachment_status !== "none",
    ).length
  : 0;

  const hasUnsyncedLocalExpenseAttachments = safeExpenses.some(
    (item) =>
      item.local_attachment_id &&
      item.attachment_status !== "synced" &&
      String(item.id).startsWith("local_") &&
      isUsingSharedExpenseBook,
  );

  const storedAttachmentSyncAt = expenseBookTripId
    ? localStorage.getItem(`attachment_last_sync_${expenseBookTripId}`)
    : null;
  const effectiveAttachmentSyncAt =
    lastAttachmentSyncStamp?.bookId === expenseBookTripId
      ? lastAttachmentSyncStamp.value
      : storedAttachmentSyncAt;
  const attachmentSyncLabel = effectiveAttachmentSyncAt
    ? new Date(effectiveAttachmentSyncAt).toLocaleString()
    : "尚未同步";

  const totalExpense = filteredExpenses.reduce((sum, item) => {
    if (!item || !item.amount) return sum;
    const val = Number(item.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const paitAmounts: { [key: string]: number } = {};
  expenseMembers.forEach((m: string) => {
    paitAmounts[m] = 0;
  });

  filteredExpenses.forEach((item) => {
    if (item && item.payer && paitAmounts[item.payer] !== undefined) {
      const val = Number(item.amount);
      paitAmounts[item.payer] += isNaN(val) ? 0 : val;
    }
  });

  const isIntegerSettlementCurrency =
    effectiveActiveCurrency === "TWD" ||
    effectiveActiveCurrency === "JPY" ||
    effectiveActiveCurrency === "KRW";
  const currencyPrecision =
    isIntegerSettlementCurrency ? 0 : 2;
  const currencyUnit = 10 ** currencyPrecision;
  const totalMinorUnit = Math.round(totalExpense * currencyUnit);
  const sharePriorityMembers = [...expenseMembers].sort(
    (leftMember, rightMember) =>
      (paitAmounts[rightMember] || 0) - (paitAmounts[leftMember] || 0),
  );
  const memberShareAmounts: { [key: string]: number } = {};
  let averageExpense = 0;

  if (expenseMembers.length > 0) {
    if (isIntegerSettlementCurrency) {
      const roundedShareMinorUnit = Math.ceil(
        totalMinorUnit / expenseMembers.length,
      );
      let surplusMinorUnit =
        roundedShareMinorUnit * expenseMembers.length - totalMinorUnit;
      const memberShareMinorUnits = Object.fromEntries(
        expenseMembers.map((member) => [member, roundedShareMinorUnit]),
      );

      for (const member of sharePriorityMembers) {
        if (surplusMinorUnit <= 0) break;
        const reducibleMinorUnit = Math.min(
          surplusMinorUnit,
          memberShareMinorUnits[member],
        );
        memberShareMinorUnits[member] -= reducibleMinorUnit;
        surplusMinorUnit -= reducibleMinorUnit;
      }

      expenseMembers.forEach((member) => {
        memberShareAmounts[member] = memberShareMinorUnits[member] / currencyUnit;
      });
      averageExpense = roundedShareMinorUnit / currencyUnit;
    } else {
      const baseShareMinorUnit = Math.floor(
        totalMinorUnit / expenseMembers.length,
      );
      let remainingMinorUnit = totalMinorUnit % expenseMembers.length;
      const extraShareMembers = new Set<string>();

      for (const member of sharePriorityMembers) {
        if (remainingMinorUnit <= 0) break;
        extraShareMembers.add(member);
        remainingMinorUnit -= 1;
      }

      expenseMembers.forEach((member) => {
        const memberShareMinorUnit =
          baseShareMinorUnit + (extraShareMembers.has(member) ? 1 : 0);
        memberShareAmounts[member] = memberShareMinorUnit / currencyUnit;
      });
      averageExpense = Math.round((totalExpense / expenseMembers.length) * 100) / 100;
    }
  }

  const activeCurrencySymbol =
    SUPPORTED_CURRENCIES.find((c) => c.code === effectiveActiveCurrency)
      ?.symbol || currentCurrencySymbol;

  const cancelEditExpenseHandler = () => {
    const currentEditingExpenseId = editingExpenseId;
    cancelEditExpense(
      currentCurrencyCode,
      setEditingExpenseId,
      setEditDraft,
      setEditAttachmentFile,
    );
    if (currentEditingExpenseId) {
      setRemovedAttachmentExpenseIds((current) => {
        const next = new Set(current);
        next.delete(currentEditingExpenseId);
        return next;
      });
    }
  };

  const startEditExpenseHandler = (item: ExpenseItem) => {
    setRemovedAttachmentExpenseIds((current) => {
      const next = new Set(current);
      next.delete(String(item.id));
      return next;
    });
    startEditExpense(
      item,
      expenseMembers,
      currentCurrencyCode,
      deleteConfirmTimerRef,
      setPendingDeleteId,
      setEditingExpenseId,
      setEditAttachmentFile,
      setEditDraft,
    );
  };

  const markEditAttachmentForRemoval = (id: string) => {
    setEditAttachmentFile(null);
    setRemovedAttachmentExpenseIds((current) => {
      const next = new Set(current);
      next.add(String(id));
      return next;
    });
  };

  const restoreEditAttachment = (id: string) => {
    setRemovedAttachmentExpenseIds((current) => {
      const next = new Set(current);
      next.delete(String(id));
      return next;
    });
  };

  return {
    expenses,
    setExpenses,
    newTitle,
    setNewTitle,
    newAmount,
    setNewAmount,
    newExpenseDate,
    setNewExpenseDate,
    newPayer,
    setNewPayer,
    editingExpenseId,
    editDraft,
    setEditDraft,
    newAttachmentFile,
    setNewAttachmentFile,
    editAttachmentFile,
    setEditAttachmentFile,
    removedAttachmentExpenseIds: Array.from(removedAttachmentExpenseIds),
    isSyncingAttachments,
    pendingDeleteId,
    activeCurrency,
    setActiveCurrency,
    formCurrency,
    setFormCurrency,
    safeExpenses,
    availableCurrencies,
    effectiveActiveCurrency,
    filteredExpenses,
    activeExpenseDate: effectiveActiveExpenseDate,
    setActiveExpenseDate,
    availableExpenseDates,
    dateFilteredExpenses,
    pendingAttachmentCount,
    hasUnsyncedLocalExpenseAttachments,
    attachmentSyncLabel,
    totalExpense,
    averageExpense,
    memberShareAmounts,
    paitAmounts,
    activeCurrencySymbol,
    handleAttachmentSelection,
    handleAddExpense,
    cancelPendingDelete,
    handleSaveEditExpense,
    handleDeleteExpense,
    handleOpenAttachment,
    handleSyncAttachments,
    handleExportXlsx,
    startEditExpenseHandler,
    cancelEditExpenseHandler,
    markEditAttachmentForRemoval,
    restoreEditAttachment,
  };
}
