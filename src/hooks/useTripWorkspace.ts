import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminUser, TripDetail, TripMeta } from "../types";
import { findDefaultTrip, sortTripsByDateDesc } from "../utils/tripHelpers";
import { toPersonalBookTripId } from "../storage/expenseStorage";
import { createPermission } from "../permissions/permission";
import { mapRole } from "../permissions/roleMapper";

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

  const selectedTripMeta = tripOptions.find((trip) => trip.id === selectedTripId);
  const currentMembers = selectedTripMeta?.participants || ["我", "小明", "小華"];
  const currentCurrencyCode = selectedTripMeta?.currencyConfig.code || "JPY";
  const currentCurrencySymbol = selectedTripMeta?.currencyConfig.symbol || "￥";
  const canUseExpense = Boolean(userEmail);
  const isUsingSharedExpenseBook = canUseExpense && hasEditPermission;
  const expenseMembers =
    isUsingSharedExpenseBook || !userEmail ? currentMembers : [userEmail];
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

  const getBasePath = () => {
    const path = window.location.pathname;
    if (path.includes("/Travel-Companion")) return "/Travel-Companion/";
    return "/";
  };

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
    const basePath = getBasePath();
    const url = `${basePath}trips/list.json`.replace(/\/+/g, "/");

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data: TripMeta[]) => {
        const sortedTrips = sortTripsByDateDesc(data);
        setTripOptions(sortedTrips);

        if (sortedTrips.length > 0) {
          const defaultTrip = findDefaultTrip(sortedTrips);
          const initialTrip = defaultTrip || sortedTrips[0];
          setSelectedTripId(initialTrip.id);
        }
      })
      .catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    if (!selectedTripId) return;

    const loadTripAndAuthData = async () => {
      const basePath = getBasePath();
      const detailPath =
        selectedTripMeta?.detailPath || `/trips/${selectedTripId}.json`;
      const url = `${basePath}${detailPath.replace(/^\//, "")}`.replace(
        /\/+/g,
        "/",
      );

      try {
        const response = await fetch(url);
        if (response.ok) {
          const tripData = (await response.json()) as TripDetail;
          setCurrentTrip(tripData);
          setActiveDay(1);

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
  }, [currentScreen, selectedTripId, selectedTripMeta?.detailPath, supabase, userEmail]);

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
    isSignedIn,
    isAssignedTrip,
    role,
    permission,
  };
}
