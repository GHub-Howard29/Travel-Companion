import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminProfile,
  AdminUser,
  TripDetail,
  TripEditorInput,
  TripMeta,
} from "../types";
import {
  findDefaultTrip,
  getDefaultActiveDay,
  isHistoricalTrip,
} from "../utils/tripHelpers";
import { getParticipantAliasByEmail } from "../utils/participantUtils";
import { toPersonalBookTripId } from "../storage/expenseStorage";
import { createPermission } from "../permissions/permission";
import { mapRole } from "../permissions/roleMapper";
import {
  createTripRecord,
  createTripRecordWithCloudSync,
  createTripRecordFromDetail,
  createTripRecordFromExisting,
  deleteTripRecordWithCloudSync,
  DuplicateTripIdError,
  getAdminProfiles,
  getTripDetail,
  getTripEditorEmails,
  getTripMetas,
  getSuperAdminEmails,
  HistoricalTripLockedError,
  saveTripRecord,
  saveTripRecordWithCloudSync,
  syncTripEditorEmails,
  updateTripRecord,
} from "../services/tripRepository";
import { ROLE, type Role } from "../permissions/roles";
import {
  readStoredTripRecords,
  readTripCacheState,
  removeRestrictedOtherInfoFromStoredTrip,
  replaceStoredTripRecords,
  writeTripCacheState,
} from "../storage/tripStorage";
import { removeRestrictedStoredOtherInfoItems } from "../storage/otherInfoStorage";
import {
  getCloudTripRecordsStrict,
  getTripDeletionTombstones,
} from "../services/tripCloudService";
import { decideTripReconciliation } from "../services/tripReconciliation";
import { clearSharedTripDataAfterAccessLoss } from "../storage/sharedTripDataStorage";
import { getUnusedItineraryCoverPaths } from "../utils/itineraryCoverPhoto";
import { removeItineraryCoverPaths } from "../services/itineraryCoverPhotoService";

interface UseTripWorkspaceOptions {
  supabase: SupabaseClient;
}

