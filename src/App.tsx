// React 核心
import { useCallback, useEffect, useMemo, useState } from "react";

// Supabase 雲端資料庫
import { createClient } from "@supabase/supabase-js";

// 旅程型別
import type {
  ChecklistItem,
  OtherInfoItem,
  SidebarItemConfig,
  TripEditorInput,
  TripMeta,
} from "./types";

// 抽出的畫面元件
import AppSidebar from "./components/layout/AppSidebar";
import AppHeader from "./components/layout/AppHeader";
import ExpenseScreen from "./components/expense/ExpenseScreen";
import { ItineraryPage } from "./components/ItineraryPage";
import { ChecklistPage } from "./components/ChecklistPage";
import { PrivateChecklistPage } from "./components/PrivateChecklistPage";
import { OtherInfoPage } from "./components/OtherInfoPage";
import { TextInfoPage } from "./components/TextInfoPage";
import { ExchangeRatePage } from "./components/ExchangeRatePage";
import { clearExchangePurchases } from "./storage/exchangeRateStorage";
import { TripEditorModal } from "./components/TripEditorModal";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { VersionInfoModal } from "./components/VersionInfoModal";
import { InstallAppPrompt } from "./components/InstallAppPrompt";
import { LoginSafetyModal } from "./components/LoginSafetyModal";
import useExpenseBook from "./hooks/useExpenseBook";
import { useAppUpdate } from "./hooks/useAppUpdate";
import useTripWorkspace from "./hooks/useTripWorkspace";
import { AppContext } from "./app/context/AppContext";
import { getTripDetail } from "./services/tripRepository";
import { syncCloudOtherInfoItems } from "./services/otherInfoCloudService";
import {
  getSpecialInfoFolderId,
  getTravelToolHeaderBgClassName,
  isAuthRequiredTravelTool,
  isSpecialInfoSidebarItem,
  resolveTravelToolType,
} from "./utils/travelToolRegistry";

// --- 初始化 Supabase 雲端客戶端 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const isIosStandalonePwa = () => {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return isIosDevice && navigatorWithStandalone.standalone === true;
};

