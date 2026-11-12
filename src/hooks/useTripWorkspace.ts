import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TRIP_CURRENCY,
  type AdminProfile,
  type AdminUser,
  type ItineraryItem,
  type TripDetail,
  type TripEditorInput,
  type TripMeta,
} from "../types";
import {
  findDefaultTrip,
  getDefaultActiveDay,
  isHistoricalTrip,
  sortTripsByDateDesc,
} from "../utils/tripHelpers";
import {
  getParticipantAliasByEmail,
  mergeParticipantEmailMaps,
} from "../utils/participantUtils";
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
import { upsertCloudOtherInfoItems } from "../services/otherInfoCloudService";
import {
  getCloudTripRecord,
  getCloudTripRecordsStrict,
  getTripDeletionTombstones,
} from "../services/tripCloudService";
import { decideTripReconciliation } from "../services/tripReconciliation";
import { clearSharedTripDataAfterAccessLoss } from "../storage/sharedTripDataStorage";
import { isProtectedSeedTripId } from "../constants/appConstants";
import { getUnusedItineraryCoverPaths } from "../utils/itineraryCoverPhoto";
import { scheduleItineraryCoverDeletion } from "../services/itineraryCoverPhotoService";
import { clearItineraryCoverOfflineCache } from "../services/itineraryCoverOfflineCache";
import {
  createPendingItinerarySyncState,
  createSyncedItineraryState,
  reconcilePendingItinerarySyncState,
  saveItineraryResolutionChoice,
  applyItineraryResolutionChoices,
  sameItineraryDaysData,
} from "../services/itinerarySync";
import {
  readItinerarySyncState,
  writeItinerarySyncState,
} from "../storage/itinerarySyncStorage";
import {
  consumeExternalReturnDay,
  getExternalReturnTripId,
  rememberExternalReturnContext,
} from "../utils/externalReturnContext";

interface UseTripWorkspaceOptions {
  supabase: SupabaseClient;
  supabaseUrl: string;
}

const LAST_AUTHENTICATED_EMAIL_KEY = "travel_companion_last_authenticated_email";

const readLastAuthenticatedEmail = (): string | null => {
  const email = localStorage.getItem(LAST_AUTHENTICATED_EMAIL_KEY)?.trim().toLowerCase() ?? "";
  return email || null;
};

const rememberAuthenticatedEmail = (email: string | null | undefined) => {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (normalizedEmail) {
    localStorage.setItem(LAST_AUTHENTICATED_EMAIL_KEY, normalizedEmail);
  }
};

