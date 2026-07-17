import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminUser, TripDetail, TripEditorInput, TripMeta } from "../types";
import { findDefaultTrip } from "../utils/tripHelpers";
import { toPersonalBookTripId } from "../storage/expenseStorage";
import { createPermission } from "../permissions/permission";
import { mapRole } from "../permissions/roleMapper";
import {
  createTripRecord,
  createTripRecordFromDetail,
  createTripRecordFromExisting,
  deleteTripRecordWithCloudSync,
  getTripDetail,
  getTripEditorEmails,
  getTripMetas,
  getSuperAdminEmails,
  saveTripRecordWithCloudSync,
  syncTripEditorEmails,
  updateTripRecord,
} from "../services/tripRepository";

interface UseTripWorkspaceOptions {
  supabase: SupabaseClient;
}

export default function useTripWorkspace({ supabase }: UseTripWorkspaceOptions) {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tripOptions, setTripOptions] = useState<TripMeta[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [currentTrip, setCurrentTrip] = useState<TripDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentScreen, setCurrentScreen] = useState<string>("itinerary");
  const [activeDay, setActiveDay] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [hasEditPermission, setHasEditPermission] = useState<boolean>(false);
  const [expenseBookTripId, setExpenseBookTripId] = useState<string>("");
  const [currentTripEditorEmails, setCurrentTripEditorEmails] = useState<string[]>([]);
  const [superAdminEmails, setSuperAdminEmails] = useState<string[]>([]);

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
  const currentUserParticipantName = (() => {
    if (!userEmail) return null;

    const email = userEmail.trim().toLowerCase();
    const participantEmailMap =
      selectedTripMeta?.participantEmailMap ??
      currentTrip?.content.participantEmailMap ??
      {};
    const currentMemberSet = new Set(currentMembers);
    const matchedEntry = Object.entries(participantEmailMap).find(
      ([participant, participantEmail]) =>
        currentMemberSet.has(participant) &&
        participantEmail.trim().toLowerCase() === email,
    );

    return matchedEntry?.[0] ?? null;
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

  const getBasePath = useCallback(() => {
    const path = window.location.pathname;
    if (path.includes("/Travel-Companion")) return "/Travel-Companion/";
    return "/";
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
      setUserEmail(session?.user?.email || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
      setUserEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    getTripMetas(supabase, getBasePath())
      .then((sortedTrips) => {
        setTripOptions(sortedTrips);

        if (sortedTrips.length > 0) {
          const defaultTrip = findDefaultTrip(sortedTrips);
          const initialTrip = defaultTrip || sortedTrips[0];
          setSelectedTripId(initialTrip.id);
        }
      })
      .catch((error) => console.error(error));
  }, [getBasePath, supabase]);

  useEffect(() => {
    if (!selectedTripId) return;

    const loadTripAndAuthData = async () => {
      try {
        const tripData = await getTripDetail(
          supabase,
          getBasePath(),
          selectedTripId,
          selectedTripMeta,
        );
        if (tripData) {
          setCurrentTrip(tripData);

          if (tripData.sidebarConfig?.length > 0) {
            const validScreenIds = [
              ...tripData.sidebarConfig.map((screen) => screen.id),
              "privateChecklist",
            ];
            if (!validScreenIds.includes(currentScreen)) {
              setCurrentScreen(tripData.sidebarConfig[0].id);
            }
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

      if (userEmail && navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from("admin_users")
            .select("email, role, trip_id")
            .eq("email", userEmail);

          if (!error && data) {
            const profiles = data as AdminUser[];
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

      setAdminProfile(profile);

      const isAuthorized =
        profile?.role === "super_admin" ||
        (profile?.role === "trip_editor" && profile.trip_id === selectedTripId);

      setHasEditPermission(isAuthorized);

      if (profile?.role === "super_admin") {
        getSuperAdminEmails(supabase)
          .then(setSuperAdminEmails)
          .catch((error) => {
            console.warn(error);
            setSuperAdminEmails([]);
          });
      } else {
        setSuperAdminEmails([]);
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
  }, [currentScreen, getBasePath, selectedTripId, selectedTripMeta, supabase, userEmail]);

  useEffect(() => {
    if (selectedTripId) {
      setActiveDay(1);
    }
  }, [selectedTripId]);

  const createTrip = useCallback(
    async (input: TripEditorInput, syncEditors = true) => {
      const record = createTripRecord(input);
      await saveTripRecordWithCloudSync(supabase, record);
      if (syncEditors) {
        await syncTripEditorEmails(supabase, record.meta.id, record.editorEmails);
      }

      const nextTrips = await getTripMetas(supabase, getBasePath());
      setTripOptions(nextTrips);
      setSelectedTripId(record.meta.id);
      setCurrentTrip(record.detail);
      setCurrentScreen("itinerary");
      setActiveDay(1);
      setIsLoading(false);
    },
    [getBasePath, supabase],
  );

  const updateTrip = useCallback(
    async (input: TripEditorInput, syncEditors = true) => {
      if (!selectedTripId || !selectedTripMeta || !currentTrip) return;

      const record =
        updateTripRecord(selectedTripId, input) ??
        createTripRecordFromExisting(selectedTripMeta, currentTrip, input);

      await saveTripRecordWithCloudSync(supabase, record);
      if (syncEditors) {
        await syncTripEditorEmails(supabase, record.meta.id, record.editorEmails);
      }

      const nextTrips = await getTripMetas(supabase, getBasePath());
      setTripOptions(nextTrips);
      setCurrentTrip(record.detail);
      setCurrentScreen("itinerary");
      setActiveDay(1);
      setIsLoading(false);
    },
    [currentTrip, getBasePath, selectedTripId, selectedTripMeta, supabase],
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
    const nextTrip = nextTrips.find((trip) => trip.id !== tripId) ?? nextTrips[0];

    setTripOptions(nextTrips);
    setSelectedTripId(nextTrip?.id ?? "");
    setCurrentTrip(null);
    setCurrentScreen("itinerary");
    setActiveDay(1);
    setIsLoading(Boolean(nextTrip));
  }, [getBasePath, supabase]);

  const saveCurrentTripDetail = useCallback(
    async (nextTrip: TripDetail) => {
      if (!selectedTripMeta) return;

      const record = createTripRecordFromDetail(
        selectedTripMeta,
        nextTrip,
        currentTripEditorEmails,
      );

      await saveTripRecordWithCloudSync(supabase, record);
      const nextTrips = await getTripMetas(supabase, getBasePath());
      setTripOptions(nextTrips);
      setCurrentTrip(record.detail);
      setIsLoading(false);
    },
    [
      currentTripEditorEmails,
      getBasePath,
      selectedTripMeta,
      supabase,
    ],
  );

  return {
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
    setExpenseBookTripId,
    selectedTripMeta,
    currentMembers,
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
  };
}