export default function App() {
  const {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseDate,
    releaseNotes,
    forceUpdate,
    update,
    dismiss,
  } = useAppUpdate();
  const {
    userEmail,
    userId,
    setUserId,
    setUserEmail,
    tripOptions,
    selectedTripId,
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
    currentUserParticipantName,
    isSignedIn,
    isAssignedTrip,
    role,
    permission,
    createTrip,
    updateTrip,
    deleteTrip,
    refreshTripOptionsAndSelect,
    saveCurrentTripDetail,
    currentTripEditorEmails,
    superAdminEmails,
  } = useTripWorkspace({ supabase });
  const [tripEditorMode, setTripEditorMode] = useState<"create" | "edit">("create");
  const [isTripEditorOpen, setIsTripEditorOpen] = useState(false);
  const [isVersionInfoOpen, setIsVersionInfoOpen] = useState(false);
  const [isLoginSafetyOpen, setIsLoginSafetyOpen] = useState(false);
  const [checklistCopySources, setChecklistCopySources] = useState<
    Array<{ tripId: string; title: string; items: ChecklistItem[] }>
  >([]);

  const {
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
    removedAttachmentExpenseIds,
    isSyncingAttachments,
    pendingDeleteId,
    setActiveCurrency,
    formCurrency,
    setFormCurrency,
    safeExpenses,
    availableCurrencies,
    effectiveActiveCurrency,
    filteredExpenses,
    activeExpenseDate,
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
  } = useExpenseBook({
    supabase,
    userEmail,
    selectedTripId,
    expenseBookTripId,
    isUsingSharedExpenseBook,
    currentCurrencyCode,
    currentCurrencySymbol,
    expenseMembers,
    lockedPayerName: currentUserParticipantName,
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
    setIsLoginSafetyOpen(false);
    const currentRedirectUrl = window.location.origin + getBasePath();
    const shouldUseIosPwaOAuthFallback = isIosStandalonePwa();
    const queryParams = shouldUseIosPwaOAuthFallback
      ? undefined
      : { prompt: "select_account" };
    const authPopup = shouldUseIosPwaOAuthFallback
      ? window.open("about:blank", "_blank")
      : null;

    if (authPopup) {
      authPopup.opener = null;
      authPopup.document.title = "Google 登入";
      authPopup.document.body.innerHTML =
        '<p style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;line-height:1.6;color:#334155;">正在開啟 Google 登入...</p>';
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: currentRedirectUrl,
        queryParams,
        skipBrowserRedirect: shouldUseIosPwaOAuthFallback,
      },
    });

    if (error) {
      authPopup?.close();
      alert("無法開啟 Google 登入，請稍後再試。");
      return;
    }

    if (shouldUseIosPwaOAuthFallback) {
      if (data.url) {
        if (authPopup) {
          authPopup.location.href = data.url;
        } else {
          window.location.href = data.url;
        }
      } else {
        authPopup?.close();
        alert("無法取得 Google 登入連結，請稍後再試。");
      }
    }
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

  useEffect(() => {
    if (currentUserParticipantName) {
      setNewPayer(currentUserParticipantName);
    }
  }, [currentUserParticipantName, setNewPayer]);

  const handleScreenSelect = (item: SidebarItemConfig) => {
    if (isAuthRequiredTravelTool(item.type) && !userEmail) {
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

  const getCurrentScreenType = () =>
    resolveTravelToolType(
      currentScreen,
      currentTrip?.sidebarConfig.find((s) => s.id === currentScreen),
    );
  const openCreateTrip = () => {
    setTripEditorMode("create");
    setIsTripEditorOpen(true);
  };
  const openEditTrip = () => {
    setTripEditorMode("edit");
    setIsTripEditorOpen(true);
  };
  const handleTripEditorSubmit = async (input: TripEditorInput) => {
    setIsLoading(true);
    const canManageEditors = adminProfile?.role === "super_admin";
    const nextInput = canManageEditors
      ? input
      : { ...input, editorEmails: currentTripEditorEmails };

    if (tripEditorMode === "create") {
      await createTrip(nextInput, canManageEditors);
    } else {
      await updateTrip(nextInput, canManageEditors);
    }
    setIsTripEditorOpen(false);
    setIsMenuOpen(false);
  };
  const handleTripDelete = async () => {
    if (!selectedTripId) return;

    setIsLoading(true);
    await deleteTrip(selectedTripId);
    clearExchangePurchases(selectedTripId);
    setIsTripEditorOpen(false);
    setIsMenuOpen(false);
  };
  const handleSaveChecklistData = async (items: ChecklistItem[]) => {
    if (!currentTrip) return;

    await saveCurrentTripDetail({
      ...currentTrip,
      content: {
        ...currentTrip.content,
        checklistData: items,
      },
    });
  };
  const handleSaveOtherInfoItems = async (items: OtherInfoItem[]) => {
    if (!currentTrip) return;

    const currentItemsById = new Map(
      (currentTrip.content.otherInfoItems ?? []).map((item) => [item.id, item]),
    );
    const nextItemIdSet = new Set(items.map((item) => item.id));
    const removedItemIds = items
      .filter(
        (item) =>
          item.isDeleted && !currentItemsById.get(item.id)?.isDeleted,
      )
      .map((item) => item.id)
      .concat(
        (currentTrip.content.otherInfoItems ?? [])
          .map((item) => item.id)
          .filter((itemId) => !nextItemIdSet.has(itemId)),
      );
    const changedItems = items.filter((item) => {
      const currentItem = currentItemsById.get(item.id);

      return (
        !currentItem ||
        currentItem.folderId !== item.folderId ||
        currentItem.title !== item.title ||
        currentItem.content !== item.content ||
        currentItem.order !== item.order ||
        currentItem.isDeleted !== item.isDeleted ||
        currentItem.updatedAt !== item.updatedAt ||
        JSON.stringify(currentItem.allowedRoles ?? []) !==
          JSON.stringify(item.allowedRoles ?? [])
      );
    });

    await syncCloudOtherInfoItems(
      supabase,
      selectedTripId,
      changedItems,
      removedItemIds,
    );

    await saveCurrentTripDetail({
      ...currentTrip,
      content: {
        ...currentTrip.content,
        otherInfoItems: items,
      },
    });
  };
  const currentScreenType = getCurrentScreenType();
  const currentSidebarItem = currentTrip?.sidebarConfig.find(
    (item) => item.id === currentScreen,
  );
  const isSpecialInfoPage = isSpecialInfoSidebarItem(currentSidebarItem);
  const specialInfoFolderId = getSpecialInfoFolderId(
    currentSidebarItem,
    currentTrip?.content.mode,
  );

  useEffect(() => {
    let isActive = true;

    const loadChecklistCopySources = async () => {
      const basePath = getBasePath();
      const sources = await Promise.all(
        tripOptions.map(async (trip) => {
          const detail = await getTripDetail(supabase, basePath, trip.id, trip);

          return {
            tripId: trip.id,
            title: `${trip.title} (${trip.departureDate})`,
            items: detail?.content.checklistData ?? [],
          };
        }),
      );

      if (isActive) {
        setChecklistCopySources(sources);
      }
    };

    void loadChecklistCopySources();

    return () => {
      isActive = false;
    };
  }, [tripOptions]);

  useEffect(() => {
    if (userEmail || !isAuthRequiredTravelTool(currentScreenType)) {
      return;
    }

    setCurrentScreen("itinerary");
  }, [currentScreenType, setCurrentScreen, userEmail]);

  return (
    <AppContext.Provider value={appContextValue}>
    <UpdatePrompt
      isOpen={updateAvailable}
      currentVersion={currentVersion}
      latestVersion={latestVersion}
      releaseDate={releaseDate}
      releaseNotes={releaseNotes}
      forceUpdate={forceUpdate}
      onUpdate={update}
      onDismiss={dismiss}
    />
    <InstallAppPrompt />
    <LoginSafetyModal
      isOpen={isLoginSafetyOpen}
      isIosStandalonePwa={isIosStandalonePwa()}
      onClose={() => setIsLoginSafetyOpen(false)}
      onConfirm={handleGoogleLogin}
    />
    <VersionInfoModal
      isOpen={isVersionInfoOpen}
      currentVersion={currentVersion}
      releaseDate={releaseDate}
      releaseNotes={releaseNotes}
      forceUpdate={forceUpdate}
      onClose={() => setIsVersionInfoOpen(false)}
    />
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
        canCreateTrip={adminProfile?.role === "super_admin"}
        canEditCurrentTrip={hasEditPermission}
        onCreateTrip={openCreateTrip}
        onEditTrip={openEditTrip}
        onTripSelect={(tripId) => {
          setIsLoading(true);
          void refreshTripOptionsAndSelect(tripId).then(
            ({ didFindPreferredTrip, selectedTrip }) => {
              if (selectedTrip) {
                applyTripDefaults(selectedTrip);
              }

              if (!didFindPreferredTrip) {
                alert("此旅程已被其他設備刪除，已切換到目前可用的旅程。");
              }

              setIsMenuOpen(false);
            },
          ).catch((error) => {
            console.warn(error);
            setIsLoading(false);
            alert("同步旅程資料失敗，請稍後再試。");
          });
        }}
        onLogout={handleLogout}
        onGoogleLogin={() => {
          setIsLoginSafetyOpen(true);
          return Promise.resolve();
        }}
        onScreenSelect={handleScreenSelect}
        appVersion={currentVersion}
        onOpenVersionInfo={() => setIsVersionInfoOpen(true)}
      />

      {isTripEditorOpen && (
        <TripEditorModal
          key={`${tripEditorMode}-${selectedTripId || "new"}`}
          mode={tripEditorMode}
          trip={tripEditorMode === "edit" ? selectedTripMeta ?? null : null}
          tripDetail={tripEditorMode === "edit" ? currentTrip : null}
          editorEmails={tripEditorMode === "edit" ? currentTripEditorEmails : []}
          superAdminEmails={superAdminEmails}
          canManageEditors={adminProfile?.role === "super_admin"}
          userEmail={userEmail}
          isOpen={isTripEditorOpen}
          onClose={() => setIsTripEditorOpen(false)}
          onSubmit={handleTripEditorSubmit}
          onDelete={tripEditorMode === "edit" ? handleTripDelete : undefined}
        />
      )}

      <AppHeader
        currentTrip={currentTrip}
        isUsingSharedExpenseBook={isUsingSharedExpenseBook}
        userEmail={userEmail}
        onOpenMenu={() => setIsMenuOpen(true)}
        headerBgClassName={getTravelToolHeaderBgClassName(currentScreenType)}
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
            {currentScreenType === "itinerary" && currentTrip && (
              <ItineraryPage
                key={`${selectedTripId}-${userEmail ?? "guest"}`}
                trip={currentTrip}
                activeDay={activeDay}
                hasEditPermission={hasEditPermission}
                onActiveDayChange={setActiveDay}
                onSaveTripDetail={saveCurrentTripDetail}
              />
            )}

            {/* 2. 行李清單檢查模組 */}
            {currentScreenType === "checklist" && (
              <ChecklistPage
                tripId={selectedTripId}
                checklistData={checklistData}
                supabase={supabase}
                canViewSharedChecklist={permission.canViewSharedChecklist}
                canToggleSharedChecklist={permission.canToggleSharedChecklist}
                canManageSharedChecklist={hasEditPermission}
                copySources={checklistCopySources}
                onSaveChecklistData={handleSaveChecklistData}
              />
            )}

            {currentScreenType === "privateChecklist" && (
              <PrivateChecklistPage
                tripId={selectedTripId}
                userEmail={userEmail}
                supabase={supabase}
                canViewPrivateChecklist={permission.canViewPrivateChecklist}
                canEditPrivateChecklist={permission.canEditPrivateChecklist}
                canTogglePrivateChecklist={permission.canTogglePrivateChecklist}
                canSyncPrivateChecklist={permission.canSyncPrivateChecklist}
                tripOptions={tripOptions}
              />
            )}

            {/* 3. 純文字/備忘錄模組 */}
            {currentScreenType === "text" && (
              <TextInfoPage content={currentTrip.content.custom_tab_1} />
            )}

            {/* 4. 其他資訊模組 */}
            {currentScreenType === "otherInfo" && (
              <OtherInfoPage
                key={`${selectedTripId}-${currentScreen}`}
                tripId={selectedTripId}
                canEdit={permission.canEditReference}
                currentRole={role}
                items={currentTrip.content.otherInfoItems}
                onSaveItems={handleSaveOtherInfoItems}
                pageTitle={currentSidebarItem?.title}
                isSpecialInfoPage={isSpecialInfoPage}
                specialFolderId={specialInfoFolderId}
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
                activeExpenseDate={activeExpenseDate}
                setActiveExpenseDate={setActiveExpenseDate}
                availableExpenseDates={availableExpenseDates}
                dateFilteredExpenses={dateFilteredExpenses}
                availableCurrencies={availableCurrencies}
                effectiveActiveCurrency={effectiveActiveCurrency}
                setActiveCurrency={setActiveCurrency}
                currentCurrencyCode={currentCurrencyCode}
                currentCurrencySymbol={currentCurrencySymbol}
                expenseMembers={expenseMembers}
                lockedPayerName={currentUserParticipantName}
                totalExpense={totalExpense}
                averageExpense={averageExpense}
                memberShareAmounts={memberShareAmounts}
                paitAmounts={paitAmounts}
                activeCurrencySymbol={activeCurrencySymbol}
                attachmentSyncLabel={attachmentSyncLabel}
                pendingAttachmentCount={pendingAttachmentCount}
                hasUnsyncedLocalExpenseAttachments={hasUnsyncedLocalExpenseAttachments}
                isSyncingAttachments={isSyncingAttachments}
                newTitle={newTitle}
                newAmount={newAmount}
                newExpenseDate={newExpenseDate}
                newPayer={newPayer}
                formCurrency={formCurrency}
                setNewTitle={setNewTitle}
                setNewAmount={setNewAmount}
                setNewExpenseDate={setNewExpenseDate}
                setNewPayer={setNewPayer}
                setFormCurrency={setFormCurrency}
                newAttachmentFile={newAttachmentFile}
                setNewAttachmentFile={setNewAttachmentFile}
                editAttachmentFile={editAttachmentFile}
                setEditAttachmentFile={setEditAttachmentFile}
                removedAttachmentExpenseIds={removedAttachmentExpenseIds}
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
                onRemoveEditAttachment={markEditAttachmentForRemoval}
                onRestoreEditAttachment={restoreEditAttachment}
              />
            )}

            {currentScreenType === "exchangeRate" && selectedTripId && (
              <ExchangeRatePage
                key={selectedTripId}
                tripId={selectedTripId}
                defaultForeignCurrency={currentCurrencyCode}
                supabase={supabase}
                canSyncCloudHistory={permission.canSyncCloudExchangeHistory}
              />
            )}
          </>
        )}
      </main>
    </div>
    </AppContext.Provider>
  );
}