export default function useTripWorkspace({ supabase, supabaseUrl }: UseTripWorkspaceOptions) {
  const startsOffline = !navigator.onLine;
  const connectivityHealthUrl = `${supabaseUrl.replace(/\/rest\/v1\/?$/, "")}/auth/v1/health`;
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(() =>
    startsOffline ? readLastAuthenticatedEmail() : null,
  );
  const [isSessionReady, setIsSessionReady] = useState(startsOffline);
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
  const reconcileTripWorkspaceRef = useRef<(() => Promise<boolean>) | null>(null);
  const itinerarySavePromisesRef = useRef(new Map<string, Promise<boolean>>());
  const selectedTripIdRef = useRef(selectedTripId);
  const userEmailRef = useRef(userEmail);
  const isOnlineRef = useRef(isOnline);
  const isSessionReadyRef = useRef(isSessionReady);
  const connectivityRecoveryPendingRef = useRef(startsOffline);
  const activeDayRef = useRef(activeDay);
  const currentTripIdRef = useRef<string | null>(null);
  // Invalidate stale async responses before an account transition or logout.
  const workspaceEpochRef = useRef(0);
  const invalidateWorkspaceAccess = useCallback(() => {
    workspaceEpochRef.current += 1;
    tripLoadRevisionRef.current += 1;
    initialCloudRecordsRef.current = null;
  }, []);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
    userEmailRef.current = userEmail;
    isOnlineRef.current = isOnline;
    isSessionReadyRef.current = isSessionReady;
  }, [isOnline, isSessionReady, selectedTripId, userEmail]);

  useEffect(() => {
    activeDayRef.current = activeDay;
    currentTripIdRef.current = currentTrip?.id ?? null;
  }, [activeDay, currentTrip?.id]);

  useEffect(() => {
    const remember = () => rememberExternalReturnContext(selectedTripIdRef.current, activeDay);
    const rememberFromLink = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a[target="_blank"]')) remember();
    };
    window.addEventListener("travel-companion:external-link-opening", remember);
    document.addEventListener("click", rememberFromLink);
    return () => {
      window.removeEventListener("travel-companion:external-link-opening", remember);
      document.removeEventListener("click", rememberFromLink);
    };
  }, [activeDay]);

  const selectedTripMeta = tripOptions.find((trip) => trip.id === selectedTripId);
  const currentMembers = useMemo(
    () => selectedTripMeta?.participants ?? ["我", "小明", "小華"],
    [selectedTripMeta?.participants],
  );
  const currentCurrencyCode = selectedTripMeta?.currencyConfig.code || DEFAULT_TRIP_CURRENCY.code;
  const currentCurrencySymbol = selectedTripMeta?.currencyConfig.symbol || DEFAULT_TRIP_CURRENCY.symbol;
  const canUseExpense = Boolean(userEmail);
  const isUsingSharedExpenseBook = canUseExpense && hasEditPermission;
  const expenseMembers =
    isUsingSharedExpenseBook || !userEmail ? currentMembers : [userEmail];
  const participantEmailMap = mergeParticipantEmailMaps(
    selectedTripMeta?.participantEmailMap,
    currentTrip?.content.participantEmailMap,
  );
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
      if (session) {
        setUserId(session.user.id || null);
        setUserEmail(session.user.email || null);
        rememberAuthenticatedEmail(session.user.email);
      } else if (navigator.onLine) {
        setUserId(null);
        setUserEmail(null);
      }
      setIsSessionReady(true);
    }).catch((error) => {
      console.warn("Failed to restore Supabase session", error);
      setIsSessionReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextEmail = session?.user.email?.trim().toLowerCase() ?? null;
      if (event === "SIGNED_OUT" || (userEmailRef.current && nextEmail !== userEmailRef.current)) {
        invalidateWorkspaceAccess();
      }
      userEmailRef.current = nextEmail;
      if (session) {
        setUserId(session.user.id || null);
        setUserEmail(session.user.email || null);
        rememberAuthenticatedEmail(session.user.email);
      } else if (event === "SIGNED_OUT" || navigator.onLine) {
        setUserId(null);
        setUserEmail(null);
        if (event === "SIGNED_OUT") {
          localStorage.removeItem(LAST_AUTHENTICATED_EMAIL_KEY);
        }
      }
      setIsSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, [supabase, invalidateWorkspaceAccess]);

  useEffect(() => {
    let isActive = true;
    let isProbing = false;
    let lastProbeAt = 0;

    const probeConnectivity = async (force = false) => {
      if (!navigator.onLine || isProbing || !isActive) return;
      const now = Date.now();
      if (!force && now - lastProbeAt < 15_000) return;

      isProbing = true;
      lastProbeAt = now;
      try {
        const response = await fetch(
          connectivityHealthUrl,
          { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5_000) },
        );
        if (isActive && response.ok) {
          setIsOnline(true);
          if (connectivityRecoveryPendingRef.current && isSessionReadyRef.current) {
            const reconcile = reconcileTripWorkspaceRef.current;
            if (!reconcile) return;
            try {
              await reconcile();
              connectivityRecoveryPendingRef.current = false;
            } catch (error) {
              console.warn("Trip reconciliation after connectivity recovery failed; will retry", error);
            }
          }
        }
      } catch {
        // Do not mark the app offline based on a transient probe failure.
        // The browser's offline event remains the authoritative hard signal.
      } finally {
        isProbing = false;
      }
    };

    const handleOnline = () => {
      connectivityRecoveryPendingRef.current = true;
      setIsOnline(true);
      void probeConnectivity(true);
    };
    const handleOffline = () => {
      connectivityRecoveryPendingRef.current = true;
      setIsOnline(false);
    };
    const handleFocus = () => void probeConnectivity();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void probeConnectivity();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    const probeInterval = window.setInterval(() => void probeConnectivity(), 30_000);

    return () => {
      isActive = false;
      window.clearInterval(probeInterval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [connectivityHealthUrl]);

  // A second tab can revoke a Trip and remove its local copy. Do not keep
  // rendering the old in-memory private content after the storage change.
  useEffect(() => {
    const onTripCacheChanged = (event: StorageEvent) => {
      if (event.key !== "travel_companion_custom_trips") return;
      const selected = selectedTripIdRef.current;
      if (!selected) return;
      const stillCached = readStoredTripRecords().some((record) => record.meta.id === selected);
      if (stillCached) return;
      const previousCloudTrip = tripOptions.find((trip) => trip.id === selected);
      if (!previousCloudTrip || isProtectedSeedTripId(selected)) return;
      invalidateWorkspaceAccess();
      setCurrentTrip(null);
      setSelectedTripId("");
      setTripOptions((trips) => trips.filter((trip) => trip.id !== selected));
      setAdminProfile(null);
      setHasEditPermission(false);
      setCurrentTripEditorEmails([]);
    };
    window.addEventListener("storage", onTripCacheChanged);
    return () => window.removeEventListener("storage", onTripCacheChanged);
  }, [invalidateWorkspaceAccess, tripOptions]);

  const reconcileTripWorkspace = useCallback(async (): Promise<boolean> => {
    if (!isSessionReady || !navigator.onLine) return false;
    if (reconciliationPromiseRef.current) return reconciliationPromiseRef.current;

    const expectedEpoch = workspaceEpochRef.current;
    const reconciliation = (async () => {
      const [cloudRecords, tombstones] = await Promise.all([
        getCloudTripRecordsStrict(supabase),
        getTripDeletionTombstones(supabase),
      ]);
      if (workspaceEpochRef.current !== expectedEpoch) return false;
      const decision = decideTripReconciliation(
        readStoredTripRecords(),
        cloudRecords,
        tombstones,
        readTripCacheState(),
      );

      if (workspaceEpochRef.current !== expectedEpoch) return false;
      replaceStoredTripRecords(decision.storedRecords);
      writeTripCacheState(decision.nextState);
      for (const tripId of decision.cleanupTripIds) {
        if (workspaceEpochRef.current !== expectedEpoch) return false;
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
      if (workspaceEpochRef.current !== expectedEpoch) return false;
      const currentSelectedTripId = selectedTripIdRef.current;
      const selectedTripWasRemoved = Boolean(
        currentSelectedTripId &&
        !nextTrips.some((trip) => trip.id === currentSelectedTripId),
      );

      setTripOptions(nextTrips);
      if (selectedTripWasRemoved || !currentSelectedTripId) {
        const returnTripId = getExternalReturnTripId(nextTrips.map((trip) => trip.id));
        const nextTrip = nextTrips.find((trip) => trip.id === returnTripId) ??
          findDefaultTrip(nextTrips) ?? nextTrips[0] ?? null;
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
    reconcileTripWorkspaceRef.current = reconcileTripWorkspace;
  }, [reconcileTripWorkspace]);

  useEffect(() => {
    if (!isSessionReady) return;
    void fetch(connectivityHealthUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    }).then((response) => {
      if (!response.ok) return;
      setIsOnline(true);
      if (connectivityRecoveryPendingRef.current) {
        void reconcileTripWorkspaceRef.current?.().then(() => {
          connectivityRecoveryPendingRef.current = false;
        }).catch((error) => {
          console.warn("Trip reconciliation after startup connectivity recovery failed; will retry", error);
        });
      }
    }).catch(() => {
      // The initial workspace loader handles failures with the local cache fallback.
    });
  }, [connectivityHealthUrl, isSessionReady]);

  useEffect(() => {
    if (!isSessionReady) return;

    let isActive = true;

    const loadStoredWorkspace = async () => {
      const storedRecords = readStoredTripRecords();
      const sortedTrips = storedRecords.length > 0
        ? sortTripsByDateDesc(storedRecords.map((record) => record.meta))
        : await getTripMetas(supabase, getBasePath(), []);
      if (!isActive) return;

      setTripOptions(sortedTrips);
      if (sortedTrips.length > 0) {
        const returnTripId = getExternalReturnTripId(sortedTrips.map((trip) => trip.id));
        const defaultTrip = sortedTrips.find((trip) => trip.id === returnTripId) ??
          findDefaultTrip(sortedTrips) ?? sortedTrips[0];
        initialCloudRecordsRef.current = [];
        setSelectedTripId(defaultTrip.id);
      } else {
        setIsLoading(false);
      }
    };

    const loadInitialWorkspace = async () => {
      if (!navigator.onLine) {
        await loadStoredWorkspace();
        return;
      }

      try {
        await reconcileTripWorkspace();
      } catch (error) {
        console.warn("Initial cloud workspace load failed; using cached trip data", error);
        // A failed reconciliation can be caused by parsing, permissions, or
        // local storage errors; it does not prove that the browser is offline.
        if (!navigator.onLine) setIsOnline(false);
        await loadStoredWorkspace();
      }
    };

    void loadInitialWorkspace().catch((error) => {
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
      const expectedEpoch = workspaceEpochRef.current;
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
        if (tripData && tripLoadRevisionRef.current === loadRevision && workspaceEpochRef.current === expectedEpoch) {
          const itineraryState = readItinerarySyncState(tripData.id);
          const protectedDaysData = itineraryState?.status === "pending" || itineraryState?.status === "conflict"
            ? itineraryState.pendingDaysData
            : tripData.content.daysData;
          const resolvedTrip = {
            ...tripData,
            content: {
              ...tripData.content,
              daysData: protectedDaysData,
            },
          };
          const rememberedDay = consumeExternalReturnDay(resolvedTrip.id, resolvedTrip.content.days);
          const canPreserveActiveDay =
            currentTripIdRef.current === resolvedTrip.id &&
            resolvedTrip.content.days.includes(activeDayRef.current);
          setCurrentTrip(resolvedTrip);
          setActiveDay(
            rememberedDay ??
              (canPreserveActiveDay
                ? activeDayRef.current
                : getDefaultActiveDay(resolvedTrip.departureDate, resolvedTrip.content.days)),
          );

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

      if (workspaceEpochRef.current !== expectedEpoch) return;
      if (userEmail) {
        getTripEditorEmails(supabase, selectedTripId)
          .then((emails) => { if (workspaceEpochRef.current === expectedEpoch) setCurrentTripEditorEmails(emails); })
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

          if (workspaceEpochRef.current !== expectedEpoch) return;
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

      if (workspaceEpochRef.current !== expectedEpoch) return;
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
          .then((emails) => { if (workspaceEpochRef.current === expectedEpoch) setSuperAdminEmails(emails); })
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const localTestPurpose =
        import.meta.env.DEV &&
        typeof supabaseUrl === "string" &&
        ["localhost", "127.0.0.1", "::1"].includes(new URL(supabaseUrl).hostname) &&
        (await supabase.auth.getUser()).data.user?.user_metadata?.local_test === true;
      if (localTestPurpose) {
        record = {
          ...record,
          detail: {
            ...record.detail,
            content: { ...record.detail.content, testPurpose: "three-way-sync" },
          },
        };
      }
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
      // V3.9.26: initial Other Info is stored under dedicated RLS rules.
      const initialItems = record.detail.content.otherInfoItems ?? [];
      if (initialItems.length && !await upsertCloudOtherInfoItems(supabase, record.meta.id, initialItems)) {
        console.warn("Unable to sync initial Trip Other Info; local copy retained");
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

      const cloudSnapshot = navigator.onLine
        ? await getCloudTripRecord(supabase, selectedTripId)
        : null;
      const record =
        updateTripRecord(
          selectedTripId,
          input,
          cloudSnapshot ?? undefined,
        ) ??
        createTripRecordFromExisting(selectedTripMeta, currentTrip, input);
      const expectedUpdatedAt =
        cloudSnapshot?.cloudUpdatedAt ?? cloudSnapshot?.updatedAt;

      await saveTripRecordWithCloudSync(
        supabase,
        record,
        expectedUpdatedAt,
      );
      try {
        await scheduleItineraryCoverDeletion(
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
      const confirmedRecord = preferredTripId
        ? await getCloudTripRecord(supabase, preferredTripId)
        : null;
      const nextTrips = await getTripMetas(supabase, getBasePath());
      const tripMetasById = new Map(nextTrips.map((trip) => [trip.id, trip]));
      if (confirmedRecord) {
        tripMetasById.set(confirmedRecord.meta.id, confirmedRecord.meta);
      }
      const mergedTrips = sortTripsByDateDesc(Array.from(tripMetasById.values()));
      const preferredTrip = preferredTripId
        ? mergedTrips.find((trip) => trip.id === preferredTripId) ?? null
        : null;
      const fallbackTrip = findDefaultTrip(mergedTrips) ?? mergedTrips[0] ?? null;
      const nextTrip = preferredTrip ?? fallbackTrip;

      setTripOptions(mergedTrips);
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
        didFindPreferredTrip: Boolean(preferredTrip && confirmedRecord),
        selectedTrip: nextTrip,
      };
    },
    [getBasePath, selectedTripId, supabase],
  );

  const deleteTrip = useCallback(async (tripId: string) => {
    if (!tripId) return;

    await deleteTripRecordWithCloudSync(supabase, tripId);
    await clearItineraryCoverOfflineCache(tripId);
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
      setCurrentTrip(record.detail);
      setIsLoading(false);

      if (currentTrip) {
        void scheduleItineraryCoverDeletion(
          supabase,
          getUnusedItineraryCoverPaths(currentTrip, record.detail),
        ).catch((error) => {
          console.warn("Failed to remove unused itinerary covers", error);
        });
      }

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
      const currentStoredRecord = readStoredTripRecords().find(
        (item) => item.meta.id === record.meta.id,
      );
      // Other Info 採獨立同步時只更新本機 Trip 快取；必須保留最後成功
      // 的雲端版本，否則下一次行程儲存會拿本機時間做樂觀鎖比對而誤判衝突。
      saveTripRecord({
        ...record,
        cloudUpdatedAt:
          currentStoredRecord?.cloudUpdatedAt ?? currentStoredRecord?.updatedAt,
      });
      setCurrentTrip(record.detail);
      setIsLoading(false);
      return record;
    },
    [canWriteSelectedTripNow, currentTripEditorEmails, selectedTripMeta],
  );

  const [itinerarySyncSnapshot, setItinerarySyncSnapshot] = useState(() => ({
    tripId: selectedTripId,
    state: selectedTripId ? readItinerarySyncState(selectedTripId) : null,
  }));
  const refreshItinerarySyncState = useCallback((tripId: string): void => {
    setItinerarySyncSnapshot({ tripId, state: readItinerarySyncState(tripId) });
  }, []);
  const itinerarySyncState = itinerarySyncSnapshot.tripId === selectedTripId
    ? itinerarySyncSnapshot.state
    : selectedTripId ? readItinerarySyncState(selectedTripId) : null;

  const saveItineraryTripDetail = useCallback(
    (nextTrip: TripDetail, editBaseDaysData?: Record<string, ItineraryItem[]>): Promise<boolean> => {
      const existingSave = itinerarySavePromisesRef.current.get(nextTrip.id);
      const save = (async (): Promise<boolean> => {
        if (existingSave) await existingSave;
        if (!selectedTripMeta || selectedTripMeta.id !== nextTrip.id) return false;
        if (!canWriteSelectedTripNow()) return false;
        if (!currentTrip || currentTrip.id !== nextTrip.id) return false;

        const tripId = nextTrip.id;
        const storedRecord = readStoredTripRecords().find((item) => item.meta.id === tripId);
        if (!storedRecord) {
          throw new Error("找不到本機旅程快取，無法安全保存每日卡片；請重新載入旅程後再試。");
        }

        const currentState = readItinerarySyncState(tripId);
        if (currentState?.status === "conflict") {
          throw new Error("這趟行程仍有尚未處理的卡片衝突；請先完成衝突處理，再繼續修改。");
        }

        const baseDaysData = currentState?.status === "pending"
          ? currentState.baseDaysData
          : editBaseDaysData ?? storedRecord.detail.content.daysData;
        const pendingState = createPendingItinerarySyncState(
          tripId,
          currentState?.baseCloudUpdatedAt ?? storedRecord.cloudUpdatedAt ?? storedRecord.updatedAt,
          baseDaysData,
          nextTrip.content.daysData,
          currentState,
        );
        const localRecord = createTripRecordFromDetail(
          selectedTripMeta,
          {
            ...storedRecord.detail,
            content: {
              ...storedRecord.detail.content,
              daysData: nextTrip.content.daysData,
            },
          },
          currentTripEditorEmails,
        );

        if (!navigator.onLine) {
          writeItinerarySyncState(pendingState);
          refreshItinerarySyncState(tripId);
          saveTripRecord({
            ...localRecord,
            cloudUpdatedAt: storedRecord.cloudUpdatedAt ?? storedRecord.updatedAt,
          });
          setCurrentTrip(localRecord.detail);
          setIsLoading(false);
          tripLoadRevisionRef.current += 1;
          return false;
        }

        try {
          const cloudRecord = await getCloudTripRecord(supabase, tripId);
          if (!cloudRecord) {
            throw new Error("無法確認雲端旅程是否存在；本機卡片修改已保留。");
          }
          const currentPending = readItinerarySyncState(tripId);
          if (!currentPending || currentPending.revision !== pendingState.revision) {
            throw new Error("卡片資料已再次修改，請重新同步最新版本。");
          }

          const reconciliation = reconcilePendingItinerarySyncState(
            {
              ...currentPending,
              baseDaysData: editBaseDaysData ?? currentPending.baseDaysData,
            },
            cloudRecord.detail.content.daysData,
            cloudRecord.updatedAt,
          );
          const reconciledState = reconciliation.state;
          const latestBeforeReconcileWrite = readItinerarySyncState(tripId);
          if (latestBeforeReconcileWrite?.revision !== currentPending.revision) {
            throw new Error("卡片資料已再次修改；本次雲端校正不會覆蓋較新的本機狀態。");
          }
          writeItinerarySyncState(reconciledState);
          refreshItinerarySyncState(tripId);
          if (reconciliation.status === "conflict") {
            setCurrentTrip((current) => current?.id === tripId
              ? { ...current, content: { ...current.content, daysData: reconciledState.pendingDaysData } }
              : current);
            throw new Error("偵測到每日行程卡片衝突；本機修改已保留，請先處理衝突。");
          }
          const pendingLocalRecord = readStoredTripRecords().find((item) => item.meta.id === tripId);
          if (pendingLocalRecord) {
            saveTripRecord({
              ...pendingLocalRecord,
              meta: cloudRecord.meta,
              detail: {
                ...pendingLocalRecord.detail,
                content: {
                  ...pendingLocalRecord.detail.content,
                  daysData: reconciledState.pendingDaysData,
                },
              },
              cloudUpdatedAt: storedRecord.cloudUpdatedAt ?? storedRecord.updatedAt,
            });
          }
          setCurrentTrip((current) => current?.id === tripId
            ? { ...current, content: { ...current.content, daysData: reconciledState.pendingDaysData } }
            : current);
          if (reconciliation.status === "already-synced") {
            const latestPending = readItinerarySyncState(tripId);
            if (latestPending?.revision !== currentPending.revision) {
              throw new Error("卡片資料已再次修改，雲端確認結果未套用；本機修改已保留。");
            }
            const confirmedRecord = readStoredTripRecords().find((item) => item.meta.id === tripId);
            if (confirmedRecord) {
              saveTripRecord({
                ...confirmedRecord,
                meta: cloudRecord.meta,
                detail: {
                  ...confirmedRecord.detail,
                  content: {
                    ...confirmedRecord.detail.content,
                    daysData: cloudRecord.detail.content.daysData,
                  },
                },
                updatedAt: cloudRecord.updatedAt,
                cloudUpdatedAt: cloudRecord.updatedAt,
              });
            }
            refreshItinerarySyncState(tripId);
            setCurrentTrip((current) => current?.id === tripId
              ? { ...current, content: { ...current.content, daysData: cloudRecord.detail.content.daysData } }
              : current);
            return true;
          }

          const latestStored = readStoredTripRecords().find((item) => item.meta.id === tripId);
          if (!latestStored) throw new Error("找不到本機旅程快取；卡片待同步狀態已保留。");
          const mergedRecord = {
            ...latestStored,
            meta: cloudRecord.meta,
            detail: {
              ...latestStored.detail,
              content: {
                ...latestStored.detail.content,
                daysData: reconciledState.pendingDaysData,
              },
            },
            editorEmails: latestStored.editorEmails,
            updatedAt: new Date().toISOString(),
            cloudUpdatedAt: cloudRecord.updatedAt,
          };
          await saveTripRecordWithCloudSync(supabase, mergedRecord, cloudRecord.updatedAt, true);

          const syncedRecord = readStoredTripRecords().find((item) => item.meta.id === tripId);
          const latestState = readItinerarySyncState(tripId);
          if (latestState?.revision === reconciledState.revision) {
            writeItinerarySyncState(createSyncedItineraryState(
              tripId,
              syncedRecord?.cloudUpdatedAt ?? mergedRecord.cloudUpdatedAt,
              reconciledState.pendingDaysData,
            ));
            refreshItinerarySyncState(tripId);
          }
          const savedTrip = syncedRecord?.detail ?? mergedRecord.detail;
          setCurrentTrip((current) => current?.id === tripId ? savedTrip : current);
          return true;
        } catch (error) {
          const latestState = readItinerarySyncState(tripId);
          if (latestState?.status === "pending") {
            writeItinerarySyncState({
              ...latestState,
              lastError: error instanceof Error ? error.message : String(error),
            });
            refreshItinerarySyncState(tripId);
          }
          throw error;
        }
      })();

      itinerarySavePromisesRef.current.set(nextTrip.id, save);
      const clearSaveLock = () => {
        if (itinerarySavePromisesRef.current.get(nextTrip.id) === save) {
          itinerarySavePromisesRef.current.delete(nextTrip.id);
        }
      };
      void save.then(clearSaveLock, clearSaveLock);
      return save;
    },
    [
      canWriteSelectedTripNow,
      currentTrip,
      currentTripEditorEmails,
      selectedTripMeta,
      supabase,
      refreshItinerarySyncState,
    ],
  );

  const recordItineraryResolutionChoice = useCallback((
    choice: Parameters<typeof saveItineraryResolutionChoice>[1],
  ): void => {
    if (!selectedTripId || !canWriteSelectedTripNow()) {
      throw new Error("目前沒有每日行程修改權限。");
    }
    const currentState = readItinerarySyncState(selectedTripId);
    if (currentState?.status !== "conflict") {
      throw new Error("目前沒有待處理的行程衝突。");
    }
    if (!currentState.conflicts?.some((item) => item.id === choice.conflictId)) {
      throw new Error("找不到這筆衝突，請重新整理衝突清單。");
    }
    writeItinerarySyncState(saveItineraryResolutionChoice(currentState, choice));
    refreshItinerarySyncState(selectedTripId);
  }, [canWriteSelectedTripNow, refreshItinerarySyncState, selectedTripId]);

  const applyItineraryResolution = useCallback(async (): Promise<boolean> => {
    if (!selectedTripId || !selectedTripMeta || !canWriteSelectedTripNow()) return false;
    const tripId = selectedTripId;
    const state = readItinerarySyncState(tripId);
    if (state?.status !== "conflict") throw new Error("目前沒有待處理的行程衝突。");

    const prepared = applyItineraryResolutionChoices(state);
    if (prepared.unresolved.length) {
      throw new Error(`還有 ${prepared.unresolved.length} 筆衝突尚未選擇處理方式。`);
    }
    // 決策已先持久化；離線可完成預選，但不得宣告同步成功。
    if (!navigator.onLine) return false;

    const cloudRecord = await getCloudTripRecord(supabase, tripId);
    if (!cloudRecord) throw new Error("無法確認雲端旅程狀態；原衝突資料仍保留。");
    const latestState = readItinerarySyncState(tripId);
    if (!latestState || latestState.revision !== state.revision) {
      throw new Error("衝突處理期間資料已再次變更，請重新檢視後再套用。");
    }

    const cloudSnapshotChanged =
      latestState.conflictCloudUpdatedAt !== cloudRecord.updatedAt ||
      !sameItineraryDaysData(
        latestState.conflictCloudDaysData ?? {},
        cloudRecord.detail.content.daysData,
      );
    if (cloudSnapshotChanged) {
      const refreshedReconciliation = reconcilePendingItinerarySyncState(
        latestState,
        cloudRecord.detail.content.daysData,
        cloudRecord.updatedAt,
      );
      writeItinerarySyncState({
        ...refreshedReconciliation.state,
        // 舊選擇僅適用於使用者當時檢視的完整快照；只要雲端有任何更新就要求重新確認。
        resolutionChoices: [],
        lastError: "雲端資料在衝突確認後又有變更；所有選擇已重設，請檢視最新版本。",
      });
      refreshItinerarySyncState(tripId);
      setCurrentTrip((current) => current?.id === tripId
        ? { ...current, content: { ...current.content, daysData: refreshedReconciliation.state.pendingDaysData } }
        : current);
      throw new Error("雲端已有新的行程變更，原選擇已重設；請重新確認衝突。");
    }

    const latestMerge = reconcilePendingItinerarySyncState(
      latestState,
      cloudRecord.detail.content.daysData,
      cloudRecord.updatedAt,
    );
    if (latestMerge.status !== "conflict") {
      writeItinerarySyncState({
        ...latestMerge.state,
        lastError: "最新版本未能重建原衝突，請重新檢視行程。",
      });
      refreshItinerarySyncState(tripId);
      throw new Error("衝突狀態已改變，請重新檢視行程後再試。");
    }

    const resolved = applyItineraryResolutionChoices({
      ...latestMerge.state,
      pendingDaysData: latestMerge.state.pendingDaysData,
      resolutionChoices: state.resolutionChoices,
    });
    if (resolved.unresolved.length) throw new Error("仍有未完成的衝突選擇。");

    const latestStored = readStoredTripRecords().find((item) => item.meta.id === tripId);
    if (!latestStored) throw new Error("找不到本機旅程快取；衝突資料仍保留。");
    const mergedRecord = {
      ...latestStored,
      meta: cloudRecord.meta,
      detail: {
        ...latestStored.detail,
        content: {
          ...latestStored.detail.content,
          daysData: resolved.daysData,
        },
      },
      updatedAt: new Date().toISOString(),
      cloudUpdatedAt: cloudRecord.updatedAt,
    };
    // 既有 repository 透過 updated_at optimistic-lock，真正競態由 TripVersionConflictError 阻擋。
    await saveTripRecordWithCloudSync(supabase, mergedRecord, cloudRecord.updatedAt, true);
    const syncedStored = readStoredTripRecords().find((item) => item.meta.id === tripId);
    const persistedCloudVersion = syncedStored?.cloudUpdatedAt ?? mergedRecord.cloudUpdatedAt;
    const savedDaysData = syncedStored?.detail.content.daysData ?? resolved.daysData;

    // 保存成功後再次回讀雲端，確認成功版本；不以本機 optimistic state 直接清除衝突快照。
    const confirmedCloud = await getCloudTripRecord(supabase, tripId);
    if (!confirmedCloud || !sameItineraryDaysData(confirmedCloud.detail.content.daysData, savedDaysData)) {
      const latestAfterRead = readItinerarySyncState(tripId);
      if (latestAfterRead?.status === "conflict") {
        writeItinerarySyncState({
          ...latestAfterRead,
          lastError: "雲端回讀未確認衝突解決結果；本機選擇與版本已保留。",
        });
        refreshItinerarySyncState(tripId);
      }
      throw new Error("雲端回讀尚未確認，已保留本機處理結果但不宣告同步完成。");
    }

    const latestAfterRead = readItinerarySyncState(tripId);
    if (latestAfterRead?.revision !== latestState.revision) {
      throw new Error("衝突處理期間本機選擇已變更，雲端結果不會清除新的本機狀態；請重新確認。");
    }

    writeItinerarySyncState(createSyncedItineraryState(tripId, confirmedCloud.updatedAt || persistedCloudVersion || cloudRecord.updatedAt, savedDaysData));
    refreshItinerarySyncState(tripId);
    setCurrentTrip((current) => current?.id === tripId
      ? { ...current, content: { ...current.content, daysData: savedDaysData } }
      : current);
    return true;
  }, [canWriteSelectedTripNow, refreshItinerarySyncState, selectedTripId, selectedTripMeta, supabase]);

  useEffect(() => {
    if (
      !isSessionReady ||
      !isOnline ||
      !selectedTripId ||
      !currentTrip ||
      currentTrip.id !== selectedTripId ||
      !canWriteSelectedTripNow()
    ) return;

    const syncState = readItinerarySyncState(selectedTripId);
    if (syncState?.status !== "pending") return;
    const pendingTrip: TripDetail = {
      ...currentTrip,
      content: {
        ...currentTrip.content,
        daysData: syncState.pendingDaysData,
      },
    };

    void saveItineraryTripDetail(pendingTrip).catch((error) => {
      console.warn("每日行程卡片待同步資料仍保留於本機；自動同步未完成。", error);
    });
  }, [
    canWriteSelectedTripNow,
    currentTrip,
    isOnline,
    isSessionReady,
    saveItineraryTripDetail,
    selectedTripId,
  ]);

  const reloadCurrentTrip = useCallback(async (preferCloud = false) => {
    if (!selectedTripId || !navigator.onLine) return;

    const loadRevision = ++tripLoadRevisionRef.current;
    const cloudSnapshot = preferCloud
      ? await getCloudTripRecord(supabase, selectedTripId)
      : null;
    if (preferCloud && !cloudSnapshot) {
      throw new Error("目前旅程已不存在，請重新載入旅程清單。");
    }

    const nextTrip = await getTripDetail(
      supabase,
      getBasePath(),
      selectedTripId,
      selectedTripMeta ?? undefined,
      cloudSnapshot ? [cloudSnapshot] : undefined,
      preferCloud,
    );
    if (nextTrip && tripLoadRevisionRef.current === loadRevision) {
      setCurrentTrip(nextTrip);
      if (cloudSnapshot) {
        setTripOptions((current) =>
          current.map((trip) =>
            trip.id === cloudSnapshot.meta.id ? cloudSnapshot.meta : trip,
          ),
        );
      }
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
    setTripOptions,
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
    saveItineraryTripDetail,
    saveCurrentTripDetailLocally,
    reloadCurrentTrip,
    reconcileTripWorkspace,
    itinerarySyncState,
    recordItineraryResolutionChoice,
    applyItineraryResolution,
    currentTripEditorEmails,
    superAdminEmails,
    defaultParticipantProfiles,
    refreshDefaultParticipantProfiles,
    invalidateWorkspaceAccess,
  };
}