export default function useTripWorkspace({ supabase }: UseTripWorkspaceOptions) {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [tripOptions, setTripOptions] = useState<TripMeta[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [currentTrip, setCurrentTrip] = useState<TripDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentScreen, setCurrentScreen] = useState<string>("itinerary");
  const [activeDay, setActiveDay] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [hasAnyManagementRole, setHasAnyManagementRole] = useState(false);
  const [hasEditPermission, setHasEditPermission] = useState<boolean>(false);
  const [expenseBookTripId, setExpenseBookTripId] = useState<string>("");
  const [currentTripEditorEmails, setCurrentTripEditorEmails] = useState<string[]>([]);
  const [superAdminEmails, setSuperAdminEmails] = useState<string[]>([]);
  const [defaultParticipantProfiles, setDefaultParticipantProfiles] = useState<
    AdminProfile[]
  >([]);
  // 防止重連時較早開始的讀取，在較新的儲存後才回寫舊快照。
  const tripLoadRevisionRef = useRef(0);
  const initialCloudRecordsRef = useRef<Awaited<ReturnType<typeof getCloudTripRecordsStrict>> | null>(null);
  const reconciliationPromiseRef = useRef<Promise<boolean> | null>(null);
  const selectedTripIdRef = useRef(selectedTripId);
  const userEmailRef = useRef(userEmail);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
    userEmailRef.current = userEmail;
  }, [selectedTripId, userEmail]);

  const selectedTripMeta = tripOptions.find((trip) => trip.id === selectedTripId);
  const currentMembers = useMemo(
    () => selectedTripMeta?.participants ?? ["我", "小明", "小華"],
    [selectedTripMeta?.participants],
  );
  const currentCurrencyCode = selectedTripMeta?.currencyConfig.code || "TWD";
  const currentCurrencySymbol = selectedTripMeta?.currencyConfig.symbol || "NT$";
  const canUseExpense = Boolean(userEmail);
  const isUsingSharedExpenseBook = canUseExpense && hasEditPermission;
  const expenseMembers =
    isUsingSharedExpenseBook || !userEmail ? currentMembers : [userEmail];
  const participantEmailMap =
    selectedTripMeta?.participantEmailMap ??
    currentTrip?.content.participantEmailMap ??
    {};
  const currentUserParticipantName = (() => {
    const participantName = getParticipantAliasByEmail(
      userEmail,
      participantEmailMap,
    );

    return participantName && currentMembers.includes(participantName)
      ? participantName
      : null;
  })();
  const isSignedIn = Boolean(userEmail);
  const isAssignedTrip =
    adminProfile?.role === "trip_editor" && adminProfile.trip_id === selectedTripId;
  const role = useMemo(
    () =>
      mapRole({
        isSignedIn,
        adminRole: adminProfile?.role ?? null,
        isAssignedTrip,
      }),
    [adminProfile?.role, isAssignedTrip, isSignedIn],
  );
  const permission = useMemo(
    () =>
      createPermission({
        role,
        isSignedIn,
        isAssignedTrip,
      }),
    [isAssignedTrip, isSignedIn, role],
  );
  const canWriteSelectedTripNow = useCallback(
    () =>
      Boolean(
        adminProfile?.role === ROLE.SUPER_ADMIN ||
          (hasEditPermission &&
            role === ROLE.TRIP_EDITOR &&
            selectedTripMeta &&
            !isHistoricalTrip(selectedTripMeta)),
      ),
    [adminProfile?.role, hasEditPermission, role, selectedTripMeta],
  );

  const getBasePath = useCallback(() => {
    const path = window.location.pathname;
    if (path.includes("/Travel-Companion")) return "/Travel-Companion/";
    return "/";
  }, []);

  const refreshDefaultParticipantProfiles = useCallback(async () => {
    const profiles = await getAdminProfiles(supabase);
    setDefaultParticipantProfiles(profiles);
    return profiles;
  }, [supabase]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
      setUserEmail(session?.user?.email || null);
      setIsSessionReady(true);
    }).catch((error) => {
      console.warn("Failed to restore Supabase session", error);
      setIsSessionReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
      setUserEmail(session?.user?.email || null);
      setIsSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const reconcileTripWorkspace = useCallback(async (): Promise<boolean> => {
    if (!isSessionReady || !navigator.onLine) return false;
    if (reconciliationPromiseRef.current) return reconciliationPromiseRef.current;

    const reconciliation = (async () => {
      const [cloudRecords, tombstones] = await Promise.all([
        getCloudTripRecordsStrict(supabase),
        getTripDeletionTombstones(supabase),
      ]);
      const decision = decideTripReconciliation(
        readStoredTripRecords(),
        cloudRecords,
        tombstones,
        readTripCacheState(),
      );

      replaceStoredTripRecords(decision.storedRecords);
      writeTripCacheState(decision.nextState);
      for (const tripId of decision.cleanupTripIds) {
        await clearSharedTripDataAfterAccessLoss(
          tripId,
          userEmailRef.current ?? "",
          true,
        );
      }
      writeTripCacheState({
        ...decision.nextState,
        pendingCleanupTripIds: [],
      });

      const tombstoneIds = new Set(tombstones.map((tombstone) => tombstone.tripId));
      const nextTrips = await getTripMetas(
        supabase,
        getBasePath(),
        cloudRecords,
        tombstoneIds,
      );
      const currentSelectedTripId = selectedTripIdRef.current;
      const selectedTripWasRemoved = Boolean(
        currentSelectedTripId &&
        !nextTrips.some((trip) => trip.id === currentSelectedTripId),
      );

      setTripOptions(nextTrips);
      if (selectedTripWasRemoved || !currentSelectedTripId) {
        const nextTrip = findDefaultTrip(nextTrips) ?? nextTrips[0] ?? null;
        tripLoadRevisionRef.current += 1;
        initialCloudRecordsRef.current = cloudRecords.filter(
          (record) => !tombstoneIds.has(record.meta.id),
        );
        setCurrentTrip(null);
        setCurrentScreen("itinerary");
        setActiveDay(1);
        setSelectedTripId(nextTrip?.id ?? "");
        setIsLoading(Boolean(nextTrip));
      }

      return selectedTripWasRemoved;
    })().finally(() => {
      reconciliationPromiseRef.current = null;
    });

    reconciliationPromiseRef.current = reconciliation;
    return reconciliation;
  }, [getBasePath, isSessionReady, supabase]);

  useEffect(() => {
    if (!isSessionReady) return;

    let isActive = true;
    const loadInitialWorkspace = async () => {
      if (navigator.onLine) {
        await reconcileTripWorkspace();
        return;
      }

      const sortedTrips = await getTripMetas(supabase, getBasePath());
      if (!isActive) return;
      setTripOptions(sortedTrips);
      if (sortedTrips.length > 0) {
        const defaultTrip = findDefaultTrip(sortedTrips) ?? sortedTrips[0];
        setSelectedTripId(defaultTrip.id);
      } else {
        setIsLoading(false);
      }
    };

    void loadInitialWorkspace()
      .catch((error) => {
        if (!isActive) return;
        console.error(error);
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [getBasePath, isSessionReady, reconcileTripWorkspace, supabase]);

  useEffect(() => {
    if (!isSessionReady || !isOnline) return;
    const reconcile = () => {
      void reconcileTripWorkspace().catch((error) => {
        console.warn("Trip reconciliation failed; local data was preserved", error);
      });
    };
    const reconcileWhenVisible = () => {
      if (document.visibilityState === "visible") reconcile();
    };

    window.addEventListener("online", reconcile);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    reconcile();
    return () => {
      window.removeEventListener("online", reconcile);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
    };
  }, [isOnline, isSessionReady, reconcileTripWorkspace, userEmail]);

  useEffect(() => {
    if (!selectedTripId) return;

    const loadTripAndAuthData = async () => {
      const loadRevision = ++tripLoadRevisionRef.current;
      const initialCloudRecords = initialCloudRecordsRef.current;
      initialCloudRecordsRef.current = null;
      try {
        const tripData = await getTripDetail(
          supabase,
          getBasePath(),
          selectedTripId,
          selectedTripMeta,
          initialCloudRecords ?? undefined,
        );
        if (tripData && tripLoadRevisionRef.current === loadRevision) {
          setCurrentTrip(tripData);
          setActiveDay(getDefaultActiveDay(tripData.departureDate, tripData.content.days));

          if (tripData.sidebarConfig?.length > 0) {
            const validScreenIds = [
              ...tripData.sidebarConfig.map((screen) => screen.id),
              "privateChecklist",
            ];
            setCurrentScreen((screen) =>
              validScreenIds.includes(screen)
                ? screen
                : tripData.sidebarConfig[0].id,
            );
          }
        }
      } catch (error) {
        console.error(error);
      }

      if (userEmail) {
        getTripEditorEmails(supabase, selectedTripId)
          .then(setCurrentTripEditorEmails)
          .catch((error) => {
            console.warn(error);
            setCurrentTripEditorEmails([]);
          });
      } else {
        setCurrentTripEditorEmails([]);
      }

      let profile: AdminUser | null = null;
      const cachedProfile = localStorage.getItem(`admin_profile_${selectedTripId}`);

      if (userEmail && isOnline) {
        try {
          const { data, error } = await supabase
            .from("admin_users")
            .select("email, role, trip_id")
            .eq("email", userEmail);

          if (!error && data) {
            const profiles = data as AdminUser[];
            setHasAnyManagementRole(
              profiles.some(
                (item) =>
                  item.role === ROLE.SUPER_ADMIN || item.role === ROLE.TRIP_EDITOR,
              ),
            );
            profile =
              profiles.find((item) => item.role === "super_admin") ||
              profiles.find(
                (item) =>
                  item.role === "trip_editor" && item.trip_id === selectedTripId,
              ) ||
              null;

            if (profile) {
              localStorage.setItem(
                `admin_profile_${selectedTripId}`,
                JSON.stringify(profile),
              );
            }
          }
        } catch (error) {
          console.warn(error);
        }
      }

      if (!profile && cachedProfile) {
        try {
          const parsedProfile = JSON.parse(cachedProfile) as AdminUser;
          profile = parsedProfile.email === userEmail ? parsedProfile : null;
        } catch {
          profile = null;
        }
      }

      if (!userEmail) {
        setHasAnyManagementRole(false);
      } else if (profile) {
        setHasAnyManagementRole(true);
      }

      setAdminProfile(profile);

      const isAuthorized =
        profile?.role === "super_admin" ||
        (profile?.role === "trip_editor" && profile.trip_id === selectedTripId);

      setHasEditPermission(isAuthorized);

      const resolvedRole: Role = mapRole({
        isSignedIn: Boolean(userEmail),
        adminRole: profile?.role ?? null,
        isAssignedTrip: profile?.role === ROLE.TRIP_EDITOR &&
          profile?.trip_id === selectedTripId,
      });

      if (resolvedRole === ROLE.GUEST || resolvedRole === ROLE.USER) {
        removeRestrictedOtherInfoFromStoredTrip(selectedTripId);
        removeRestrictedStoredOtherInfoItems(selectedTripId);
        setCurrentTrip((current) => {
          if (!current || current.id !== selectedTripId) return current;

          const visibleItems = (current.content.otherInfoItems ?? []).filter(
            (item) => !item.allowedRoles || item.allowedRoles.length === 0,
          );
          if (visibleItems.length === (current.content.otherInfoItems ?? []).length) {
            return current;
          }

          return {
            ...current,
            content: {
              ...current.content,
              otherInfoItems: visibleItems,
            },
          };
        });
      }

      if (profile?.role === "super_admin") {
        getSuperAdminEmails(supabase)
          .then(setSuperAdminEmails)
          .catch((error) => {
            console.warn(error);
            setSuperAdminEmails([]);
          });
        refreshDefaultParticipantProfiles()
          .catch((error) => {
            console.warn(error);
            setDefaultParticipantProfiles([]);
          });
      } else {
        setSuperAdminEmails([]);
        setDefaultParticipantProfiles([]);
      }

      if (isAuthorized) {
        localStorage.setItem(`auth_${selectedTripId}`, "true");
      }

      if (!userEmail) {
        setExpenseBookTripId("");
        setIsLoading(false);
        return;
      }

      const bookTripId = isAuthorized
        ? selectedTripId
        : toPersonalBookTripId(selectedTripId, userEmail);

      setExpenseBookTripId(bookTripId);
      setIsLoading(false);
    };

    void loadTripAndAuthData();
  }, [
    getBasePath,
    isOnline,
    refreshDefaultParticipantProfiles,
    selectedTripId,
    selectedTripMeta,
    supabase,
    userEmail,
  ]);

  const createTrip = useCallback(
    async (input: TripEditorInput, syncEditors = true) => {
      let record = createTripRecord(input);
      try {
        record = await createTripRecordWithCloudSync(
          supabase,
          record,
          tripOptions.map((trip) => trip.id),
        );
      } catch (error) {
        if (!(error instanceof DuplicateTripIdError)) throw error;
        record = createTripRecord(input);
        record = await createTripRecordWithCloudSync(
          supabase,
          record,
          tripOptions.map((trip) => trip.id),
        );
      }
      if (syncEditors) {
        await syncTripEditorEmails(supabase, record.meta.id, record.editorEmails);
      }

      const nextTrips = await getTripMetas(supabase, getBasePath());
      setTripOptions(nextTrips);
      setSelectedTripId(record.meta.id);
      setCurrentTrip(record.detail);
      setCurrentScreen("itinerary");
      setActiveDay(getDefaultActiveDay(record.detail.departureDate, record.detail.content.days));
      setIsLoading(false);
    },
    [getBasePath, supabase, tripOptions],
  );

  const updateTrip = useCallback(
    async (input: TripEditorInput, syncEditors = true) => {
      if (!selectedTripId || !selectedTripMeta || !currentTrip) return;
      if (!canWriteSelectedTripNow()) throw new HistoricalTripLockedError();

      const record =
        updateTripRecord(selectedTripId, input) ??
        createTripRecordFromExisting(selectedTripMeta, currentTrip, input);

      await saveTripRecordWithCloudSync(supabase, record);
      try {
        await removeItineraryCoverPaths(
          supabase,
          getUnusedItineraryCoverPaths(currentTrip, record.detail),
        );
      } catch (error) {
        console.warn("Failed to remove unused itinerary covers", error);
      }
      if (syncEditors) {
        await syncTripEditorEmails(supabase, record.meta.id, record.editorEmails);
      }

      const nextTrips = await getTripMetas(supabase, getBasePath());
      setTripOptions(nextTrips);
      setCurrentTrip(record.detail);
      setCurrentScreen("itinerary");
      setActiveDay(getDefaultActiveDay(record.detail.departureDate, record.detail.content.days));
      setIsLoading(false);
    },
    [
      canWriteSelectedTripNow,
      currentTrip,
      getBasePath,
      selectedTripId,
      selectedTripMeta,
      supabase,
    ],
  );

  const refreshTripOptionsAndSelect = useCallback(
    async (preferredTripId?: string): Promise<{
      didFindPreferredTrip: boolean;
      selectedTrip: TripMeta | null;
    }> => {
      const nextTrips = await getTripMetas(supabase, getBasePath());
      const preferredTrip = preferredTripId
        ? nextTrips.find((trip) => trip.id === preferredTripId) ?? null
        : null;
      const fallbackTrip = findDefaultTrip(nextTrips) ?? nextTrips[0] ?? null;
      const nextTrip = preferredTrip ?? fallbackTrip;

      setTripOptions(nextTrips);
      setSelectedTripId(nextTrip?.id ?? "");
      setCurrentScreen("itinerary");
      setActiveDay(1);

      if (!nextTrip) {
        setCurrentTrip(null);
        setIsLoading(false);
      }

      if (nextTrip?.id === selectedTripId) {
        setIsLoading(false);
      }

      return {
        didFindPreferredTrip: Boolean(preferredTrip),
        selectedTrip: nextTrip,
      };
    },
    [getBasePath, selectedTripId, supabase],
  );

  const deleteTrip = useCallback(async (tripId: string) => {
    if (!tripId) return;

    await deleteTripRecordWithCloudSync(supabase, tripId);
    const nextTrips = await getTripMetas(supabase, getBasePath());
    const nextTrip = findDefaultTrip(nextTrips) ?? nextTrips[0];

    setTripOptions(nextTrips);
    setSelectedTripId(nextTrip?.id ?? "");
    setCurrentTrip(null);
    setCurrentScreen("itinerary");
    setActiveDay(1);
    setIsLoading(Boolean(nextTrip));
  }, [getBasePath, supabase]);

  const saveCurrentTripDetail = useCallback(
    async (
      nextTrip: TripDetail,
      enforceVersion = true,
    ): Promise<boolean> => {
      if (!selectedTripMeta) return false;
      if (!canWriteSelectedTripNow()) return false;

      tripLoadRevisionRef.current += 1;

      const record = createTripRecordFromDetail(
        selectedTripMeta,
        nextTrip,
        currentTripEditorEmails,
      );

      const didSync = await saveTripRecordWithCloudSync(
        supabase,
        record,
        undefined,
        enforceVersion,
      );
      if (currentTrip) {
        try {
          await removeItineraryCoverPaths(
            supabase,
            getUnusedItineraryCoverPaths(currentTrip, record.detail),
          );
        } catch (error) {
          console.warn("Failed to remove unused itinerary covers", error);
        }
      }
      setCurrentTrip(record.detail);
      setIsLoading(false);
      return didSync;
    },
    [
      currentTripEditorEmails,
      canWriteSelectedTripNow,
      currentTrip,
      selectedTripMeta,
      supabase,
    ],
  );

  const saveCurrentTripDetailLocally = useCallback(
    (nextTrip: TripDetail) => {
      if (!selectedTripMeta) return null;
      if (!canWriteSelectedTripNow()) return null;

      tripLoadRevisionRef.current += 1;

      const record = createTripRecordFromDetail(
        selectedTripMeta,
        nextTrip,
        currentTripEditorEmails,
      );
      saveTripRecord(record);
      setCurrentTrip(record.detail);
      setIsLoading(false);
      return record;
    },
    [canWriteSelectedTripNow, currentTripEditorEmails, selectedTripMeta],
  );

  const reloadCurrentTrip = useCallback(async () => {
    if (!selectedTripId || !navigator.onLine) return;

    const loadRevision = ++tripLoadRevisionRef.current;

    const nextTrip = await getTripDetail(
      supabase,
      getBasePath(),
      selectedTripId,
      selectedTripMeta ?? undefined,
    );
    if (nextTrip && tripLoadRevisionRef.current === loadRevision) {
      setCurrentTrip(nextTrip);
    }
  }, [getBasePath, selectedTripId, selectedTripMeta, supabase]);

  return {
    userEmail,
    userId,
    isSessionReady,
    isOnline,
    setUserId,
    setUserEmail,
    tripOptions,
    selectedTripId,
    setSelectedTripId,
    currentTrip,
    setCurrentTrip,
    isLoading,
    setIsLoading,
    currentScreen,
    setCurrentScreen,
    activeDay,
    setActiveDay,
    isMenuOpen,
    setIsMenuOpen,
    adminProfile,
    hasAnyManagementRole,
    setAdminProfile,
    hasEditPermission,
    setHasEditPermission,
    expenseBookTripId,
    setExpenseBookTripId,
    selectedTripMeta,
    currentMembers,
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
    reconcileTripWorkspace,
    currentTripEditorEmails,
    superAdminEmails,
    defaultParticipantProfiles,
    refreshDefaultParticipantProfiles,
  };
}
