// React 核心
import { useState, useEffect, useRef } from 'react'

// Icon 圖示
import { Menu, X, Calendar, CheckSquare, Home, Wallet, MapPin, ExternalLink, Check, Plus, Trash2, FolderOpen, LogIn, LogOut, ShieldAlert, Download, Edit3, Save, Camera, UploadCloud, Paperclip } from 'lucide-react'

// Supabase 雲端資料庫
import { createClient } from '@supabase/supabase-js'

// Excel 匯出
import ExcelJS from 'exceljs'

// 旅程型別
import type { TripMeta, TripDetail } from './types'

// Trip 工具函式
import { sortTripsByDateDesc, findDefaultTrip } from './utils/tripHelpers'

// 系統常數（幣別、附件設定、IndexedDB 設定）
import {
  SUPPORTED_CURRENCIES,
  ATTACHMENT_BUCKET,
} from './constants/appConstants';

// LocalStorage 帳目工具
import {
  readStoredExpenses,
  getStoredExpensesForTrip,
  toBookStorageKey,
  toPersonalBookTripId,
  isPersonalBookTripId,
  replaceExpenseInStorage,
  removeExpenseFromStorage,
} from './storage/expenseStorage';

// 型別宣告
import type {
  ExpenseItem,
  EditExpenseDraft,
  AdminUser,
} from './types';

// IndexedDB 附件工具
import {
  saveLocalAttachment,
  getLocalAttachment,
  updateLocalAttachmentExpenseId,
  findLocalAttachmentIdByExpense,
  deleteLocalAttachment,
} from './storage/attachmentStorage';

// 附件工具（檔名處理、圖片壓縮、檔案格式化）
import {
  sanitizeStorageFileName,
  formatFileSize,
  compressImageFile,
} from './utils/attachmentUtils';

// --- 初始化 Supabase 雲端客戶端 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const sanitizeFilePart = (value: string) => {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'travel-expenses';
};





