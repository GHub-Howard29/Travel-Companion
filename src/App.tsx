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

interface ExpenseItem { id: string; trip_id: string; title: string; amount: number; payer: string; }

interface AdminUser {
  email: string;
  role: 'super_admin' | 'trip_editor';
  trip_id: string | null;
}

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

  // 4. 雲端與離線記帳同步狀態
  const [checkedItems, setCheckedItems] = useState<string[]>([]) 
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  
  // 5. 權限狀態
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null)
  // 💡 直接從 localStorage 初始化，避免 React 渲染週期帶來的「初始化為 false」真空期
  const [hasEditPermission, setHasEditPermission] = useState<boolean>(() => {
    return localStorage.getItem(`auth_${selectedTripId}`) === 'true';
  });

  // 新增帳目表單狀態
  const [newTitle, setNewTitle] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPayer, setNewPayer] = useState('我')

  const members = ['我', '小明', '小華']

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
          setSelectedTripId(defaultTrip ? defaultTrip.id : sortedTrips[0].id);
        }
      })
      .catch(err => console.error(err))
  }, [])

  // 📡 獨立出來的本地/離線資料加載核心
  const loadLocalExpensesFallback = (tripId: string) => {
    const cachedData = localStorage.getItem(`cached_expenses_${tripId}`);
    let parsedData: ExpenseItem[] = [];
    if (cachedData) {
      try {
        const rawParsed = JSON.parse(cachedData);
        if (Array.isArray(rawParsed)) {
          parsedData = rawParsed.map((item: any) => ({
            id: item?.id || `cached_${Math.random()}`,
            trip_id: item?.trip_id || tripId,
            title: item?.title || '未命名消費',
            amount: Number(item?.amount) || 0,
            payer: item?.payer || '我'
          }));
        }
      } catch (e) { parsedData = []; }
    }

    let localQueue: any[] = [];
    try {
      const localDataStr = localStorage.getItem('offline_expenses');
      localQueue = localDataStr ? JSON.parse(localDataStr) : [];
      if (!Array.isArray(localQueue)) localQueue = [];
    } catch (e) { localQueue = []; }

    const currentTripOffline = localQueue
      .filter((item: any) => item && item.trip_id === tripId)
      .map((item: any) => ({
        id: item?.id || `local_${Math.random()}`,
        trip_id: item?.trip_id || tripId,
        title: item?.title || '未命名消費',
        amount: Number(item?.amount) || 0,
        payer: item?.payer || '我'
      }));

    setExpenses([...parsedData, ...currentTripOffline]);
  };

  // 主要的行程與權限載入副作用
  useEffect(() => {
    if (!selectedTripId) return;
    setIsLoading(true);
    
    async function loadTripAndAuthData() {
      const basePath = getBasePath();
      const url = `${basePath}trips/${selectedTripId}.json`.replace(/\/+/g, '/');

      // 1. 讀取靜態 JSON 行程
      try {
        const res = await fetch(url);
        if (res.ok) {
          const tripData = await res.json();
          setCurrentTrip(tripData);
          setActiveDay(1);
          if (tripData.sidebarConfig?.length > 0) {
            setCurrentScreen(tripData.sidebarConfig[0].id);
          }
        }
      } catch (err) { console.error(err); }

      // 2. 還原與驗證白名單權限
      let profile: AdminUser | null = null;
      const cachedProfile = localStorage.getItem(`admin_profile_${selectedTripId}`);
      
      if (userEmail && navigator.onLine) {
        try {
          const { data, error } = await supabase.from('admin_users').select('email, role, trip_id').eq('email', userEmail).maybeSingle();
          if (!error && data) {
            profile = data as AdminUser;
            localStorage.setItem(`admin_profile_${selectedTripId}`, JSON.stringify(data));
          }
        } catch (err) { console.warn('向雲端驗證權限失敗，將改用快取驗證。', err); }
      }

      if (!profile && cachedProfile) {
        try { profile = JSON.parse(cachedProfile); } catch (e) {}
      }

      setAdminProfile(profile);

      // 3. 💡 權限狀態校正與同步
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

      // 4. 讀取記帳資料流
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
            loadLocalExpensesFallback(selectedTripId);
          }
        } catch (err) {
          loadLocalExpensesFallback(selectedTripId);
        }
      } else {
        loadLocalExpensesFallback(selectedTripId);
      }

      setIsLoading(false);
    }

    loadTripAndAuthData();
  }, [selectedTripId, userEmail])

  // 網路恢復自動同步
  useEffect(() => {
    const handleOnline = async () => {
      let localQueue: any[] = [];
      try {
        const localDataStr = localStorage.getItem('offline_expenses');
        localQueue = localDataStr ? JSON.parse(localDataStr) : [];
        if (!Array.isArray(localQueue)) localQueue = [];
      } catch (e) { localQueue = []; }

      if (localQueue.length === 0) return;

      const syncData = localQueue.map(({ id, ...rest }: any) => rest);
      try {
        const { error } = await supabase.from('expenses').insert(syncData);
        if (!error) {
          localStorage.removeItem('offline_expenses');
          alert('系統提示：您在離線時記下的帳目，已成功同步上傳至雲端！');
          if (selectedTripId) {
            const { data } = await supabase.from('expenses').select('*').eq('trip_id', selectedTripId).order('created_at', { ascending: true });
            if (data) {
              setExpenses(data as ExpenseItem[]);
              localStorage.setItem(`cached_expenses_${selectedTripId}`, JSON.stringify(data));
            }
          }
        }
      } catch (err) { console.error(err); }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [selectedTripId]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) { alert('操作被拒：您沒有編輯此行程的權限！'); return; }
    if (!newTitle || !newAmount || isNaN(Number(newAmount))) return

    const amountNum = Math.abs(Math.floor(Number(newAmount)))
    const newExpenseData = { trip_id: selectedTripId, title: newTitle, amount: amountNum, payer: newPayer };
    
    const saveToOfflineSandbox = () => {
      let localQueue: any[] = [];
      try {
        const localDataStr = localStorage.getItem('offline_expenses');
        localQueue = localDataStr ? JSON.parse(localDataStr) : [];
        if (!Array.isArray(localQueue)) localQueue = [];
      } catch (e) { localQueue = []; }

      const offlineItem = { 
        id: `local_${Date.now()}_${Math.random()}`, 
        created_at: new Date().toISOString(), 
        ...newExpenseData 
      };
      localQueue.push(offlineItem);
      localStorage.setItem('offline_expenses', JSON.stringify(localQueue));

      loadLocalExpensesFallback(selectedTripId);
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
    } catch (error) {
      console.warn('雲端發送失敗，正在自動切換為本地離線沙盒儲存...', error);
      saveToOfflineSandbox();
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!hasEditPermission) { alert('操作被拒：您沒有修改此行程資料的權限。'); return; }

    if (String(id).startsWith('local_')) {
      let localQueue: any[] = [];
      try {
        const localDataStr = localStorage.getItem('offline_expenses');
        localQueue = localDataStr ? JSON.parse(localDataStr) : [];
        if (!Array.isArray(localQueue)) localQueue = [];
      } catch (e) { localQueue = []; }

      const filteredQueue = localQueue.filter((item: any) => item && item.id !== id);
      localStorage.setItem('offline_expenses', JSON.stringify(filteredQueue));
      loadLocalExpensesFallback(selectedTripId);
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
    } catch (error) {
      console.warn('刪除雲端資料失敗，可能為實質離線。', error);
      alert('無法連接雲端資料庫，目前無法刪除雲端歷史帳目。');
    }
  }

  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  
  const totalExpense = safeExpenses.reduce((sum, item) => {
    if (!item || !item.amount) return sum;
    const val = Number(item.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  
  const averageExpense = Math.round(totalExpense / members.length);
  const paitAmounts: { [key: string]: number } = { '我': 0, '小明': 0, '小華': 0 };
  
  safeExpenses.forEach(item => { 
    if (item && item.payer && paitAmounts[item.payer] !== undefined) {
      const val = Number(item.amount);
      paitAmounts[item.payer] += (isNaN(val) ? 0 : val);
    } 
  });

  const handleNavigate = (location: string) => { if (!location) return; window.open(`http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(location)}`, '_blank'); };
  const toggleChecklistItem = (id: string) => { checkedItems.includes(id) ? setCheckedItems(checkedItems.filter(item => item !== id)) : setCheckedItems([...checkedItems, id]) }

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
              onChange={(e) => setSelectedTripId(e.target.value)}
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
                onClick={() => { setCurrentScreen(item.id); setIsMenuOpen(false); }}
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

      <main className="max-w-md mx-auto p-4 pb-24">
        {isLoading ? (
          <div className="text-center py-24 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto mb-4"></div>
            正在建立雲端安全連線...
          </div>
        ) : (
          <>
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

            {currentTrip?.sidebarConfig.find(s => s.id === currentScreen)?.type === 'expense' && (
              <div className="space-y-5">
                <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl text-white shadow-md">
                  <span className="text-xs text-amber-100 font-bold tracking-wider uppercase">雲端同步數據 (日幣計)</span>
                  <h2 className="text-3xl font-black mt-1">￥ {totalExpense.toLocaleString()}</h2>
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/20 text-sm">
                    <div>
                      <span className="text-amber-100/80 text-xs block">三人平攤 (每人)</span>
                      <span className="text-lg font-bold">￥ {averageExpense.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-amber-100/80 text-xs block">雲端總記帳筆數</span>
                      <span className="text-lg font-bold">{safeExpenses.length} 筆</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">分攤結算狀態</h3>
                  <div className="space-y-3">
                    {members.map(member => {
                      const paid = paitAmounts[member] || 0
                      const status = paid - averageExpense
                      return (
                        <div key={member} className="flex justify-between items-center p-2.5 rounded-lg bg-slate-50">
                          <div>
                            <span className="font-bold text-slate-700">{member}</span>
                            <span className="text-xs text-slate-400 block">已墊：￥{paid.toLocaleString()}</span>
                          </div>
                          <div className="text-right">
                            {status > 0 ? (
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">應收回 ￥{status.toLocaleString()}</span>
                            ) : status < 0 ? (
                              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">應補繳 ￥{Math.abs(status).toLocaleString()}</span>
                            ) : (
                              <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-full">已平帳</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {hasEditPermission ? (
                  <form onSubmit={handleAddExpense} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-800">新增一筆旅費</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="消費項目" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" required />
                      <input type="number" placeholder="金額 (日幣)" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" required />
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-slate-500 font-medium">付款人：</span>
                      <div className="flex gap-1.5 flex-1">
                        {members.map(m => (
                          <button key={m} type="button" onClick={() => setNewPayer(m)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${newPayer === m ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{m}</button>
                        ))}
                      </div>
                      <button type="submit" className="flex items-center gap-1 bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-lg"><Plus size={14} /> 記帳</button>
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

                <div className="space-y-2">
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
                    {safeExpenses.length > 0 ? (
                      safeExpenses.map((item) => {
                        if (!item || !item.title) return null;
                        return (
                          <div key={item.id} className="flex justify-between items-center p-4">
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                              <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded mt-1 inline-block">{item.payer || '未知'} 墊付</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-800 text-sm">￥ {(item.amount || 0).toLocaleString()}</span>
                              {hasEditPermission && (
                                <button type="button" onClick={() => handleDeleteExpense(item.id)} className="p-1 text-slate-300 hover:text-rose-600"><Trash2 size={16} /></button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-slate-400 text-xs">目前雲端尚無記帳資料。</div>
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