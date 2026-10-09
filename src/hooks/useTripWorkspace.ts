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
  sortTripsByDateDesc,
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
  consumeExternalReturnDay,
  getExternalReturnTripId,
  rememberExternalReturnContext,
} from "../utils/externalReturnContext";

interface UseTripWorkspaceOptions {
  supabase: SupabaseClient;
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

export default function useTripWorkspace({ supabase }: UseTripWorkspaceOptions) {
  const startsOffline = !navigator.onLine;
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
  const selectedTripIdRef = useRef(selectedTripId);
  const userEmailRef = useRef(userEmail);
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
  }, [selectedTripId, userEmail]);

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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
        setIsOnline(false);
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
          const rememberedDay = consumeExternalReturnDay(tripData.id, tripData.content.days);
          const canPreserveActiveDay =
            currentTripIdRef.current === tripData.id &&
            tripData.content.days.includes(activeDayRef.current);
          setCurrentTrip(tripData);
          setActiveDay(
            rememberedDay ??
              (canPreserveActiveDay
                ? activeDayRef.current
                : getDefaultActiveDay(tripData.departureDate, tripData.content.days)),
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
    saveCurrentTripDetailLocally,
    reloadCurrentTrip,
    reconcileTripWorkspace,
    currentTripEditorEmails,
    superAdminEmails,
    defaultParticipantProfiles,
    refreshDefaultParticipantProfiles,
    invalidateWorkspaceAccess,
  };
}
