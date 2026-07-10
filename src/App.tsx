// React 核心
import { useCallback, useEffect, useMemo } from "react";

// Icon 圖示
import { MapPin, ExternalLink } from "lucide-react";

// Supabase 雲端資料庫
import { createClient } from "@supabase/supabase-js";

// 旅程型別
import type { TripMeta, TripDetail } from "./types";

// 導航工具
import { handleNavigate } from "./utils/navigationUtils";

// 抽出的畫面元件
import AppSidebar from "./components/layout/AppSidebar";
import AppHeader from "./components/layout/AppHeader";
import ExpenseScreen from "./components/expense/ExpenseScreen";
import { ChecklistPage } from "./components/ChecklistPage";
import { PrivateChecklistPage } from "./components/PrivateChecklistPage";
import { OtherInfoPage } from "./components/OtherInfoPage";
import useExpenseBook from "./hooks/useExpenseBook";
import useTripWorkspace from "./hooks/useTripWorkspace";
import { AppContext } from "./app/context/AppContext";

// --- 初始化 Supabase 雲端客戶端 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function App() {
  const {
    userEmail,
    userId,
    setUserId,
    setUserEmail,
    tripOptions,
    selectedTripId,
    setSelectedTripId,
    currentTrip,
    isLoading,
    setIsLoading,
    currentScreen,
    setCurrentScreen,
    activeDay,
    setActiveDay,
    isMenuOpen,
    setIsMenuOpen,
    adminProfile,
    setAdminProfile,
    hasEditPermission,
    setHasEditPermission,
    expenseBookTripId,
    selectedTripMeta,
    currentCurrencyCode,
    currentCurrencySymbol,
    canUseExpense,
    isUsingSharedExpenseBook,
    expenseMembers,
    isSignedIn,
    isAssignedTrip,
    role,
    permission,
  } = useTripWorkspace({ supabase });

  const {
    newTitle,
    setNewTitle,
    newAmount,
    setNewAmount,
    newPayer,
    setNewPayer,
    editingExpenseId,
    editDraft,
    setEditDraft,
    newAttachmentFile,
    setNewAttachmentFile,
    editAttachmentFile,
    setEditAttachmentFile,
    isSyncingAttachments,
    pendingDeleteId,
    setActiveCurrency,
    formCurrency,
    setFormCurrency,
    safeExpenses,
    availableCurrencies,
    effectiveActiveCurrency,
    filteredExpenses,
    pendingAttachmentCount,
    hasUnsyncedLocalExpenseAttachments,
    attachmentSyncLabel,
    totalExpense,
    averageExpense,
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
  } = useExpenseBook({
    supabase,
    userEmail,
    selectedTripId,
    expenseBookTripId,
    isUsingSharedExpenseBook,
    currentCurrencyCode,
    currentCurrencySymbol,
    expenseMembers,
    tripTitle: currentTrip?.title || selectedTripMeta?.title || selectedTripId || "travel",
  });

  const applyTripDefaults = useCallback((trip: TripMeta) => {
    if (trip.participants.length > 0) {
      setNewPayer(trip.participants[0]);
    }
    setActiveCurrency("ALL");
    setFormCurrency(trip.currencyConfig.code);
  }, [setActiveCurrency, setFormCurrency, setNewPayer]);

  const getBasePath = () => {
    const path = window.location.pathname;
    if (path.includes("/Travel-Companion")) return "/Travel-Companion/";
    return "/";
  };

  // 登入 / 登出
  const handleGoogleLogin = async () => {
    const currentRedirectUrl = window.location.origin + getBasePath();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: currentRedirectUrl,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("auth_") || key.startsWith("admin_profile_")) {
        localStorage.removeItem(key);
      }
    });
    setUserId(null);
    setUserEmail(null);
    setAdminProfile(null);
    setHasEditPermission(false);
    setCurrentScreen("itinerary");
    setIsMenuOpen(false);
  };

  useEffect(() => {
    if (!selectedTripMeta) return;
    applyTripDefaults(selectedTripMeta);
  }, [applyTripDefaults, selectedTripMeta]);

  const handleScreenSelect = (item: TripDetail["sidebarConfig"][number]) => {
    if ((item.type === "expense" || item.type === "privateChecklist") && !userEmail) {
      alert("此功能須先登入");
      setIsMenuOpen(false);
      return;
    }
    setCurrentScreen(item.id);
    if (item.type === "expense") {
      setActiveCurrency("ALL");
    }
    setIsMenuOpen(false);
  };

  const currentDayEvents =
    currentTrip?.content?.daysData?.[String(activeDay)] || [];
  const checklistData = currentTrip?.content?.checklistData || [];
  const appContextValue = useMemo(
    () => ({
      userEmail,
      userId,
      selectedTripId,
      isSignedIn,
      isAssignedTrip,
      role,
      permission,
    }),
    [
      isAssignedTrip,
      isSignedIn,
      permission,
      role,
      selectedTripId,
      userEmail,
      userId,
    ],
  );

  const getCurrentScreenType = () => {
    if (currentScreen === "privateChecklist") return "privateChecklist";

    return currentTrip?.sidebarConfig.find((s) => s.id === currentScreen)?.type;
  };
  const currentScreenType = getCurrentScreenType();

  useEffect(() => {
    if (
      userEmail ||
      (currentScreenType !== "expense" && currentScreenType !== "privateChecklist")
    ) {
      return;
    }

    setCurrentScreen("itinerary");
  }, [currentScreenType, setCurrentScreen, userEmail]);

  const getHeaderBgColor = () => {
    switch (currentScreenType) {
      case "checklist":
      case "privateChecklist":
        return "bg-rose-700";
      case "expense":
        return "bg-amber-600";
      case "text":
        return "bg-stone-700";
      case "otherInfo":
        return "bg-stone-700";
      default:
        return "bg-emerald-700";
    }
  };

  return (
    <AppContext.Provider value={appContextValue}>
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased overflow-x-hidden">
      <AppSidebar
        isMenuOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        selectedTripId={selectedTripId}
        tripOptions={tripOptions}
        currentTrip={currentTrip}
        userEmail={userEmail}
        hasEditPermission={hasEditPermission}
        adminProfile={adminProfile}
        currentScreen={currentScreen}
        onTripSelect={(tripId) => {
          const nextTrip = tripOptions.find((trip) => trip.id === tripId);
          if (!nextTrip) return;
          setIsLoading(true);
          applyTripDefaults(nextTrip);
          setCurrentScreen("itinerary");
          setActiveDay(1);
          setSelectedTripId(nextTrip.id);
          setIsMenuOpen(false);
        }}
        onLogout={handleLogout}
        onGoogleLogin={handleGoogleLogin}
        onScreenSelect={handleScreenSelect}
      />

      <AppHeader
        currentTrip={currentTrip}
        isUsingSharedExpenseBook={isUsingSharedExpenseBook}
        userEmail={userEmail}
        onOpenMenu={() => setIsMenuOpen(true)}
        headerBgClassName={getHeaderBgColor()}
      />

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
            {currentScreenType === "itinerary" && (
              <>
                <div className="grid grid-cols-5 gap-1.5 mb-6">
                  {currentTrip.content.days.map((day) => (
                    <button
                      key={day}
                      onClick={() => setActiveDay(day)}
                      className={`py-2 px-1 rounded-lg font-semibold text-xs transition-all shadow-sm truncate ${activeDay === day ? "bg-slate-900 text-white font-bold" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
                    >
                      D{day}
                    </button>
                  ))}
                </div>
                <div className="mb-4 border-b border-slate-200 pb-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-extrabold text-amber-700 tracking-tight">
                      {String(activeDay).padStart(2, "0")}
                    </span>
                    <div>
                      <h2>行程探索 Day {activeDay}</h2>
                    </div>
                  </div>
                </div>

                {currentDayEvents.length > 0 ? (
                  <div className="space-y-4">
                    {currentDayEvents.map((event, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-bold text-slate-500">
                            {event.time}
                          </span>
                          <span
                            className={`px-2 py-0.5 border rounded text-xs font-semibold ${event.typeColor}`}
                          >
                            {event.type}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1.5">
                          {event.title}
                        </h3>
                        {event.desc && (
                          <p className="text-sm text-slate-600 leading-relaxed mb-4">
                            {event.desc}
                          </p>
                        )}
                        {event.location && (
                          <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button
                              onClick={() => handleNavigate(event.location!)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                            >
                              <MapPin size={14} className="text-emerald-600" />{" "}
                              地圖導航 <ExternalLink size={10} />
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
            {currentScreenType === "checklist" && (
              <ChecklistPage
                tripId={selectedTripId}
                checklistData={checklistData}
                canViewSharedChecklist={permission.canViewSharedChecklist}
                canToggleSharedChecklist={permission.canToggleSharedChecklist}
              />
            )}

            {currentScreenType === "privateChecklist" && (
              <PrivateChecklistPage
                tripId={selectedTripId}
                userEmail={userEmail}
                canViewPrivateChecklist={permission.canViewPrivateChecklist}
                canEditPrivateChecklist={permission.canEditPrivateChecklist}
                canTogglePrivateChecklist={permission.canTogglePrivateChecklist}
                canSyncPrivateChecklist={permission.canSyncPrivateChecklist}
              />
            )}

            {/* 3. 純文字/備忘錄模組 */}
            {currentScreenType === "text" && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5">
                  <h3 className="text-xl font-bold text-slate-800 mb-1">
                    {currentTrip.content.custom_tab_1?.subtitle || "自訂資訊區"}
                  </h3>
                  <div className="w-full h-px bg-slate-100 my-3" />
                  <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono">
                    {currentTrip.content.custom_tab_1?.mainText ||
                      "目前尚無詳細欄位內容。"}
                  </p>
                </div>
              </div>
            )}

            {/* 4. 其他資訊模組 */}
            {currentScreenType === "otherInfo" && (
              <OtherInfoPage
                key={selectedTripId}
                tripId={selectedTripId}
                canEdit={hasEditPermission}
              />
            )}

            {/* 5. 智慧多幣別記帳模組 */}
            {currentScreenType === "expense" && (
              <ExpenseScreen
                canUseExpense={canUseExpense}
                isUsingSharedExpenseBook={isUsingSharedExpenseBook}
                userEmail={userEmail}
                safeExpenses={safeExpenses}
                filteredExpenses={filteredExpenses}
                availableCurrencies={availableCurrencies}
                effectiveActiveCurrency={effectiveActiveCurrency}
                setActiveCurrency={setActiveCurrency}
                currentCurrencyCode={currentCurrencyCode}
                currentCurrencySymbol={currentCurrencySymbol}
                expenseMembers={expenseMembers}
                totalExpense={totalExpense}
                averageExpense={averageExpense}
                paitAmounts={paitAmounts}
                activeCurrencySymbol={activeCurrencySymbol}
                attachmentSyncLabel={attachmentSyncLabel}
                pendingAttachmentCount={pendingAttachmentCount}
                hasUnsyncedLocalExpenseAttachments={hasUnsyncedLocalExpenseAttachments}
                isSyncingAttachments={isSyncingAttachments}
                newTitle={newTitle}
                newAmount={newAmount}
                newPayer={newPayer}
                formCurrency={formCurrency}
                setNewTitle={setNewTitle}
                setNewAmount={setNewAmount}
                setNewPayer={setNewPayer}
                setFormCurrency={setFormCurrency}
                newAttachmentFile={newAttachmentFile}
                setNewAttachmentFile={setNewAttachmentFile}
                editAttachmentFile={editAttachmentFile}
                setEditAttachmentFile={setEditAttachmentFile}
                editingExpenseId={editingExpenseId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                pendingDeleteId={pendingDeleteId}
                handleAddExpense={handleAddExpense}
                handleSaveEditExpense={handleSaveEditExpense}
                handleDeleteExpense={handleDeleteExpense}
                handleOpenAttachment={handleOpenAttachment}
                handleSyncAttachments={handleSyncAttachments}
                handleExportXlsx={handleExportXlsx}
                handleAttachmentSelection={handleAttachmentSelection}
                onStartEditExpense={startEditExpenseHandler}
                onCancelEditExpense={cancelEditExpenseHandler}
                onCancelPendingDelete={cancelPendingDelete}
              />
            )}
          </>
        )}
      </main>
    </div>
    </AppContext.Provider>
  );
}