export default function App() {
  // 1. 使用者登入狀態
  const [userEmail, setUserEmail] = useState<string | null>(null)
  
  // 2. 行程基礎設定狀態
  const [tripOptions, setTripOptions] = useState<TripMeta[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string>('')
  const [currentTrip, setCurrentTrip] = useState<TripDetail | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // 3. 畫面控制狀態
  const [currentScreen, setCurrentScreen] = useState<string>('itinerary')
  const [activeDay, setActiveDay] = useState(1)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // 4. 雲端與離線資料緩衝狀態
  const [checkedItems, setCheckedItems] = useState<string[]>([]) 
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  
  // 5. 權限狀態
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null)
  const [hasEditPermission, setHasEditPermission] = useState<boolean>(() => {
    return localStorage.getItem(`auth_${selectedTripId}`) === 'true';
  });
  const [expenseBookTripId, setExpenseBookTripId] = useState<string>('');

  // 新增帳目表單狀態
  const [newTitle, setNewTitle] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPayer, setNewPayer] = useState('')
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditExpenseDraft>({ title: '', amount: '', payer: '', currency: 'JPY' })
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null)
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null)
  const [isSyncingAttachments, setIsSyncingAttachments] = useState(false)
  const [lastAttachmentSyncStamp, setLastAttachmentSyncStamp] = useState<{ bookId: string; value: string } | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // ✨ 核心修改點：將「檢視分頁頁籤(activeCurrency)」與「表單新增用幣別(formCurrency)」完全拆開
  // activeCurrency 可以是 'ALL'、'JPY'、'TWD'、'USD'
  const [activeCurrency, setActiveCurrency] = useState('ALL')
  // formCurrency 專門用在表單輸入上，獨立控制
  const [formCurrency, setFormCurrency] = useState('JPY')

  // 動態衍生變數：即時從變動後的 list.json 抽取參與成員與目的地幣別
  const selectedTripMeta = tripOptions.find(t => t.id === selectedTripId);
  const currentMembers = selectedTripMeta?.participants || ['我', '小明', '小華'];
  const currentCurrencyCode = selectedTripMeta?.currencyConfig.code || 'JPY';
  const currentCurrencySymbol = selectedTripMeta?.currencyConfig.symbol || '￥';
  const canUseExpense = Boolean(userEmail);
  const isUsingSharedExpenseBook = canUseExpense && hasEditPermission;
  const expenseMembers = isUsingSharedExpenseBook || !userEmail ? currentMembers : [userEmail];

  const applyTripDefaults = (trip: TripMeta) => {
    if (trip.participants.length > 0) {
      setNewPayer(trip.participants[0]);
    }
    setActiveCurrency('ALL');
    setFormCurrency(trip.currencyConfig.code);
  };

  const getBasePath = () => {
    const path = window.location.pathname;
    if (path.includes('/Travel-Companion')) return '/Travel-Companion/';
    return '/';
  };

  const handleAttachmentSelection = async (
    file: File | undefined,
    setter: (file: File | null) => void
  ) => {
    if (!file) {
      setter(null);
      return;
    }

    try {
      const compressed = await compressImageFile(file);
      setter(compressed);
      if (compressed.size < file.size) {
        alert(`照片已自動壓縮：${formatFileSize(file.size)} → ${formatFileSize(compressed.size)}。`);
      }
    } catch (error) {
      setter(null);
      alert(error instanceof Error ? error.message : '照片處理失敗，請重新選擇。');
    }
  };

  // 監聽登入狀態
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    return () => {
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
    };
  }, []);

  // 登入 / 登出
  const handleGoogleLogin = async () => {
    const currentRedirectUrl = window.location.origin + getBasePath();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: currentRedirectUrl, queryParams: { prompt: 'select_account' } }
    });
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut()
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('auth_') || key.startsWith('admin_profile_')) {
        localStorage.removeItem(key);
      }
    });
    setUserEmail(null)
    setAdminProfile(null)
    setHasEditPermission(false)
  }

  // 載入行程清單
  useEffect(() => {
    const basePath = getBasePath();
    const url = `${basePath}trips/list.json`.replace(/\/+/g, '/');
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: TripMeta[]) => {
        const sortedTrips = sortTripsByDateDesc(data);
        setTripOptions(sortedTrips);
        if (sortedTrips.length > 0) {
          const defaultTrip = findDefaultTrip(sortedTrips);
          const initialTrip = defaultTrip || sortedTrips[0];
          applyTripDefaults(initialTrip);
          setSelectedTripId(initialTrip.id);
        }
      })
      .catch(err => console.error(err))
  }, [])

  // 主要的行程與權限載入副作用
  useEffect(() => {
    if (!selectedTripId) return;
    
    async function loadTripAndAuthData() {
      const basePath = getBasePath();
      const detailPath = selectedTripMeta?.detailPath || `/trips/${selectedTripId}.json`;
      const url = `${basePath}${detailPath.replace(/^\//, '')}`.replace(/\/+/g, '/');

      try {
        const res = await fetch(url);
        if (res.ok) {
          const tripData = await res.json() as TripDetail;
          setCurrentTrip(tripData);
          setActiveDay(1);
          if (tripData.sidebarConfig?.length > 0) {
            const validScreenIds = tripData.sidebarConfig.map((screen) => screen.id);
            if (!validScreenIds.includes(currentScreen)) {
              setCurrentScreen(tripData.sidebarConfig[0].id);
            }
          }
        }
      } catch (err) { console.error(err); }

      let profile: AdminUser | null = null;
      const cachedProfile = localStorage.getItem(`admin_profile_${selectedTripId}`);
      
      if (userEmail && navigator.onLine) {
        try {
          const { data, error } = await supabase.from('admin_users').select('email, role, trip_id').eq('email', userEmail);
          if (!error && data) {
            const profiles = data as AdminUser[];
            profile =
              profiles.find((item) => item.role === 'super_admin') ||
              profiles.find((item) => item.role === 'trip_editor' && item.trip_id === selectedTripId) ||
              null;
            if (profile) {
              localStorage.setItem(`admin_profile_${selectedTripId}`, JSON.stringify(profile));
            }
          }
        } catch (err) { console.warn(err); }
      }

      if (!profile && cachedProfile) {
        try {
          const parsedProfile = JSON.parse(cachedProfile) as AdminUser;
          profile = parsedProfile.email === userEmail ? parsedProfile : null;
        } catch {
          profile = null;
        }
      }

      setAdminProfile(profile);

      const isAuthorized = 
        profile?.role === 'super_admin' || 
        (profile?.role === 'trip_editor' && profile.trip_id === selectedTripId);

      if (hasEditPermission !== isAuthorized) {
        setHasEditPermission(isAuthorized);
      }
      
      if (isAuthorized) {
        localStorage.setItem(`auth_${selectedTripId}`, 'true');
      }

      if (!userEmail) {
        setExpenseBookTripId('');
        setExpenses([]);
        setIsLoading(false);
        return;
      }

      const bookTripId = isAuthorized
        ? selectedTripId
        : toPersonalBookTripId(selectedTripId, userEmail);
      setExpenseBookTripId(bookTripId);

      if (isAuthorized && navigator.onLine) {
        try {
          const { data: expenseData, error: expenseError } = await supabase
            .from('expenses')
            .select('*')
            .eq('trip_id', bookTripId)
            .order('created_at', { ascending: true });

          if (!expenseError && expenseData) {
            const cachedBook = readStoredExpenses(toBookStorageKey(bookTripId), bookTripId, currentCurrencyCode);
            const cachedAttachmentIds = new Map(cachedBook.map((item) => [String(item.id), item.local_attachment_id || null]));
            const hydratedExpenses = await Promise.all((expenseData as ExpenseItem[]).map(async (item) => {
              const existingLocalAttachmentId = cachedAttachmentIds.get(String(item.id)) || item.local_attachment_id || null;
              if (!existingLocalAttachmentId && item.attachment_status === 'local_pending') {
                const recoveredId = await findLocalAttachmentIdByExpense(String(item.id), bookTripId);
                return {
                  ...item,
                  local_attachment_id: recoveredId || null
                };
              }
              return {
                ...item,
                local_attachment_id: existingLocalAttachmentId
              };
            }));
            setExpenses(hydratedExpenses);
            localStorage.setItem(toBookStorageKey(bookTripId), JSON.stringify(hydratedExpenses));
          } else {
            setExpenses(getStoredExpensesForTrip(bookTripId, currentCurrencyCode));
          }
        } catch {
          setExpenses(getStoredExpensesForTrip(bookTripId, currentCurrencyCode));
        }
      } else {
        setExpenses(getStoredExpensesForTrip(bookTripId, currentCurrencyCode));
      }

      setIsLoading(false);
    }

    loadTripAndAuthData();
  }, [currentCurrencyCode, currentScreen, hasEditPermission, selectedTripId, selectedTripMeta?.detailPath, userEmail])

  // 📡 智慧恢復網路自動同步機制
  useEffect(() => {
    const syncOfflineData = async () => {
      if (!navigator.onLine || !userEmail || !expenseBookTripId || !isUsingSharedExpenseBook) return;

      const localQueue = readStoredExpenses('offline_expenses', '', 'JPY');
      const sharedQueue = localQueue.filter((item) => {
        return item.trip_id === expenseBookTripId && !isPersonalBookTripId(item.trip_id);
      });
      if (sharedQueue.length === 0) return;

      try {
        const syncedIds = new Set<string>();
        const syncedLocalAttachmentIds = new Map<string, string | null>();

        for (const item of sharedQueue) {
          const { data, error } = await supabase
            .from('expenses')
            .insert([{
              trip_id: item.trip_id,
              title: item.title,
              amount: item.amount,
              payer: item.payer,
              currency: item.currency || 'JPY',
              attachment_bucket: item.attachment_bucket || ATTACHMENT_BUCKET,
              attachment_path: null,
              attachment_name: item.attachment_name || null,
              attachment_mime: item.attachment_mime || null,
              attachment_size: item.attachment_size || null,
              attachment_status: item.local_attachment_id ? 'local_pending' : (item.attachment_status || 'none'),
              attachment_uploaded_at: null,
              attachment_uploaded_by: null,
              attachment_last_error: null
            }])
            .select()
            .single();

          if (error) throw error;

          syncedIds.add(String(item.id));
          const savedId = data ? String((data as ExpenseItem).id) : '';
          if (savedId && item.local_attachment_id) {
            await updateLocalAttachmentExpenseId(item.local_attachment_id, savedId, expenseBookTripId);
            syncedLocalAttachmentIds.set(savedId, item.local_attachment_id);
          }
        }

        if (syncedIds.size > 0) {
          const remainingQueue = localQueue.filter((item) => !syncedIds.has(item.id));
          if (remainingQueue.length > 0) {
            localStorage.setItem('offline_expenses', JSON.stringify(remainingQueue));
          } else {
            localStorage.removeItem('offline_expenses');
          }
          
          if (expenseBookTripId) {
            const { data } = await supabase.from('expenses')
              .select('*')
              .eq('trip_id', expenseBookTripId)
              .order('created_at', { ascending: true });
            if (data) {
              const hydratedData = (data as ExpenseItem[]).map((item) => ({
                ...item,
                local_attachment_id: syncedLocalAttachmentIds.get(String(item.id)) || item.local_attachment_id || null
              }));
              localStorage.setItem(toBookStorageKey(expenseBookTripId), JSON.stringify(hydratedData));
              setExpenses([...hydratedData, ...remainingQueue]);
            }
          }
        }

        if (expenseBookTripId) {
          const refreshedExpenses = getStoredExpensesForTrip(expenseBookTripId, currentCurrencyCode);
          setExpenses(refreshedExpenses);
        }
      } catch (err) { console.error(err); }
    };

    window.addEventListener('online', syncOfflineData);
    const timer = setTimeout(syncOfflineData, 1000);

    return () => {
      window.removeEventListener('online', syncOfflineData);
      clearTimeout(timer);
    };
  }, [expenseBookTripId, isUsingSharedExpenseBook, userEmail]);

  // 新增與刪除旅費
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail || !expenseBookTripId) { alert('此功能須先登入'); return; }
    if (!newTitle || !newAmount || isNaN(Number(newAmount))) return

    const amountNum = Math.abs(Math.floor(Number(newAmount)))
    const selectedFile = newAttachmentFile;
    const attachmentFields = selectedFile
      ? {
          attachment_bucket: ATTACHMENT_BUCKET,
          attachment_path: null,
          attachment_name: selectedFile.name,
          attachment_mime: selectedFile.type || 'application/octet-stream',
          attachment_size: selectedFile.size,
          attachment_status: 'local_pending' as const,
          attachment_uploaded_at: null,
          attachment_uploaded_by: null,
          attachment_last_error: null
        }
      : {
          attachment_bucket: ATTACHMENT_BUCKET,
          attachment_path: null,
          attachment_name: null,
          attachment_mime: null,
          attachment_size: null,
          attachment_status: 'none' as const,
          attachment_uploaded_at: null,
          attachment_uploaded_by: null,
          attachment_last_error: null
        };
    
    const newExpenseData = { 
      trip_id: expenseBookTripId,
      title: newTitle, 
      amount: amountNum, 
      payer: isUsingSharedExpenseBook ? (newPayer || expenseMembers[0]) : userEmail,
      currency: formCurrency,
      ...attachmentFields
    };

    const clearAddForm = () => {
      setNewTitle('');
      setNewAmount('');
      setNewAttachmentFile(null);
    };
    
    const createLocalExpenseItem = async (): Promise<ExpenseItem & { created_at: string }> => {
      const localId = `local_${Date.now()}_${Math.random()}`;
      const localItem: ExpenseItem & { created_at: string } = {
        id: localId,
        created_at: new Date().toISOString(),
        ...newExpenseData,
        local_attachment_id: null
      };

      if (selectedFile) {
        const attachment = await saveLocalAttachment(selectedFile, localId, expenseBookTripId);
        localItem.local_attachment_id = attachment.id;
      }

      return localItem;
    };

    const saveToPersonalBook = async () => {
      const storageKey = toBookStorageKey(expenseBookTripId);
      const localBook = readStoredExpenses(storageKey, expenseBookTripId, currentCurrencyCode);
      const localItem = await createLocalExpenseItem();

      localBook.push(localItem);
      localStorage.setItem(storageKey, JSON.stringify(localBook));

      setExpenses(getStoredExpensesForTrip(expenseBookTripId, currentCurrencyCode));
      clearAddForm();
      alert(selectedFile
        ? '已儲存在此裝置的個人帳本，照片也只保存在本機。Excel 內會標註附件名稱，但不會產生雲端下載網址。'
        : '已儲存在此裝置的個人帳本，不會上傳到共用雲端。你仍可匯出 Excel 備份或分享。');
    };

    const saveToOfflineSandbox = async () => {
      const localQueue = readStoredExpenses('offline_expenses', '', currentCurrencyCode);
      const offlineItem = await createLocalExpenseItem();
      localQueue.push(offlineItem);
      localStorage.setItem('offline_expenses', JSON.stringify(localQueue));

      setExpenses(getStoredExpensesForTrip(expenseBookTripId, currentCurrencyCode));
      clearAddForm();
      alert(selectedFile
        ? '已先儲存在本機暫存箱；恢復連線後會自動同步帳目，照片仍需按「同步照片」上傳。'
        : '已先儲存在本機暫存箱；恢復連線後會自動同步到共用帳本。');
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
      const { data, error } = await supabase.from('expenses').insert([newExpenseData]).select()
      if (error) throw error;
      
      if (data) {
        const savedExpense = data[0] as ExpenseItem;
        let localAttachmentId: string | null = null;
        if (selectedFile) {
          const attachment = await saveLocalAttachment(selectedFile, String(savedExpense.id), expenseBookTripId);
          localAttachmentId = attachment.id;
        }

        const currentExpenses = Array.isArray(expenses) ? expenses : [];
        const updated = [...currentExpenses, { ...savedExpense, local_attachment_id: localAttachmentId }];
        setExpenses(updated);
        localStorage.setItem(toBookStorageKey(expenseBookTripId), JSON.stringify(updated));
        clearAddForm();
      }
    } catch {
      await saveToOfflineSandbox();
    }
  }

  const cancelPendingDelete = () => {
    setPendingDeleteId(null);
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
  };

  const finalizeDeleteExpense = async (removedExpense: ExpenseItem, restoreIndex: number) => {
    const targetId = String(removedExpense.id);

    try {
      if (!targetId.startsWith('local_') && isUsingSharedExpenseBook) {
        if (!navigator.onLine) throw new Error('offline');

        const { error } = await supabase.from('expenses').delete().eq('id', removedExpense.id);
        if (error) throw error;

        if (removedExpense.attachment_path) {
          void supabase.storage.from(ATTACHMENT_BUCKET).remove([removedExpense.attachment_path]);
        }
      }

removeExpenseFromStorage(
  removedExpense,
  isUsingSharedExpenseBook,
  expenseBookTripId,
  currentCurrencyCode
);
      void deleteLocalAttachment(removedExpense.local_attachment_id);
    } catch {
      setExpenses((current) => {
        if (current.some((expense) => String(expense.id) === targetId)) return current;

        const restored = [...current];
        restored.splice(Math.min(restoreIndex, restored.length), 0, removedExpense);
        return restored;
      });
      alert('無法完成刪除，已將帳目放回清單。');
    }
  };

  const startEditExpense = (item: ExpenseItem) => {
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
      currency: item.currency || currentCurrencyCode
    });
  };

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
    setEditDraft({ title: '', amount: '', payer: '', currency: currentCurrencyCode });
    setEditAttachmentFile(null);
  };

  const handleSaveEditExpense = async (id: string) => {
    if (!userEmail || !expenseBookTripId) { alert('此功能須先登入'); return; }
    if (!editDraft.title || !editDraft.amount || isNaN(Number(editDraft.amount))) return;

    const targetExpense = expenses.find((item) => String(item.id) === String(id));
    if (!targetExpense) return;

    let updatedExpense: ExpenseItem = {
      ...targetExpense,
      title: editDraft.title,
      amount: Math.abs(Math.floor(Number(editDraft.amount))),
      payer: isUsingSharedExpenseBook ? editDraft.payer : userEmail,
      currency: editDraft.currency
    };

    if (editAttachmentFile) {
      const attachment = await saveLocalAttachment(
        editAttachmentFile,
        String(id),
        expenseBookTripId,
        targetExpense.local_attachment_id
      );
      updatedExpense = {
        ...updatedExpense,
        attachment_bucket: ATTACHMENT_BUCKET,
        attachment_path: null,
        attachment_name: attachment.fileName,
        attachment_mime: attachment.mimeType,
        attachment_size: attachment.size,
        attachment_status: 'local_pending',
        attachment_uploaded_at: null,
        attachment_uploaded_by: null,
        attachment_last_error: null,
        local_attachment_id: attachment.id
      };
    }

    if (String(id).startsWith('local_') || !isUsingSharedExpenseBook) {
      replaceExpenseInStorage(
  updatedExpense,
  isUsingSharedExpenseBook,
  expenseBookTripId,
  currentCurrencyCode
);
      setExpenses((current) => current.map((item) => String(item.id) === String(id) ? updatedExpense : item));
      cancelEditExpense();
      return;
    }

    if (!navigator.onLine) {
      alert('目前處於離線狀態，無法修改雲端歷史帳目。');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('expenses')
        .update({
          title: updatedExpense.title,
          amount: updatedExpense.amount,
          payer: updatedExpense.payer,
          currency: updatedExpense.currency,
          attachment_bucket: updatedExpense.attachment_bucket || ATTACHMENT_BUCKET,
          attachment_path: updatedExpense.attachment_path || null,
          attachment_name: updatedExpense.attachment_name || null,
          attachment_mime: updatedExpense.attachment_mime || null,
          attachment_size: updatedExpense.attachment_size || null,
          attachment_status: updatedExpense.attachment_status || 'none',
          attachment_uploaded_at: updatedExpense.attachment_uploaded_at || null,
          attachment_uploaded_by: updatedExpense.attachment_uploaded_by || null,
          attachment_last_error: updatedExpense.attachment_last_error || null
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const savedExpense = { ...(data || updatedExpense), local_attachment_id: updatedExpense.local_attachment_id || null } as ExpenseItem;
      setExpenses((current) => {
        const updated = current.map((item) => String(item.id) === String(id) ? savedExpense : item);
        localStorage.setItem(toBookStorageKey(expenseBookTripId), JSON.stringify(updated));
        return updated;
      });
      cancelEditExpense();
    } catch {
      alert('無法連接雲端資料庫，目前無法修改雲端歷史帳目。');
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (!userEmail || !expenseBookTripId) { alert('此功能須先登入'); return; }

    const targetId = String(id);
    if (pendingDeleteId !== targetId) {
      setEditingExpenseId(null);
      setPendingDeleteId(targetId);
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
      deleteConfirmTimerRef.current = setTimeout(() => {
        setPendingDeleteId((current) => current === targetId ? null : current);
        deleteConfirmTimerRef.current = null;
      }, 3000);
      return;
    }

    const currentExpenses = Array.isArray(expenses) ? expenses : [];
    const targetIndex = currentExpenses.findIndex((item) => String(item.id) === targetId);
    const targetExpense = currentExpenses[targetIndex];
    if (!targetExpense) return;

    if (!String(targetExpense.id).startsWith('local_') && isUsingSharedExpenseBook && !navigator.onLine) {
      alert('目前處於離線狀態，無法刪除雲端歷史帳目。');
      return;
    }

    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }

    setPendingDeleteId(null);
    setExpenses(currentExpenses.filter((item) => String(item.id) !== targetId));
    void finalizeDeleteExpense(targetExpense, targetIndex);
  }

  const getSignedAttachmentUrl = async (path?: string | null) => {
    if (!path) return '';
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    return data?.signedUrl || '';
  };

  const handleOpenAttachment = async (item: ExpenseItem) => {
    try {
      if (item.attachment_path && item.attachment_status === 'synced') {
        const url = await getSignedAttachmentUrl(item.attachment_path);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (item.local_attachment_id) {
        const attachment = await getLocalAttachment(item.local_attachment_id);
        if (!attachment) {
          alert('這張照片只存在原本的瀏覽器本機，目前找不到附件檔。');
          return;
        }
        const url = URL.createObjectURL(attachment.blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      alert('這筆支出沒有可開啟的照片。');
    } catch {
      alert('無法開啟照片，請確認網路或登入權限。');
    }
  };

  const hasLocalAttachmentId = (item: ExpenseItem): item is ExpenseItem & { local_attachment_id: string } => {
    return typeof item.local_attachment_id === 'string';
  };

  const handleSyncAttachments = async () => {
    if (!userEmail || !expenseBookTripId) { alert('此功能須先登入'); return; }
    if (!isUsingSharedExpenseBook) {
      alert('個人帳本照片只存放在本機，不會同步到雲端。');
      return;
    }
    if (!navigator.onLine) {
      alert('目前離線，請連線後再同步照片。建議在 Wi-Fi 環境下上傳。');
      return;
    }

    const pendingItems = await Promise.all(expenses.map(async (item) => {
      if (item.attachment_status === 'synced' || String(item.id).startsWith('local_')) return null;
      if (hasLocalAttachmentId(item)) return item;
      if (item.attachment_status === 'local_pending') {
        const recoveredId = await findLocalAttachmentIdByExpense(String(item.id), expenseBookTripId);
        if (recoveredId) {
          return { ...item, local_attachment_id: recoveredId } as ExpenseItem & { local_attachment_id: string };
        }
      }
      return null;
    }));

    const filteredPendingItems = pendingItems.filter((item): item is ExpenseItem & { local_attachment_id: string } => Boolean(item));

    if (filteredPendingItems.length === 0) {
      alert('目前沒有尚未同步的照片。');
      return;
    }

    setIsSyncingAttachments(true);
    const savedItems: ExpenseItem[] = [];

    for (const item of filteredPendingItems) {
      try {
        const attachment = await getLocalAttachment(item.local_attachment_id);
        if (!attachment) {
          const errorMessage = 'local-attachment-not-found';
          const failedExpense: ExpenseItem = {
            ...item,
            attachment_status: 'upload_failed',
            attachment_last_error: errorMessage
          };

          savedItems.push(failedExpense);
          if (!String(item.id).startsWith('local_')) {
            await supabase
              .from('expenses')
              .update({
                attachment_status: 'upload_failed',
                attachment_last_error: errorMessage
              })
              .eq('id', item.id);
          }
          continue;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = sanitizeStorageFileName(attachment.fileName);
        const path = `${selectedTripId}/${item.id}/${stamp}-${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, attachment.blob, {
            contentType: attachment.mimeType,
            upsert: true
          });
        if (uploadError) throw uploadError;

        const updatePayload = {
          attachment_bucket: ATTACHMENT_BUCKET,
          attachment_path: path,
          attachment_name: attachment.fileName,
          attachment_mime: attachment.mimeType,
          attachment_size: attachment.size,
          attachment_status: 'synced',
          attachment_uploaded_at: new Date().toISOString(),
          attachment_uploaded_by: userEmail,
          attachment_last_error: null
        };

        const { data, error: updateError } = await supabase
          .from('expenses')
          .update(updatePayload)
          .eq('id', item.id)
          .select()
          .single();
        if (updateError) throw updateError;

        savedItems.push({ ...(data as ExpenseItem), local_attachment_id: item.local_attachment_id });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'upload-failed';
        const failedExpense: ExpenseItem = {
          ...item,
          attachment_status: 'upload_failed',
          attachment_last_error: errorMessage
        };

        savedItems.push(failedExpense);
        if (!String(item.id).startsWith('local_')) {
          await supabase
            .from('expenses')
            .update({
              attachment_status: 'upload_failed',
              attachment_last_error: errorMessage
            })
            .eq('id', item.id);
        }
      }
    }

    setExpenses((current) => {
      const savedMap = new Map(savedItems.map((item) => [String(item.id), item]));
      const updated = current.map((item) => savedMap.get(String(item.id)) || item);
      localStorage.setItem(toBookStorageKey(expenseBookTripId), JSON.stringify(updated));
      return updated;
    });

    if (expenseBookTripId) {
      const { data: refreshedData } = await supabase.from('expenses')
        .select('*')
        .eq('trip_id', expenseBookTripId)
        .order('created_at', { ascending: true });
      if (refreshedData) {
        const hydrated = (refreshedData as ExpenseItem[]).map((item) => ({
          ...item,
          local_attachment_id: localStorage.getItem(toBookStorageKey(expenseBookTripId))
            ? JSON.parse(localStorage.getItem(toBookStorageKey(expenseBookTripId)) || '[]').find((x: ExpenseItem) => String(x.id) === String(item.id))?.local_attachment_id || item.local_attachment_id || null
            : item.local_attachment_id || null
        }));
        setExpenses(hydrated);
        localStorage.setItem(toBookStorageKey(expenseBookTripId), JSON.stringify(hydrated));
      }
    }

    const now = new Date().toISOString();
    localStorage.setItem(`attachment_last_sync_${expenseBookTripId}`, now);
    setLastAttachmentSyncStamp({ bookId: expenseBookTripId, value: now });
    setIsSyncingAttachments(false);
    alert('照片同步完成。若有失敗項目，清單會保留待同步狀態供下次重試。');
  };

  const buildExpenseXlsx = async () => {
    const exportItems = isUsingSharedExpenseBook ? filteredExpenses : safeExpenses;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expenses');

    const rows: Array<(string | number)[]> = [
      ['消費項目', '支出人', '幣別代碼', '幣別符號', '金額', '附件下載連結']
    ];

    const hyperlinkRows: Array<{ index: number; url: string; text: string }> = [];

    for (const item of exportItems) {
      const currencyCode = item.currency || currentCurrencyCode;
      const targetConfig = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
      let attachmentUrl = '';
      if (isUsingSharedExpenseBook && item.attachment_path && item.attachment_status === 'synced') {
        try {
          attachmentUrl = await getSignedAttachmentUrl(item.attachment_path);
        } catch {
          attachmentUrl = '';
        }
      }
      const attachmentName = item.attachment_name || '無附件';

      rows.push([
        item.title,
        item.payer || '未知',
        currencyCode,
        targetConfig?.symbol || currentCurrencySymbol,
        item.amount || 0,
        attachmentName
      ]);

      if (attachmentUrl) {
        hyperlinkRows.push({
          index: rows.length,
          url: attachmentUrl,
          text: attachmentName
        });
      }
    }

    rows.forEach((rowData) => worksheet.addRow(rowData));

    for (const link of hyperlinkRows) {
      const row = worksheet.getRow(link.index);
      const hyperlinkCell = row.getCell(6);
      hyperlinkCell.value = {
        text: link.text,
        hyperlink: link.url
      };
      hyperlinkCell.font = {
        color: { argb: 'FF0000FF' },
        underline: true
      };
    }

    return workbook;
  };

  const getExportFileNameXlsx = () => {
    const tripName = currentTrip?.title || selectedTripMeta?.title || selectedTripId || 'travel';
    const scope = isUsingSharedExpenseBook ? 'shared' : 'personal';
    return `${sanitizeFilePart(tripName)}-${scope}-expenses.xlsx`;
  };

  const handleExportXlsx = async () => {
    if (!userEmail) { alert('此功能須先登入'); return; }
    const exportItems = isUsingSharedExpenseBook ? filteredExpenses : safeExpenses;
    if (exportItems.length === 0) { alert('目前沒有可匯出的帳本資料'); return; }

    const workbook = await buildExpenseXlsx();
    const suggestedName = getExportFileNameXlsx();
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    try {
      const picker = (window as Window & {
        showSaveFilePicker?: (options: {
          suggestedName: string;
          types: Array<{ description: string; accept: Record<string, string[]> }>;        }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;      }).showSaveFilePicker;

      if (picker) {
        const handle = await picker({
          suggestedName,
          types: [{ description: 'Excel file', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // ----------------------------------------------------
  // 📊 數據計算：支援「ALL (全部顯示)」與各幣別分頁過濾
  // ----------------------------------------------------
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const availableCurrencies = SUPPORTED_CURRENCIES.filter((currency) =>
    safeExpenses.some((expense) => (expense.currency || currentCurrencyCode) === currency.code)
  );
  const effectiveActiveCurrency =
    activeCurrency === 'ALL' || availableCurrencies.some((currency) => currency.code === activeCurrency)
      ? activeCurrency
      : 'ALL';
  
  // 💡 根據 activeCurrency 過濾歷史明細：如果為 'ALL' 則保留全部
  const filteredExpenses = safeExpenses.filter(item => {
    if (!item) return false;
    if (effectiveActiveCurrency === 'ALL') return true; // 全部顯示支出
    const itemCurrency = item.currency || currentCurrencyCode;
    return itemCurrency === effectiveActiveCurrency;
  });
  const pendingAttachmentCount = isUsingSharedExpenseBook ? safeExpenses.filter((item) =>
    item.local_attachment_id &&
    item.attachment_status !== 'synced' &&
    item.attachment_status !== 'none' &&
    !String(item.id).startsWith('local_')
  ).length : 0;
  const hasUnsyncedLocalExpenseAttachments = safeExpenses.some((item) =>
    item.local_attachment_id &&
    item.attachment_status !== 'synced' &&
    String(item.id).startsWith('local_') &&
    isUsingSharedExpenseBook
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
    : '尚未同步';

  // 計算特定單一幣別總金額（若為 ALL，此處純計算，看板會有專屬防混淆顯示）
  const totalExpense = filteredExpenses.reduce((sum, item) => {
    if (!item || !item.amount) return sum;
    const val = Number(item.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  
  const averageExpense = expenseMembers.length > 0 ? Math.round(totalExpense / expenseMembers.length) : 0;
  
  const paitAmounts: { [key: string]: number } = {};
  expenseMembers.forEach((m: string) => { paitAmounts[m] = 0; });
  
  filteredExpenses.forEach(item => { 
    if (item && item.payer && paitAmounts[item.payer] !== undefined) {
      const val = Number(item.amount);
      paitAmounts[item.payer] += (isNaN(val) ? 0 : val);
    } 
  });

  const activeCurrencySymbol = SUPPORTED_CURRENCIES.find(c => c.code === effectiveActiveCurrency)?.symbol || currentCurrencySymbol;

  // 地圖導航事件 (完全保留)
  const handleNavigate = (location: string) => { 
    if (!location) return; 
    window.open(`https://maps.google.com/?q=${encodeURIComponent(location)}`, '_blank'); 
  };

  // 打包清單事件 (完全保留)
  const toggleChecklistItem = (id: string) => { 
    if (checkedItems.includes(id)) {
      setCheckedItems(checkedItems.filter(item => item !== id));
      return;
    }
    setCheckedItems([...checkedItems, id]);
  }

  const handleScreenSelect = (item: TripDetail['sidebarConfig'][number]) => {
    if (item.type === 'expense' && !userEmail) {
      alert('此功能須先登入');
      setIsMenuOpen(false);
      return;
    }
    setCurrentScreen(item.id);
    if (item.type === 'expense') {
      setActiveCurrency('ALL');
    }
    setIsMenuOpen(false);
  };

  const currentDayEvents = currentTrip?.content?.daysData?.[String(activeDay)] || [];
  const checklistData = currentTrip?.content?.checklistData || [];
  const categories = Array.from(new Set(checklistData.map(item => item.category)))

  const renderSidebarIcon = (type: string) => {
    switch (type) {
      case 'itinerary': return <Calendar size={18} />
      case 'checklist': return <CheckSquare size={18} />
      case 'expense': return <Wallet size={18} />
      default: return <Home size={18} />
    }
  }

  const getHeaderBgColor = () => {
    const activeConfig = currentTrip?.sidebarConfig.find(item => item.id === currentScreen)
    if (!activeConfig) return 'bg-emerald-700'
    switch (activeConfig.type) {
      case 'checklist': return 'bg-rose-700'
      case 'expense': return 'bg-amber-600'
      case 'text': return 'bg-stone-700'
      default: return 'bg-emerald-700'
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased overflow-x-hidden">
      {isMenuOpen && <div className="fixed inset-0 bg-black/40 z-50 transition-opacity duration-300" onClick={() => setIsMenuOpen(false)} />}

      {/* 側邊欄抽屜 */}
      <div className={`fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">我的旅行小幫手</h3>
              <p className="text-xs text-slate-400">雲端權限多行程管理</p>
            </div>
            <button onClick={() => setIsMenuOpen(false)} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X size={20} /></button>
          </div>

          <div className="mt-2">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
              <FolderOpen size={12} /> 切換行程資料庫
            </label>
            <select
              value={selectedTripId}
              onChange={(e) => {
                const nextTrip = tripOptions.find((trip) => trip.id === e.target.value);
                if (!nextTrip) return;
                setIsLoading(true);
                applyTripDefaults(nextTrip);
                setCurrentScreen('itinerary');
                setActiveDay(1);
                setSelectedTripId(nextTrip.id);
                setIsMenuOpen(false);
              }}
              className="w-full text-sm p-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {tripOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.title} ({option.departureDate})
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav className="p-3 flex-1 space-y-1 overflow-y-auto">
          {currentTrip?.sidebarConfig.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleScreenSelect(item)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left font-medium transition-all ${
                  isActive ? 'bg-slate-900 text-white font-bold shadow-md' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className={isActive ? 'text-white' : 'text-slate-400'}>
                  {renderSidebarIcon(item.type)}
                </div>
                <span>{item.title}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs">
          {userEmail ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">目前登入：</span>
                <button onClick={handleLogout} className="text-rose-600 font-bold flex items-center gap-0.5 hover:underline"><LogOut size={12} /> 登出</button>
              </div>
              <p className="font-semibold text-slate-700 truncate">{userEmail}</p>
              <div className="mt-1">
                {selectedTripId && currentTrip ? (
                  hasEditPermission ? (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">
                      🟢 本行程可編輯者 {adminProfile?.role === 'super_admin' ? '(超級管理員)' : ''}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold rounded-full text-[10px]">個人帳本模式</span>
                  )
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded-full text-[10px]">請先選擇上方行程</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              {hasEditPermission ? (
                <div className="space-y-2 text-left bg-slate-100 p-2 rounded-lg">
                  <p className="text-slate-500 font-medium">📡 目前處於離線狀態</p>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">🛡️ 已開啟離線編輯權限</span>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 mb-2">登入後解鎖雲端同步記帳</p>
                  <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors shadow-sm">
                    <LogIn size={14} /> 使用 Google 登入
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 頂部標頭 */}
      <header className={`text-white p-4 sticky top-0 z-40 shadow-md transition-colors duration-300 ${getHeaderBgColor()}`}>
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMenuOpen(true)} className="p-1 rounded hover:bg-black/10 transition-colors"><Menu size={24} /></button>
            <div>
              <h1 className="text-xl font-bold tracking-wide">
                {currentTrip ? currentTrip.title : '載入中...'}
              </h1>
              <p className="text-xs text-slate-100 mt-0.5 flex items-center gap-1 flex-wrap">
                <span>{isUsingSharedExpenseBook ? '🌍 共用帳本同步中' : userEmail ? '個人帳本模式' : '🔒 未登入瀏覽模式'}</span>
                {currentTrip?.departureDate && (
                  <>
                    <span className="opacity-60">•</span>
                    <span>📅 出發：{currentTrip.departureDate}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 主內容呈現區 */}
      <main className="max-w-md mx-auto p-4 pb-24">
        {isLoading ? (
          <div className="text-center py-24 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto mb-4"></div>
            正在建立雲端 safe 連線...
          </div>
        ) : (
          <>
            {/* 1. 行程規劃模組 */}
            {currentTrip?.sidebarConfig.find(s => s.id === currentScreen)?.type === 'itinerary' && (
              <>
                <div className="grid grid-cols-5 gap-1.5 mb-6">
                  {currentTrip.content.days.map((day) => (
                    <button key={day} onClick={() => setActiveDay(day)} className={`py-2 px-1 rounded-lg font-semibold text-xs transition-all shadow-sm truncate ${activeDay === day ? 'bg-slate-900 text-white font-bold' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                      D{day}
                    </button>
                  ))}
                </div>
                <div className="mb-4 border-b border-slate-200 pb-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-extrabold text-amber-700 tracking-tight">{String(activeDay).padStart(2, '0')}</span>
                    <div>
                      <h2>行程探索 Day {activeDay}</h2>
                    </div>
                  </div>
                </div>

                {currentDayEvents.length > 0 ? (
                  <div className="space-y-4">
                    {currentDayEvents.map((event, idx) => (
                      <div key={idx} className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-bold text-slate-500">{event.time}</span>
                          <span className={`px-2 py-0.5 border rounded text-xs font-semibold ${event.typeColor}`}>{event.type}</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1.5">{event.title}</h3>
                        {event.desc && <p className="text-sm text-slate-600 leading-relaxed mb-4">{event.desc}</p>}
                        {event.location && (
                          <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button onClick={() => handleNavigate(event.location!)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg text-xs font-bold text-slate-600 transition-colors">
                              <MapPin size={14} className="text-emerald-600" /> 地圖導航 <ExternalLink size={10} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
                    此行程今日尚無規劃活動景點。
                  </div>
                )}
              </>
            )}

            {/* 2. 行李清單檢查模組 */}
            {currentTrip?.sidebarConfig.find(s => s.id === currentScreen)?.type === 'checklist' && (
              <div className="space-y-6">
                {checklistData.length > 0 ? (
                  <>
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
                      <div className="flex justify-between items-center mb-2 text-sm font-bold text-slate-700">
                        <span>準備進度</span>
                        <span className="text-rose-700">{Math.round((checkedItems.length / checklistData.length) * 100)}% ({checkedItems.length}/{checklistData.length})</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-rose-600 h-full transition-all duration-500 ease-out" style={{ width: `${(checkedItems.length / checklistData.length) * 100}%` }} />
                      </div>
                    </div>
                    {categories.map((category) => (
                      <div key={category} className="space-y-2">
                        <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-wider pl-1">{category}</h3>
                        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden divide-y divide-slate-100">
                          {checklistData.filter(item => item.category === category).map((item) => {
                            const isChecked = checkedItems.includes(item.id);
                            return (
                              <div key={item.id} onClick={() => toggleChecklistItem(item.id)} className="flex items-center gap-3 p-4 hover:bg-slate-50/80 cursor-pointer transition-colors select-none">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isChecked ? 'bg-rose-600 border-rose-600 text-white shadow-sm scale-105' : 'border-slate-300 bg-white'}`}>{isChecked && <Check size={14} strokeWidth={3} />}</div>
                                <span className={`text-sm font-medium transition-all ${isChecked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-12 text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl shadow-sm">
                    此行程尚未配置檢查清單。
                  </div>
                )}
              </div>
            )}

            {/* 3. 純文字/備忘錄模組 */}
            {currentTrip?.sidebarConfig.find(s => s.id === currentScreen)?.type === 'text' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5">
                  <h3 className="text-xl font-bold text-slate-800 mb-1">
                    {currentTrip.content.custom_tab_1?.subtitle || '自訂資訊區'}
                  </h3>
                  <div className="w-full h-px bg-slate-100 my-3" />
                  <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono">
                    {currentTrip.content.custom_tab_1?.mainText || '目前尚無詳細欄位內容。'}
                  </p>
                </div>
              </div>
            )}

            {/* 4. 智慧多幣別記帳模組 */}
            {currentTrip?.sidebarConfig.find(s => s.id === currentScreen)?.type === 'expense' && (
              <div className="space-y-5">
                
                {/* 頁籤切換：✨ 加入了「全部」分頁按鈕 */}
                <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setActiveCurrency('ALL')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      effectiveActiveCurrency === 'ALL'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                    }`}
                  >
                    全部顯示
                  </button>
                  {availableCurrencies.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setActiveCurrency(c.code)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        effectiveActiveCurrency === c.code
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                      }`}
                    >
                      {c.name} ({c.code})
                    </button>
                  ))}
                </div>

                {/* 總覽看板 */}
                <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl text-white shadow-md">
                  <span className="text-xs text-amber-100 font-bold tracking-wider uppercase">
                    {effectiveActiveCurrency === 'ALL' ? '總明細預覽看板' : `雲端分流統計 (${effectiveActiveCurrency} 頁籤)`}
                  </span>
                  
                  {effectiveActiveCurrency === 'ALL' ? (
                    <div>
                      <h2 className="text-2xl font-black mt-1">
                        {safeExpenses.length > 0 ? '混合多幣別清單' : '目前尚無記帳資料'}
                      </h2>
                      <p className="text-xs text-amber-100/90 mt-1">
                        {safeExpenses.length > 0
                          ? '目前為混合檢視，下方可查閱各幣別的歷史明細項目。'
                          : '新增第一筆旅費後，這裡會自動顯示可篩選的幣別。'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <h2 className="mt-1 min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere]">
                        {activeCurrencySymbol} {totalExpense.toLocaleString()}
                      </h2>
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/20 text-sm">
                        <div className="min-w-0">
                          <span className="text-amber-100/80 text-xs block">{expenseMembers.length} 人平攤 (每人)</span>
                          <span className="block min-w-0 break-words text-base font-bold leading-snug [overflow-wrap:anywhere]">
                            {activeCurrencySymbol} {averageExpense.toLocaleString()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-amber-100/80 text-xs block">記帳筆數</span>
                          <span className="block text-lg font-bold">{filteredExpenses.length} 筆</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 分攤結算狀態：✨ 僅在非 ALL 時顯示，以防幣別混合造成計算錯誤 */}
                {effectiveActiveCurrency !== 'ALL' ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">
                      {effectiveActiveCurrency} 分攤結算狀態
                    </h3>
                    <div className="space-y-3">
                      {expenseMembers.map((member: string) => {
                        const paid = paitAmounts[member] || 0
                        const status = paid - averageExpense
                        return (
                          <div key={member} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3 p-2.5 rounded-lg bg-slate-50">
                            <div className="min-w-0">
                              <span className="block break-words font-bold text-slate-700 [overflow-wrap:anywhere]">{member}</span>
                              <span className="block min-w-0 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                                已墊：{activeCurrencySymbol}{paid.toLocaleString()}
                              </span>
                            </div>
                            <div className="min-w-0 text-right">
                              {status > 0 ? (
                                <span className="inline-block max-w-full break-words rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold leading-snug text-emerald-600 [overflow-wrap:anywhere]">應收回 {activeCurrencySymbol}{status.toLocaleString()}</span>
                              ) : status < 0 ? (
                                <span className="inline-block max-w-full break-words rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold leading-snug text-rose-600 [overflow-wrap:anywhere]">應補繳 {activeCurrencySymbol}{Math.abs(status).toLocaleString()}</span>
                              ) : (
                                <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-full">已平帳</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center text-xs font-medium text-slate-500">
                    💡 切換至單一幣別頁籤（如日圓、新台幣）即可查看該幣別的精確分攤結算。
                  </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">帳本匯出</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isUsingSharedExpenseBook
                          ? '依目前清單與幣別篩選匯出 XLSX，附件欄位會顯示可點擊的下載連結'
                          : '已儲存在此裝置的個人帳本，照片也只保存在本機。Excel 內會標註附件名稱，但不會產生雲端下載網址。'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleExportXlsx} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
                        <Download size={14} /> XLSX
                      </button>
                    </div>
                  </div>
                  {canUseExpense && (
                    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700">照片附件同步</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                            最後上傳：{attachmentSyncLabel}。照片會自動壓縮至 1MB 以內，建議在 Wi-Fi 環境下再上傳以節省流量。
                          </p>
                          {isUsingSharedExpenseBook && hasUnsyncedLocalExpenseAttachments && (
                            <p className="mt-1 text-[11px] font-semibold text-orange-700">有離線新增的照片，請先連線讓帳目自動同步後，再按同步照片。</p>
                          )}
                        </div>
                        {isUsingSharedExpenseBook ? (
                          <button
                            type="button"
                            onClick={handleSyncAttachments}
                            disabled={isSyncingAttachments || pendingAttachmentCount === 0}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-colors ${
                              pendingAttachmentCount > 0
                                ? 'bg-orange-600 hover:bg-orange-700'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                            } disabled:cursor-not-allowed disabled:opacity-70`}
                          >
                            <UploadCloud size={14} />
                            {isSyncingAttachments ? '同步中...' : pendingAttachmentCount > 0 ? `同步照片 ${pendingAttachmentCount}` : '照片已同步'}
                          </button>
                        ) : (
                          <span className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-bold text-sky-800">個人帳本照片僅存本機</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 新增表單區：✨ 下拉選單改為 formCurrency，完全與最上方的 Tabs 分離 */}
                {canUseExpense ? (
                  <form onSubmit={handleAddExpense} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-800">新增一筆旅費</h3>
                      <span className="text-[11px] bg-slate-100 text-slate-600 font-extrabold px-2 py-0.5 rounded-full">
                        獨立選擇新增幣別
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <input type="text" placeholder="消費項目" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" required />
                      
                      <div className="flex gap-2">
                        {/* 這裡改為獨立綁定 formCurrency 狀態 */}
                        <select 
                          value={formCurrency} 
                          onChange={(e) => setFormCurrency(e.target.value)}
                          className="px-2 py-2 border border-slate-200 rounded-lg text-sm bg-amber-50 font-bold text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          {SUPPORTED_CURRENCIES.map(c => (
                            <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                          ))}
                        </select>
                        <input type="number" placeholder="金額" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" required />
                      </div>
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 hover:border-amber-300 hover:bg-amber-50">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <Camera size={16} className="text-amber-600" />
                          <span className="truncate">{newAttachmentFile ? newAttachmentFile.name : '拍照 / 選擇照片附件'}</span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold text-slate-400">
                          {newAttachmentFile ? formatFileSize(newAttachmentFile.size) : '自動壓縮 <= 1MB'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            void handleAttachmentSelection(file, setNewAttachmentFile);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {newAttachmentFile && (
                        <button type="button" onClick={() => setNewAttachmentFile(null)} className="w-fit text-xs font-bold text-rose-500 hover:text-rose-700">
                          移除照片附件
                        </button>
                      )}
                    </div>
                    
                    {/* 付款人 */}
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-xs text-slate-500 font-medium">付款人：</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {expenseMembers.map((m: string) => (
                          <button key={m} type="button" onClick={() => setNewPayer(m)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${newPayer === m || (!isUsingSharedExpenseBook && m === userEmail) ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{m}</button>
                        ))}
                      </div>
                      <button type="submit" className="ml-auto flex items-center gap-1 bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-lg"><Plus size={14} /> 記帳</button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 text-xs">
                    <ShieldAlert size={18} className="text-amber-600 shrink-0" />
                    <div>
                      <p className="font-bold mb-0.5">此功能須先登入</p>
                      <p className="text-amber-700/90 leading-relaxed">請先點選左側選單完成 Google 登入。登入後若不在核准名單內，系統會自動建立你的個人帳本。</p>
                    </div>
                  </div>
                )}

                {/* 歷史消費清單列表 */}
                <div className="space-y-2">
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
                    {filteredExpenses.length > 0 ? (
                      filteredExpenses.map((item) => {
                        if (!item || !item.title) return null;

                        // 💡 動態抓取每筆資料自己當初存入的幣別，正確呈現符號
                        const targetConfig = SUPPORTED_CURRENCIES.find(c => c.code === item.currency);
                        const itemSymbol = targetConfig ? targetConfig.symbol : currentCurrencySymbol;
                        const itemCurrencyCode = item.currency || currentCurrencyCode;
                        const isEditing = editingExpenseId === String(item.id);
                        const isPendingDelete = pendingDeleteId === String(item.id);
                        const hasAttachment = Boolean(item.local_attachment_id || item.attachment_path || item.attachment_name);

                        return (
                          <div key={item.id} className="relative p-4">
                            {isEditing ? (
                              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                                <input
                                  type="text"
                                  value={editDraft.title}
                                  onChange={(e) => setEditDraft((draft) => ({ ...draft, title: e.target.value }))}
                                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  placeholder="消費項目"
                                />
                                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                                  <select
                                    value={editDraft.currency}
                                    onChange={(e) => setEditDraft((draft) => ({ ...draft, currency: e.target.value }))}
                                    className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-sm font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  >
                                    {SUPPORTED_CURRENCIES.map(c => (
                                      <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    value={editDraft.amount}
                                    onChange={(e) => setEditDraft((draft) => ({ ...draft, amount: e.target.value }))}
                                    className="min-w-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="金額"
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-medium text-slate-500">付款人：</span>
                                  {expenseMembers.map((m: string) => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => setEditDraft((draft) => ({ ...draft, payer: m }))}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${editDraft.payer === m || (!isUsingSharedExpenseBook && m === userEmail) ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </div>
                                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-amber-50">
                                  <span className="inline-flex min-w-0 items-center gap-2">
                                    <Camera size={16} className="text-amber-600" />
                                    <span className="truncate">{editAttachmentFile ? editAttachmentFile.name : item.attachment_name || '補拍 / 更換照片附件'}</span>
                                  </span>
                                  <span className="shrink-0 text-[11px] font-bold text-slate-400">
                                    {editAttachmentFile ? formatFileSize(editAttachmentFile.size) : '自動壓縮 <= 1MB'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      void handleAttachmentSelection(file, setEditAttachmentFile);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={cancelEditExpense} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                                    <X size={14} /> 取消
                                  </button>
                                  <button type="button" onClick={() => handleSaveEditExpense(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
                                    <Save size={14} /> 儲存
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {hasAttachment ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenAttachment(item)}
                                    className="min-w-0 whitespace-pre-wrap break-words text-left text-sm font-bold leading-6 text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900 [overflow-wrap:anywhere]"
                                  >
                                    {item.title}
                                  </button>
                                ) : (
                                  <h4 className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-950 [overflow-wrap:anywhere]">{item.title}</h4>
                                )}
                                {hasAttachment && (
                                  <div className="flex min-w-0">
                                    <span className={`inline-flex max-w-full items-center gap-1 break-words rounded px-2 py-1 text-[11px] font-semibold leading-snug [overflow-wrap:anywhere] ${
                                      item.attachment_status === 'synced'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : item.attachment_status === 'upload_failed'
                                          ? 'bg-rose-50 text-rose-700'
                                          : 'bg-orange-50 text-orange-700'
                                    }`}>
                                      <Paperclip size={12} />
                                      {item.attachment_status === 'synced'
                                        ? '照片已同步'
                                        : item.attachment_status === 'upload_failed'
                                          ? '照片同步失敗'
                                          : isUsingSharedExpenseBook
                                            ? `照片待同步${item.attachment_name ? `：${item.attachment_name}` : ''}`
                                            : '照片僅存本機'}
                                    </span>
                                  </div>
                                )}
                                <div className="flex min-w-0">
                                  <span className="max-w-full break-words rounded bg-sky-50 px-2 py-1 text-[11px] font-semibold leading-snug text-sky-800 [overflow-wrap:anywhere]">支出人：{item.payer || '未知'}</span>
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-500">{itemCurrencyCode}</span>
                                  <span className="rounded bg-amber-50 px-2 py-1 font-mono text-[10px] font-bold text-amber-800">{itemSymbol}</span>
                                  <span className="min-w-0 max-w-full break-words font-mono text-sm font-black leading-6 text-slate-950 [overflow-wrap:anywhere]">
                                    {(item.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                                {canUseExpense && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" title="編輯這筆帳目" onClick={() => startEditExpense(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700">
                                      <Edit3 size={14} /> 編輯
                                    </button>
                                    <button
                                      type="button"
                                      title="刪除這筆帳目"
                                      onClick={() => handleDeleteExpense(item.id)}
                                      className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold transition-colors ${
                                        isPendingDelete
                                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                                          : 'border-rose-100 text-rose-300 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
                                      }`}
                                    >
                                      <Trash2 size={14} /> 刪除
                                    </button>
                                  </div>
                                )}
                                {isPendingDelete && (
                                  <div className="w-full max-w-[18rem] rounded-xl border border-rose-200 bg-white p-3 text-left shadow-lg">
                                    <p className="text-xs font-semibold leading-relaxed text-rose-700">確定要刪除這筆帳目嗎？3 秒內未選擇將自動取消。</p>
                                    <div className="mt-3 flex justify-end gap-2">
                                      <button type="button" onClick={cancelPendingDelete} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                                        復原
                                      </button>
                                      <button type="button" onClick={() => handleDeleteExpense(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">
                                        <Trash2 size={14} /> 確認刪除
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        {safeExpenses.length === 0 ? '目前尚無記帳資料' : '目前尚無此分類下的記帳資料。'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
