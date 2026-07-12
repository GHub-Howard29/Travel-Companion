// React 核心
import { useCallback, useEffect, useMemo, useState } from "react";

// Icon 圖示
import { ExternalLink, MapPin, Settings2, X } from "lucide-react";

// Supabase 雲端資料庫
import { createClient } from "@supabase/supabase-js";

// 旅程型別
import type {
  ChecklistItem,
  ItineraryItem,
  OtherInfoItem,
  SidebarItemConfig,
  TripEditorInput,
  TripMeta,
} from "./types";

// 導航工具
import { handleNavigate } from "./utils/navigationUtils";

// 抽出的畫面元件
import AppSidebar from "./components/layout/AppSidebar";
import AppHeader from "./components/layout/AppHeader";
import ExpenseScreen from "./components/expense/ExpenseScreen";
import { ChecklistPage } from "./components/ChecklistPage";
import { PrivateChecklistPage } from "./components/PrivateChecklistPage";
import { OtherInfoPage } from "./components/OtherInfoPage";
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

// --- 初始化 Supabase 雲端客戶端 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ITINERARY_TYPE_OPTIONS = [
  { type: "交通", typeColor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { type: "住宿", typeColor: "bg-amber-50 text-amber-700 border-amber-200" },
  { type: "景點", typeColor: "bg-purple-50 text-purple-700 border-purple-200" },
  { type: "餐飲", typeColor: "bg-blue-50 text-blue-700 border-blue-200" },
  { type: "自駕", typeColor: "bg-orange-50 text-orange-700 border-orange-200" },
  { type: "其他", typeColor: "bg-slate-50 text-slate-700 border-slate-200" },
];

const createEmptyItineraryDraft = (): ItineraryItem => ({
  time: "",
  title: "",
  type: "景點",
  typeColor: "bg-purple-50 text-purple-700 border-purple-200",
  desc: "",
  location: "",
});

