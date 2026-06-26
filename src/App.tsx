import { useState, useEffect } from 'react'
import { Menu, X, Calendar, CheckSquare, Home, Wallet, MapPin, ExternalLink, Check, Plus, Trash2, FolderOpen, LogIn, LogOut, ShieldAlert } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

// 💡 引入型別與工具函式
import type { TripMeta, TripDetail } from './types/trip'
import { sortTripsByDateDesc, findDefaultTrip } from './utils/tripHelpers'

// --- 初始化 Supabase 雲端客戶端 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface ExpenseItem { 
  id: string; 
  trip_id: string; 
  title: string; 
  amount: number; 
  payer: string; 
  currency?: string; 
}

interface StoredExpenseItem extends ExpenseItem {
  created_at?: string;
}

interface AdminUser {
  email: string;
  role: 'super_admin' | 'trip_editor';
  trip_id: string | null;
}

// 支援手動切換的常用幣別選單配置
const SUPPORTED_CURRENCIES = [
  { code: 'JPY', symbol: '￥', name: '日圓' },
  { code: 'TWD', symbol: '$', name: '新台幣' },
  { code: 'USD', symbol: '$', name: '美金' },
];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const readStorageArray = (key: string): unknown[] => {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toStoredExpenseItem = (
  value: unknown,
  fallbackTripId: string,
  fallbackCurrency: string
): StoredExpenseItem | null => {
  if (!isRecord(value)) return null;

  const tripId = typeof value.trip_id === 'string' ? value.trip_id : fallbackTripId;
  if (!tripId) return null;

  return {
    id: typeof value.id === 'string' ? value.id : `cached_${Math.random()}`,
    trip_id: tripId,
    title: typeof value.title === 'string' && value.title ? value.title : '未命名消費',
    amount: Number(value.amount) || 0,
    payer: typeof value.payer === 'string' && value.payer ? value.payer : '我',
    currency: typeof value.currency === 'string' ? value.currency : fallbackCurrency,
    created_at: typeof value.created_at === 'string' ? value.created_at : undefined,
  };
};

const readStoredExpenses = (
  key: string,
  fallbackTripId: string,
  fallbackCurrency: string
): StoredExpenseItem[] => {
  return readStorageArray(key)
    .map((item) => toStoredExpenseItem(item, fallbackTripId, fallbackCurrency))
    .filter((item): item is StoredExpenseItem => item !== null);
};

const getStoredExpensesForTrip = (tripId: string, fallbackCurrency: string): StoredExpenseItem[] => {
  const cachedExpenses = readStoredExpenses(`cached_expenses_${tripId}`, tripId, fallbackCurrency);
  const offlineExpenses = readStoredExpenses('offline_expenses', '', fallbackCurrency)
    .filter((item) => item.trip_id === tripId);

  return [...cachedExpenses, ...offlineExpenses];
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

  // 新增帳目表單狀態
  const [newTitle, setNewTitle] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPayer, setNewPayer] = useState('')
  
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
          const { data, error } = await supabase.from('admin_users').select('email, role, trip_id').eq('email', userEmail).maybeSingle();
          if (!error && data) {
            profile = data as AdminUser;
            localStorage.setItem(`admin_profile_${selectedTripId}`, JSON.stringify(data));
          }
        } catch (err) { console.warn(err); }
      }

      if (!profile && cachedProfile) {
        try {
          profile = JSON.parse(cachedProfile) as AdminUser;
        } catch {
          profile = null;
        }
      }

      setAdminProfile(profile);

      const lastKnownAuth = localStorage.getItem(`auth_${selectedTripId}`);
      const isAuthorized = 
        lastKnownAuth === 'true' || 
        profile?.role === 'super_admin' || 
        (profile?.role === 'trip_editor' && profile.trip_id === selectedTripId);

      if (hasEditPermission !== isAuthorized) {
        setHasEditPermission(isAuthorized);
      }
      
      if (isAuthorized) {
        localStorage.setItem(`auth_${selectedTripId}`, 'true');
      }

      if (navigator.onLine) {
        try {
          const { data: expenseData, error: expenseError } = await supabase
            .from('expenses')
            .select('*')
            .eq('trip_id', selectedTripId)
            .order('created_at', { ascending: true });

          if (!expenseError && expenseData) {
            setExpenses(expenseData as ExpenseItem[]);
            localStorage.setItem(`cached_expenses_${selectedTripId}`, JSON.stringify(expenseData));
          } else {
            setExpenses(getStoredExpensesForTrip(selectedTripId, currentCurrencyCode));
          }
        } catch {
          setExpenses(getStoredExpensesForTrip(selectedTripId, currentCurrencyCode));
        }
      } else {
        setExpenses(getStoredExpensesForTrip(selectedTripId, currentCurrencyCode));
      }

      setIsLoading(false);
    }

    loadTripAndAuthData();
  }, [currentCurrencyCode, currentScreen, hasEditPermission, selectedTripId, selectedTripMeta?.detailPath, userEmail])

  // 📡 智慧恢復網路自動同步機制
  useEffect(() => {
    const syncOfflineData = async () => {
      if (!navigator.onLine) return;

      const localQueue = readStoredExpenses('offline_expenses', '', 'JPY');
      if (localQueue.length === 0) return;

      const syncData = localQueue.map((item) => ({
        trip_id: item.trip_id,
        title: item.title,
        amount: item.amount,
        payer: item.payer,
        currency: item.currency || 'JPY'
      }));

      try {
        const { error } = await supabase.from('expenses').insert(syncData);
        if (!error) {
          localStorage.removeItem('offline_expenses');
          alert('系統提示：您在離線時記下的帳目，已成功同步上傳至雲端！');
          
          if (selectedTripId) {
            const { data } = await supabase.from('expenses')
              .select('*')
              .eq('trip_id', selectedTripId)
              .order('created_at', { ascending: true });
            if (data) {
              setExpenses(data as ExpenseItem[]);
              localStorage.setItem(`cached_expenses_${selectedTripId}`, JSON.stringify(data));
            }
          }
        }
      } catch (err) { console.error(err); }
    };

    window.addEventListener('online', syncOfflineData);
    const timer = setTimeout(syncOfflineData, 1000);

    return () => {
      window.removeEventListener('online', syncOfflineData);
      clearTimeout(timer);
    };
  }, [selectedTripId]);

  // 新增與刪除旅費
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) { alert('操作被拒：您沒有編輯此行程的權限！'); return; }
    if (!newTitle || !newAmount || isNaN(Number(newAmount))) return

    const amountNum = Math.abs(Math.floor(Number(newAmount)))
    
    // ✨ 核心修改點：寫入資料庫與快取的幣別，完全綁定 formCurrency 狀態，不再跟隨 activeCurrency 分頁
    const newExpenseData = { 
      trip_id: selectedTripId, 
      title: newTitle, 
      amount: amountNum, 
      payer: newPayer,
      currency: formCurrency
    };
    
    const saveToOfflineSandbox = () => {
      const localQueue = readStoredExpenses('offline_expenses', '', currentCurrencyCode);

      const offlineItem = { 
        id: `local_${Date.now()}_${Math.random()}`, 
        created_at: new Date().toISOString(), 
        ...newExpenseData 
      };
      localQueue.push(offlineItem);
      localStorage.setItem('offline_expenses', JSON.stringify(localQueue));

      setExpenses(getStoredExpensesForTrip(selectedTripId, currentCurrencyCode));
      setNewTitle('');
      setNewAmount('');
      alert('已自動安全儲存在本地暫存箱，連線後會自動同步。');
    };

    if (!navigator.onLine) {
      saveToOfflineSandbox();
      return;
    }

    try {
      const { data, error } = await supabase.from('expenses').insert([newExpenseData]).select()
      if (error) throw error;
      
      if (data) {
        const currentExpenses = Array.isArray(expenses) ? expenses : [];
        const updated = [...currentExpenses, data[0] as ExpenseItem];
        setExpenses(updated);
        localStorage.setItem(`cached_expenses_${selectedTripId}`, JSON.stringify(updated));
        setNewTitle('');
        setNewAmount('');
      }
    } catch {
      saveToOfflineSandbox();
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!hasEditPermission) { alert('操作被拒：您沒有修改此行程資料的權限。'); return; }

    if (String(id).startsWith('local_')) {
      const localQueue = readStoredExpenses('offline_expenses', '', currentCurrencyCode);
      const filteredQueue = localQueue.filter((item) => item.id !== id);
      localStorage.setItem('offline_expenses', JSON.stringify(filteredQueue));
      setExpenses(getStoredExpensesForTrip(selectedTripId, currentCurrencyCode));
      return;
    }

    if (!navigator.onLine) {
      alert('目前處於離線狀態，無法刪除雲端歷史帳目。');
      return;
    }

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error;
      
      const currentExpenses = Array.isArray(expenses) ? expenses : [];
      const updated = currentExpenses.filter(item => item && item.id !== id);
      setExpenses(updated);
      localStorage.setItem(`cached_expenses_${selectedTripId}`, JSON.stringify(updated));
    } catch {
      alert('無法連接雲端資料庫，目前無法刪除雲端歷史帳目。');
    }
  }

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

  // 計算特定單一幣別總金額（若為 ALL，此處純計算，看板會有專屬防混淆顯示）
  const totalExpense = filteredExpenses.reduce((sum, item) => {
    if (!item || !item.amount) return sum;
    const val = Number(item.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  
  const averageExpense = currentMembers.length > 0 ? Math.round(totalExpense / currentMembers.length) : 0;
  
  const paitAmounts: { [key: string]: number } = {};
  currentMembers.forEach((m: string) => { paitAmounts[m] = 0; });
  
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
                setSelectedTripId(nextTrip.id);
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
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-[10px]">👁️ 唯讀模式 (非授權人員)</span>
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
                <span>{hasEditPermission ? '🌍 雲端多人同步中' : '🔒 安全唯讀模式'}</span>
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
                      <h2 className="text-3xl font-black mt-1">{activeCurrencySymbol} {totalExpense.toLocaleString()}</h2>
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/20 text-sm">
                        <div>
                          <span className="text-amber-100/80 text-xs block">{currentMembers.length} 人平攤 (每人)</span>
                          <span className="text-lg font-bold">{activeCurrencySymbol} {averageExpense.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-amber-100/80 text-xs block">記帳筆數</span>
                          <span className="text-lg font-bold">{filteredExpenses.length} 筆</span>
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
                      {currentMembers.map((member: string) => {
                        const paid = paitAmounts[member] || 0
                        const status = paid - averageExpense
                        return (
                          <div key={member} className="flex justify-between items-center p-2.5 rounded-lg bg-slate-50">
                            <div>
                              <span className="font-bold text-slate-700">{member}</span>
                              <span className="text-xs text-slate-400 block">已墊：{activeCurrencySymbol}{paid.toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                              {status > 0 ? (
                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">應收回 {activeCurrencySymbol}{status.toLocaleString()}</span>
                              ) : status < 0 ? (
                                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">應補繳 {activeCurrencySymbol}{Math.abs(status).toLocaleString()}</span>
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

                {/* 新增表單區：✨ 下拉選單改為 formCurrency，完全與最上方的 Tabs 分離 */}
                {hasEditPermission ? (
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
                    </div>
                    
                    {/* 付款人 */}
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-xs text-slate-500 font-medium">付款人：</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {currentMembers.map((m: string) => (
                          <button key={m} type="button" onClick={() => setNewPayer(m)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${newPayer === m ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{m}</button>
                        ))}
                      </div>
                      <button type="submit" className="ml-auto flex items-center gap-1 bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-lg"><Plus size={14} /> 記帳</button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 text-xs">
                    <ShieldAlert size={18} className="text-amber-600 shrink-0" />
                    <div>
                      <p className="font-bold mb-0.5">目前處於「唯讀模式」</p>
                      <p className="text-amber-700/90 leading-relaxed">請先點選左側選單完成 Google 登入。如果已登入但仍看到此提示，代表您的帳號未在此行程的共同編輯白名單內。</p>
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

                        return (
                          <div key={item.id} className="flex justify-between items-center p-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                                {/* ✨ 當全部顯示時，在項目旁邊加上精緻的小角標標明幣別 */}
                                {effectiveActiveCurrency === 'ALL' && (
                                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono font-bold">
                                    {itemCurrencyCode}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded mt-1 inline-block">{item.payer || '未知'} 墊付</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-800 text-sm">{itemSymbol} {(item.amount || 0).toLocaleString()}</span>
                              {hasEditPermission && (
                                <button type="button" onClick={() => handleDeleteExpense(item.id)} className="p-1 text-slate-300 hover:text-rose-600"><Trash2 size={16} /></button>
                              )}
                            </div>
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
