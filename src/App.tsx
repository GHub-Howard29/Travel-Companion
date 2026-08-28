// React 核心
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { TextInfoPage } from "./components/TextInfoPage";
import { clearExchangePurchases } from "./storage/exchangeRateStorage";
import { getDefaultHomeScreen, setDefaultHomeScreen } from "./storage/defaultHomeStorage";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { VersionInfoModal } from "./components/VersionInfoModal";
import { InstallAppPrompt } from "./components/InstallAppPrompt";
import { LoginSafetyModal } from "./components/LoginSafetyModal";
import useExpenseBook from "./hooks/useExpenseBook";
import { useAppUpdate } from "./hooks/useAppUpdate";
import useTripWorkspace from "./hooks/useTripWorkspace";
import { AppContext } from "./app/context/AppContext";
import { ROLE } from "./permissions/roles";
import { getCloudTripRecords } from "./services/tripCloudService";
import {
  DuplicateTripIdError,
  getTripDetail,
  TripCreationOfflineError,
} from "./services/tripRepository";
import { syncCloudOtherInfoItems } from "./services/otherInfoCloudService";
import { syncPrivateChecklistWithCloud } from "./services/privateChecklistCloudService";
import { syncCloudSharedChecklistSeedItems } from "./services/sharedChecklistCloudService";
import { upsertCloudTripRecord } from "./services/tripCloudService";
import { readStoredTripRecords } from "./storage/tripStorage";
import { writeStoredOtherInfoItems } from "./storage/otherInfoStorage";
import {
  clearOtherInfoSyncState,
  markOtherInfoSyncFailed,
  markOtherInfoSyncPending,
  readOtherInfoSyncState,
  type OtherInfoSyncStatus,
} from "./storage/otherInfoSyncStorage";
import {
  getSpecialInfoFolderId,
  getTravelToolHeaderBgClassName,
  isAuthRequiredTravelTool,
  isSpecialInfoSidebarItem,
  resolveTravelToolType,
} from "./utils/travelToolRegistry";
import { mergeSharedChecklistItems } from "./utils/checklistMerge";
import { isHistoricalTrip } from "./utils/tripHelpers";
import {
  getTrustedHttpUrl,
  openPendingWindow,
} from "./utils/browserSecurity";

const ExpenseScreen = lazy(() => import("./components/expense/ExpenseScreen"));
const ItineraryPage = lazy(() =>
  import("./components/ItineraryPage").then((module) => ({ default: module.ItineraryPage })),
);
const ChecklistPage = lazy(() =>
  import("./components/ChecklistPage").then((module) => ({ default: module.ChecklistPage })),
);
const PrivateChecklistPage = lazy(() =>
  import("./components/PrivateChecklistPage").then((module) => ({ default: module.PrivateChecklistPage })),
);
const OtherInfoPage = lazy(() =>
  import("./components/OtherInfoPage").then((module) => ({ default: module.OtherInfoPage })),
);
const ExchangeRatePage = lazy(() =>
  import("./components/ExchangeRatePage").then((module) => ({ default: module.ExchangeRatePage })),
);
const TripEditorModal = lazy(() =>
  import("./components/TripEditorModal").then((module) => ({ default: module.TripEditorModal })),
);

const screenLoadingFallback = (
  <div className="py-24 text-center text-slate-400" role="status">
    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-slate-600" />
    載入功能中...
  </div>
);

// --- 初始化 Supabase 雲端客戶端 ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl?.trim() && supabaseAnonKey?.trim()
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const isIosStandalonePwa = () => {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return isIosDevice && navigatorWithStandalone.standalone === true;
};

const finishAppLaunch = () => {
  const appBackgroundColor = "#fff3e8";
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", appBackgroundColor);
  document.documentElement.style.backgroundColor = appBackgroundColor;
  document.body.style.backgroundColor = appBackgroundColor;
  document.getElementById("root")?.style.setProperty(
    "background-color",
    appBackgroundColor,
  );
  document.getElementById("app-launch-screen")?.remove();
};

const AppLaunchReady = () => {
  useEffect(() => {
    finishAppLaunch();
  }, []);

  return null;
};