const LEGACY_SPECIAL_INFO_SCREEN_IDS = new Set([
  "trip_special_info",
  "leader_info",
  "custom_info",
]);
const GUIDED_SPECIAL_INFO_FOLDER_ID = "special-info-guided";
const SELF_GUIDED_SPECIAL_INFO_FOLDER_ID = "special-info-self-guided";

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
    hasServiceWorkerUpdate,
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
  const [isItineraryManageMode, setIsItineraryManageMode] = useState(false);
  const [isItineraryFormOpen, setIsItineraryFormOpen] = useState(false);
  const [editingItineraryIndex, setEditingItineraryIndex] = useState<number | null>(null);
  const [itineraryDraft, setItineraryDraft] = useState<ItineraryItem>(
    createEmptyItineraryDraft,
  );

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

  const closeItineraryManageMode = () => {
    setIsItineraryManageMode(false);
    setIsItineraryFormOpen(false);
    setEditingItineraryIndex(null);
    setItineraryDraft(createEmptyItineraryDraft());
  };

  // 登入 / 登出
  const handleGoogleLogin = async () => {
    setIsLoginSafetyOpen(false);
    const currentRedirectUrl = window.location.origin + getBasePath();
    const queryParams = isIosStandalonePwa()
      ? undefined
      : { prompt: "select_account" };

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: currentRedirectUrl,
        queryParams,
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
    closeItineraryManageMode();
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
    if ((item.type === "expense" || item.type === "privateChecklist") && !userEmail) {
      alert("此功能須先登入");
      setIsMenuOpen(false);
      return;
    }
    setCurrentScreen(item.id);
    closeItineraryManageMode();
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

  const isSpecialInfoSidebarItem = (
    item: SidebarItemConfig | undefined,
  ): boolean => {
    if (!item) return false;

    return (
      LEGACY_SPECIAL_INFO_SCREEN_IDS.has(item.id) ||
      (item.type === "text" &&
        (item.title.includes("領隊") ||
          item.title.includes("導遊") ||
          item.title.includes("自駕") ||
          item.title.includes("租車")))
    );
  };

  const getCurrentScreenType = () => {
    if (currentScreen === "privateChecklist") return "privateChecklist";

    const item = currentTrip?.sidebarConfig.find((s) => s.id === currentScreen);

    return isSpecialInfoSidebarItem(item) ? "otherInfo" : item?.type;
  };
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
    const removedItemIds = (currentTrip.content.otherInfoItems ?? [])
      .map((item) => item.id)
      .filter((itemId) => !nextItemIdSet.has(itemId));
    const changedItems = items.filter((item) => {
      const currentItem = currentItemsById.get(item.id);

      return (
        !currentItem ||
        currentItem.folderId !== item.folderId ||
        currentItem.title !== item.title ||
        currentItem.content !== item.content ||
        currentItem.order !== item.order ||
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
  const resetItineraryForm = () => {
    setIsItineraryFormOpen(false);
    setEditingItineraryIndex(null);
    setItineraryDraft(createEmptyItineraryDraft());
  };
  const startCreateItineraryItem = () => {
    setEditingItineraryIndex(null);
    setItineraryDraft(createEmptyItineraryDraft());
    setIsItineraryFormOpen(true);
  };
  const toggleItineraryManageMode = () => {
    if (isItineraryManageMode) {
      closeItineraryManageMode();
      return;
    }
    setIsItineraryManageMode(true);
  };
  const startEditItineraryItem = (event: ItineraryItem, index: number) => {
    setEditingItineraryIndex(index);
    setItineraryDraft(event);
    setIsItineraryFormOpen(true);
  };
  const updateItineraryDraft = (patch: Partial<ItineraryItem>) => {
    setItineraryDraft((currentDraft) => ({
      ...currentDraft,
      ...patch,
    }));
  };
  const handleItineraryTypeChange = (type: string) => {
    const selectedType =
      ITINERARY_TYPE_OPTIONS.find((option) => option.type === type) ??
      ITINERARY_TYPE_OPTIONS[ITINERARY_TYPE_OPTIONS.length - 1];

    updateItineraryDraft({
      type: selectedType.type,
      typeColor: selectedType.typeColor,
    });
  };
  const saveItineraryItem = async () => {
    if (!currentTrip || !itineraryDraft.title.trim()) return;

    const dayKey = String(activeDay);
    const currentEvents = currentTrip.content.daysData[dayKey] ?? [];
    const nextEvent: ItineraryItem = {
      ...itineraryDraft,
      time: itineraryDraft.time.trim(),
      title: itineraryDraft.title.trim(),
      desc: itineraryDraft.desc.trim(),
      location: itineraryDraft.location.trim(),
    };
    const nextEvents =
      editingItineraryIndex === null
        ? [...currentEvents, nextEvent]
        : currentEvents.map((event, index) =>
            index === editingItineraryIndex ? nextEvent : event,
          );

    await saveCurrentTripDetail({
      ...currentTrip,
      content: {
        ...currentTrip.content,
        daysData: {
          ...currentTrip.content.daysData,
          [dayKey]: nextEvents,
        },
      },
    });
    resetItineraryForm();
  };
  const deleteItineraryItem = async (index: number) => {
    if (!currentTrip) return;
    const dayKey = String(activeDay);
    const currentEvents = currentTrip.content.daysData[dayKey] ?? [];
    const targetEvent = currentEvents[index];
    if (!targetEvent) return;
    if (!confirm(`確定刪除「${targetEvent.title}」？`)) return;

    await saveCurrentTripDetail({
      ...currentTrip,
      content: {
        ...currentTrip.content,
        daysData: {
          ...currentTrip.content.daysData,
          [dayKey]: currentEvents.filter((_, eventIndex) => eventIndex !== index),
        },
      },
    });
    resetItineraryForm();
  };
  const currentScreenType = getCurrentScreenType();
  const currentSidebarItem = currentTrip?.sidebarConfig.find(
    (item) => item.id === currentScreen,
  );
  const isSpecialInfoPage = isSpecialInfoSidebarItem(currentSidebarItem);
  const isSelfGuidedSpecialInfo =
    currentTrip?.content.mode === "selfGuided" ||
    currentSidebarItem?.title.includes("自駕") === true ||
    currentSidebarItem?.title.includes("租車") === true;
  const specialInfoFolderId =
    isSelfGuidedSpecialInfo
      ? SELF_GUIDED_SPECIAL_INFO_FOLDER_ID
      : GUIDED_SPECIAL_INFO_FOLDER_ID;

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
    <UpdatePrompt
      isOpen={updateAvailable}
      hasServiceWorkerUpdate={hasServiceWorkerUpdate}
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
              closeItineraryManageMode();
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
                      onClick={() => {
                        if (activeDay !== day) {
                          closeItineraryManageMode();
                        }
                        setActiveDay(day);
                      }}
                      className={`py-2 px-1 rounded-lg font-semibold text-xs transition-all shadow-sm truncate ${activeDay === day ? "bg-slate-900 text-white font-bold" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
                    >
                      D{day}
                    </button>
                  ))}
                </div>
                <div className="mb-4 border-b border-slate-200 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-extrabold text-amber-700 tracking-tight">
                        {String(activeDay).padStart(2, "0")}
                      </span>
                      <div>
                        <h2>行程探索 Day {activeDay}</h2>
                      </div>
                    </div>
                    {hasEditPermission && (
                      <button
                        type="button"
                        onClick={toggleItineraryManageMode}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                          isItineraryManageMode
                            ? "bg-slate-900 text-white hover:bg-slate-800"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {isItineraryManageMode ? <X size={14} /> : <Settings2 size={14} />}
                        {isItineraryManageMode ? "退出" : "管理"}
                      </button>
                    )}
                  </div>
                </div>

                {hasEditPermission && isItineraryManageMode && (
                  <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">
                        Day {activeDay} 行程管理
                      </h3>
                      <button
                        type="button"
                        onClick={isItineraryFormOpen ? resetItineraryForm : startCreateItineraryItem}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        {isItineraryFormOpen ? "取消" : "新增活動"}
                      </button>
                    </div>

                    {isItineraryFormOpen && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <input
                            value={itineraryDraft.time}
                            onChange={(event) =>
                              updateItineraryDraft({ time: event.target.value })
                            }
                            placeholder="09:00"
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <select
                            value={itineraryDraft.type}
                            onChange={(event) => handleItineraryTypeChange(event.target.value)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {ITINERARY_TYPE_OPTIONS.map((option) => (
                              <option key={option.type} value={option.type}>
                                {option.type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          value={itineraryDraft.title}
                          onChange={(event) =>
                            updateItineraryDraft({ title: event.target.value })
                          }
                          placeholder="活動標題"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <textarea
                          value={itineraryDraft.desc}
                          onChange={(event) =>
                            updateItineraryDraft({ desc: event.target.value })
                          }
                          rows={3}
                          placeholder="說明"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          value={itineraryDraft.location}
                          onChange={(event) =>
                            updateItineraryDraft({ location: event.target.value })
                          }
                          placeholder="地圖地點"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => void saveItineraryItem()}
                          disabled={!itineraryDraft.title.trim()}
                          className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                        >
                          {editingItineraryIndex === null ? "新增行程" : "儲存行程"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

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
                        {hasEditPermission && isItineraryManageMode && (
                          <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => startEditItineraryItem(event, idx)}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                            >
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteItineraryItem(idx)}
                              className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                            >
                              刪除
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
                availableCurrencies={availableCurrencies}
                effectiveActiveCurrency={effectiveActiveCurrency}
                setActiveCurrency={setActiveCurrency}
                currentCurrencyCode={currentCurrencyCode}
                currentCurrencySymbol={currentCurrencySymbol}
                expenseMembers={expenseMembers}
                lockedPayerName={currentUserParticipantName}
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
          </>
        )}
      </main>
    </div>
    </AppContext.Provider>
  );
}