export default function App() {
  useEffect(() => {
    if (!supabase) {
      finishAppLaunch();
    }
  }, []);

  if (!supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-800">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">APP 設定尚未完成</h1>
          <p className="mt-3 leading-7 text-slate-600">
            目前缺少 Supabase 連線設定，請確認建置環境已設定
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">VITE_SUPABASE_URL</code>
            與
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              VITE_SUPABASE_ANON_KEY
            </code>
            後重新建置。
          </p>
        </section>
      </main>
    );
  }

  return <ConfiguredApp supabaseClient={supabase} />;
}

function ConfiguredApp({
  supabaseClient: supabase,
}: {
  supabaseClient: NonNullable<typeof supabase>;
}) {
  const {
    updateAvailable,
    promptMode,
    currentVersion,
    latestVersion,
    releaseDate,
    releaseNotes,
    currentReleaseDate,
    currentReleaseNotes,
    isMandatoryForCurrentClient,
    updateError,
    isChecking,
    update,
    dismiss,
  } = useAppUpdate();
  const {
    userEmail,
    userId,
    isSessionReady,
    isOnline,
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
    participantEmailMap,
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
    saveCurrentTripDetailLocally,
    reloadCurrentTrip,
    currentTripEditorEmails,
    superAdminEmails,
    defaultParticipantProfiles,
    refreshDefaultParticipantProfiles,
  } = useTripWorkspace({ supabase });
  const [tripEditorMode, setTripEditorMode] = useState<"create" | "edit">("create");
  const [isTripEditorOpen, setIsTripEditorOpen] = useState(false);
  const [isVersionInfoOpen, setIsVersionInfoOpen] = useState(false);
  const [isLoginSafetyOpen, setIsLoginSafetyOpen] = useState(false);
  const [otherInfoSyncStatus, setOtherInfoSyncStatus] = useState<
    OtherInfoSyncStatus | "syncing" | null
  >(null);
  const otherInfoSyncingTripsRef = useRef(new Set<string>());
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
    exportsAllSharedExpenses,
    canManageExpense,
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
    userId,
    selectedTripId,
    expenseBookTripId,
    isUsingSharedExpenseBook,
    canExportAllSharedExpenses: role === ROLE.SUPER_ADMIN,
    currentCurrencyCode,
    currentCurrencySymbol,
    expenseMembers,
    participantEmailMap,
    defaultPayerName: currentUserParticipantName,
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
      ? openPendingWindow()
      : null;

    if (authPopup) {
      authPopup.document.title = "Google 登入";
      const loadingMessage = authPopup.document.createElement("p");
      loadingMessage.textContent = "正在開啟 Google 登入...";
      loadingMessage.style.fontFamily =
        "-apple-system, BlinkMacSystemFont, sans-serif";
      loadingMessage.style.padding = "24px";
      loadingMessage.style.lineHeight = "1.6";
      loadingMessage.style.color = "#334155";
      authPopup.document.body.replaceChildren(loadingMessage);
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
        const trustedOAuthUrl = getTrustedHttpUrl(data.url, {
          allowedOrigins: [new URL(supabaseUrl).origin],
        });
        if (!trustedOAuthUrl) {
          authPopup?.close();
          alert("登入連結來源驗證失敗，請稍後再試。");
          return;
        }

        if (authPopup) {
          authPopup.location.href = trustedOAuthUrl;
        } else {
          window.location.href = trustedOAuthUrl;
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
  const isHistoricalOfflineReadOnly = Boolean(
    selectedTripMeta && !isOnline && isHistoricalTrip(selectedTripMeta),
  );
  const openCreateTrip = async () => {
    if (isHistoricalOfflineReadOnly) return;
    if (!isOnline || !navigator.onLine) {
      alert("新增旅程需要網路連線");
      return;
    }
    try {
      await refreshDefaultParticipantProfiles();
      setTripEditorMode("create");
      setIsTripEditorOpen(true);
    } catch (error) {
      console.error("Failed to load administrator profiles:", error);
      alert("無法載入管理者名稱設定，請稍後再試。");
    }
  };
  const openEditTrip = () => {
    if (isHistoricalOfflineReadOnly) return;
    setTripEditorMode("edit");
    setIsTripEditorOpen(true);
  };
  const handleTripEditorSubmit = async (input: TripEditorInput) => {
    if (isHistoricalOfflineReadOnly) return;
    setIsLoading(true);
    const canManageEditors = adminProfile?.role === "super_admin";
    const nextInput = canManageEditors
      ? input
      : {
          ...input,
          participants: selectedTripMeta?.participants ?? input.participants,
          participantEmailMap:
            selectedTripMeta?.participantEmailMap ??
            currentTrip?.content.participantEmailMap ??
            input.participantEmailMap,
          editorEmails: currentTripEditorEmails,
        };

    try {
      if (tripEditorMode === "create") {
        await createTrip(nextInput, canManageEditors);
      } else {
        await updateTrip(nextInput, canManageEditors);
      }
      setIsTripEditorOpen(false);
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Trip save failed:", error);
      if (error instanceof DuplicateTripIdError) {
        alert(
          "相同旅程型態與初始出發日期的旅程已存在，請調整初始出發日期或旅程型態後再試。",
        );
      } else if (error instanceof TripCreationOfflineError) {
        alert("新增旅程需要網路連線");
      } else {
        alert("無法儲存旅程，請確認網路連線後再試一次。");
      }
      setIsLoading(false);
    }
  };
  const handleTripDelete = async () => {
    if (!selectedTripId || isHistoricalOfflineReadOnly) return;

    setIsLoading(true);
    try {
      await deleteTrip(selectedTripId);
      clearExchangePurchases(selectedTripId);
      setIsTripEditorOpen(false);
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Trip deletion failed:", error);
      alert("無法完成行程刪除，雲端資料未變更。請確認網路後再試一次。");
      setIsLoading(false);
    }
  };
  const handleSaveChecklistData = async (
    items: ChecklistItem[],
    baseItems: ChecklistItem[] = checklistData,
  ): Promise<ChecklistItem[]> => {
    if (!currentTrip || isHistoricalOfflineReadOnly) return items;

    const cloudTrip = navigator.onLine
      ? (await getCloudTripRecords(supabase)).find(
          (record) => record.meta.id === selectedTripId,
        )
      : null;
    const mergedItems = cloudTrip
      ? mergeSharedChecklistItems(
          items,
          cloudTrip.detail.content.checklistData ?? [],
          baseItems,
        )
      : items;

    const didSaveTrip = await saveCurrentTripDetail({
      ...currentTrip,
      content: {
        ...currentTrip.content,
        checklistData: mergedItems,
      },
    });
    if (!didSaveTrip) {
      throw new Error("共同清單旅程資料尚未成功寫入雲端");
    }

    const syncedChecklist = await syncCloudSharedChecklistSeedItems(
      supabase,
      selectedTripId,
      mergedItems,
      [],
      false,
    );
    if (!syncedChecklist) {
      throw new Error("共同清單項目尚未成功寫入雲端");
    }
    return mergedItems;
  };
  const syncPendingOtherInfo = useCallback(async () => {
    const tripId = selectedTripId;
    if (
      !tripId ||
      !navigator.onLine ||
      !userId ||
      !permission.canEditReference ||
      otherInfoSyncingTripsRef.current.has(tripId)
    ) {
      return;
    }

    otherInfoSyncingTripsRef.current.add(tripId);
    try {
      while (navigator.onLine) {
        const pending = readOtherInfoSyncState(tripId);
        if (!pending) {
          setOtherInfoSyncStatus(null);
          break;
        }

        const record = readStoredTripRecords().find(
          (item) => item.meta.id === tripId,
        );
        if (!record) break;

        setOtherInfoSyncStatus("syncing");
        const items = record.detail.content.otherInfoItems ?? [];
        const didSyncItems = await syncCloudOtherInfoItems(
          supabase,
          tripId,
          items.filter((item) => !item.isDeleted),
          items.filter((item) => item.isDeleted).map((item) => item.id),
        );
        const syncedTrip = didSyncItems
          ? await upsertCloudTripRecord(supabase, record)
          : null;

        if (!didSyncItems || !syncedTrip) {
          markOtherInfoSyncFailed(
            tripId,
            pending.revision,
            "Other Info 雲端同步未完成",
          );
          setOtherInfoSyncStatus("failed");
          break;
        }

        if (clearOtherInfoSyncState(tripId, pending.revision)) {
          setOtherInfoSyncStatus(null);
          break;
        }
      }
    } catch (error) {
      const pending = readOtherInfoSyncState(tripId);
      if (pending) {
        markOtherInfoSyncFailed(tripId, pending.revision, error);
        setOtherInfoSyncStatus("failed");
      }
    } finally {
      otherInfoSyncingTripsRef.current.delete(tripId);
    }
  }, [permission.canEditReference, selectedTripId, supabase, userId]);

  const retryOtherInfoSync = useCallback(() => {
    setOtherInfoSyncStatus("syncing");
    void syncPendingOtherInfo();
  }, [syncPendingOtherInfo]);

  useEffect(() => {
    if (!selectedTripId || !isOnline) return;

    let refreshTimer: number | null = null;
    const refreshCurrentTrip = () => {
      if (readOtherInfoSyncState(selectedTripId)) return;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void reloadCurrentTrip();
      }, 400);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCurrentTrip();
    };

    const channel = supabase
      .channel(`travel-companion-other-info-${selectedTripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "other_info_items",
          filter: `trip_id=eq.${selectedTripId}`,
        },
        refreshCurrentTrip,
      )
      .subscribe();

    window.addEventListener("focus", refreshCurrentTrip);
    window.addEventListener("online", refreshCurrentTrip);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshCurrentTrip);
      window.removeEventListener("online", refreshCurrentTrip);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [isOnline, reloadCurrentTrip, selectedTripId, supabase]);

  const handleSaveOtherInfoItems = async (items: OtherInfoItem[]) => {
    if (!currentTrip || isHistoricalOfflineReadOnly) return;

    const nextTrip = {
      ...currentTrip,
      content: {
        ...currentTrip.content,
        otherInfoItems: items,
      },
    };
    writeStoredOtherInfoItems(selectedTripId, items);
    saveCurrentTripDetailLocally(nextTrip);
    markOtherInfoSyncPending(selectedTripId);
    setOtherInfoSyncStatus("pending");
    void syncPendingOtherInfo();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOtherInfoSyncStatus(
        selectedTripId
          ? readOtherInfoSyncState(selectedTripId)?.status ?? null
          : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedTripId]);

  useEffect(() => {
    const retry = () => void syncPendingOtherInfo();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", handleVisibility);
    retry();
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncPendingOtherInfo]);

  useEffect(() => {
    if (!navigator.onLine) return;
    const preload = () => {
      void Promise.allSettled([
        import("./components/expense/ExpenseScreen"),
        import("./components/ItineraryPage"),
        import("./components/ChecklistPage"),
        import("./components/PrivateChecklistPage"),
        import("./components/OtherInfoPage"),
        import("./components/ExchangeRatePage"),
      ]);
    };
    const timer = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isOnline || !userEmail) {
      return;
    }

    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const preloadTripIds = tripOptions
      .filter((trip) => trip.departureDate >= today)
      .filter(
        (trip) =>
          role === ROLE.SUPER_ADMIN ||
          (role === ROLE.TRIP_EDITOR && trip.id === adminProfile?.trip_id),
      )
      .map((trip) => trip.id);

    if (preloadTripIds.length === 0) return;

    const normalizedEmail = userEmail.trim().toLowerCase();
    void Promise.allSettled(
      preloadTripIds.map((tripId) =>
        syncPrivateChecklistWithCloud(supabase, tripId, normalizedEmail),
      ),
    ).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(
            `Private checklist preload failed: ${preloadTripIds[index]}`,
            result.reason,
          );
        }
      });
    });
  }, [adminProfile?.trip_id, isOnline, role, supabase, tripOptions, userEmail]);
  const currentScreenType = getCurrentScreenType();
  const currentSidebarItem = currentTrip?.sidebarConfig.find(
    (item) => item.id === currentScreen,
  );
  const isSpecialInfoPage = isSpecialInfoSidebarItem(currentSidebarItem);
  const specialInfoFolderId = getSpecialInfoFolderId(
    currentSidebarItem,
    currentTrip?.content.mode,
  );

  const defaultHomeScreen =
    userEmail && selectedTripId
      ? getDefaultHomeScreen(selectedTripId, userEmail)
      : null;

  const appliedDefaultHomeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userEmail || !selectedTripId || !currentTrip || !defaultHomeScreen) return;
    const defaultHomeKey = `${selectedTripId}:${userEmail}:${defaultHomeScreen}`;
    if (appliedDefaultHomeKeyRef.current === defaultHomeKey) return;
    const validScreenIds = [
      ...currentTrip.sidebarConfig.map((item) => item.id),
      "privateChecklist",
    ];
    if (validScreenIds.includes(defaultHomeScreen)) {
      appliedDefaultHomeKeyRef.current = defaultHomeKey;
      setCurrentScreen(defaultHomeScreen);
    }
  }, [currentTrip, defaultHomeScreen, selectedTripId, setCurrentScreen, userEmail]);

  useEffect(() => {
    let isActive = true;

    const loadChecklistCopySources = async () => {
      const basePath = getBasePath();
      const storedTripsById = new Map(
        readStoredTripRecords().map((record) => [record.meta.id, record.detail]),
      );
      const sources = await Promise.all(
        tripOptions.map(async (trip) => {
          const detail = isOnline
            ? await getTripDetail(supabase, basePath, trip.id, trip)
            : storedTripsById.get(trip.id) ??
              (trip.id === selectedTripId ? currentTrip : null);

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
  }, [currentTrip, isOnline, selectedTripId, supabase, tripOptions]);

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
      mode={promptMode}
      currentVersion={currentVersion}
      latestVersion={latestVersion}
      releaseDate={releaseDate}
      releaseNotes={releaseNotes}
      isMandatoryUpdate={isMandatoryForCurrentClient}
      updateError={updateError}
      isChecking={isChecking}
      onUpdate={update}
      onDismiss={dismiss}
    />
    <InstallAppPrompt
      isAuthenticated={Boolean(userEmail)}
      isAppReady={isSessionReady && !isLoading}
    />
    <LoginSafetyModal
      isOpen={isLoginSafetyOpen}
      isIosStandalonePwa={isIosStandalonePwa()}
      onClose={() => setIsLoginSafetyOpen(false)}
      onConfirm={handleGoogleLogin}
    />
    <VersionInfoModal
      isOpen={isVersionInfoOpen}
      currentVersion={currentVersion}
      releaseDate={currentReleaseDate}
      releaseNotes={currentReleaseNotes}
      isMandatoryUpdate={isMandatoryForCurrentClient}
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
        userParticipantName={currentUserParticipantName}
        isOnline={isOnline}
        isSessionReady={isSessionReady}
        hasEditPermission={hasEditPermission}
        adminProfile={adminProfile}
        currentScreen={currentScreen}
        canCreateTrip={adminProfile?.role === "super_admin" && !isHistoricalOfflineReadOnly}
        canEditCurrentTrip={hasEditPermission && !isHistoricalOfflineReadOnly}
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
        defaultHomeScreen={defaultHomeScreen}
        onSetDefaultHome={(screenId) => {
          if (!userEmail || !selectedTripId) return;
          setDefaultHomeScreen(selectedTripId, userEmail, screenId);
          setCurrentScreen(screenId);
        }}
        appVersion={currentVersion}
        onOpenVersionInfo={() => setIsVersionInfoOpen(true)}
      />

      {isTripEditorOpen && !isHistoricalOfflineReadOnly && (
        <Suspense fallback={null}>
        <TripEditorModal
          key={`${tripEditorMode}-${selectedTripId || "new"}`}
          mode={tripEditorMode}
          trip={tripEditorMode === "edit" ? selectedTripMeta ?? null : null}
          tripDetail={tripEditorMode === "edit" ? currentTrip : null}
          editorEmails={tripEditorMode === "edit" ? currentTripEditorEmails : []}
          superAdminEmails={superAdminEmails}
          defaultParticipantProfiles={defaultParticipantProfiles}
          canManageEditors={adminProfile?.role === "super_admin"}
          isOpen={isTripEditorOpen}
          onClose={() => setIsTripEditorOpen(false)}
          onSubmit={handleTripEditorSubmit}
          onDelete={
            tripEditorMode === "edit" && adminProfile?.role === ROLE.SUPER_ADMIN
              ? handleTripDelete
              : undefined
          }
        />
        </Suspense>
      )}

      <AppHeader
        currentTrip={currentTrip}
        isUsingSharedExpenseBook={isUsingSharedExpenseBook}
        userEmail={userEmail}
        isOnline={isOnline}
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
          <Suspense fallback={screenLoadingFallback}>
          <>
            {isSessionReady && <AppLaunchReady />}
            {/* 1. 行程規劃模組 */}
            {currentScreenType === "itinerary" && currentTrip && (
              <ItineraryPage
                key={`${selectedTripId}-${userEmail ?? "guest"}-${isOnline ? "online" : "offline"}`}
                supabase={supabase}
                trip={currentTrip}
                activeDay={activeDay}
                hasEditPermission={hasEditPermission}
                isOnline={isOnline}
                onActiveDayChange={setActiveDay}
                onSaveTripDetail={async (trip) => {
                  await saveCurrentTripDetail(trip);
                }}
              />
            )}

            {/* 2. 行李清單檢查模組 */}
            {currentScreenType === "checklist" && (
              <ChecklistPage
                key={`${selectedTripId}:${userEmail ?? "guest"}`}
                tripId={selectedTripId}
                userEmail={userEmail}
                checklistData={checklistData}
                supabase={supabase}
                canViewSharedChecklist={permission.canViewSharedChecklist}
                canToggleSharedChecklist={
                  (permission.canToggleSharedChecklist || Boolean(userEmail)) &&
                  !isHistoricalOfflineReadOnly
                }
                canSyncSharedChecklist={hasEditPermission}
                isOnline={isOnline}
                isHistoricalOfflineReadOnly={isHistoricalOfflineReadOnly}
                canManageSharedChecklist={
                  (hasEditPermission || Boolean(userEmail)) && !isHistoricalOfflineReadOnly
                }
                copySources={checklistCopySources}
                onSaveChecklistData={handleSaveChecklistData}
                onReloadChecklistData={reloadCurrentTrip}
              />
            )}

            {currentScreenType === "privateChecklist" && (
              <PrivateChecklistPage
                key={`${selectedTripId}:${userEmail ?? "guest"}`}
                tripId={selectedTripId}
                userEmail={userEmail}
                supabase={supabase}
                canViewPrivateChecklist={permission.canViewPrivateChecklist}
                canEditPrivateChecklist={
                  permission.canEditPrivateChecklist && !isHistoricalOfflineReadOnly
                }
                canTogglePrivateChecklist={
                  permission.canTogglePrivateChecklist && !isHistoricalOfflineReadOnly
                }
                canSyncPrivateChecklist={permission.canSyncPrivateChecklist}
                isOnline={isOnline}
                isHistoricalOfflineReadOnly={isHistoricalOfflineReadOnly}
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
                canEdit={permission.canEditReference && !isHistoricalOfflineReadOnly}
                currentRole={role}
                items={currentTrip.content.otherInfoItems}
                onSaveItems={handleSaveOtherInfoItems}
                pageTitle={currentSidebarItem?.title}
                isSpecialInfoPage={isSpecialInfoPage}
                specialFolderId={specialInfoFolderId}
                syncStatus={otherInfoSyncStatus}
                onRetrySync={retryOtherInfoSync}
              />
            )}

            {/* 5. 智慧多幣別記帳模組 */}
            {currentScreenType === "expense" && (
              <ExpenseScreen
                canUseExpense={canUseExpense && !isHistoricalOfflineReadOnly}
                isHistoricalOfflineReadOnly={isHistoricalOfflineReadOnly}
                isUsingSharedExpenseBook={isUsingSharedExpenseBook}
                exportsAllSharedExpenses={exportsAllSharedExpenses}
                userEmail={userEmail}
                canManageExpense={(item) =>
                  !isHistoricalOfflineReadOnly && canManageExpense(item)
                }
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
                participantEmailMap={participantEmailMap}
                defaultPayerName={currentUserParticipantName}
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
                handleAddExpense={(event) =>
                  isHistoricalOfflineReadOnly ? Promise.resolve() : handleAddExpense(event)
                }
                handleSaveEditExpense={(id) =>
                  isHistoricalOfflineReadOnly
                    ? Promise.resolve()
                    : handleSaveEditExpense(id)
                }
                handleDeleteExpense={(id) => {
                  if (!isHistoricalOfflineReadOnly) handleDeleteExpense(id);
                }}
                handleOpenAttachment={handleOpenAttachment}
                handleSyncAttachments={handleSyncAttachments}
                handleExportXlsx={handleExportXlsx}
                handleAttachmentSelection={handleAttachmentSelection}
                onStartEditExpense={(item) => {
                  if (!isHistoricalOfflineReadOnly) startEditExpenseHandler(item);
                }}
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
                isReadOnly={isHistoricalOfflineReadOnly}
              />
            )}
          </>
          </Suspense>
        )}
      </main>
    </div>
    </AppContext.Provider>
  );
}
