import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE, type Role } from "../permissions/roles";
import {
  APP_SOURCE_CLIENT_ID,
  getAppDataRevision,
  getCurrentTripRemoteAccess,
  shouldNotifyForRevision,
  toAppDataRevision,
  type AppDataRevision,
} from "../services/tripDataRevisionService";
import {
  getTripChangePreview,
  type TripChangePreviewSummary,
  type TripChangePreviewWindow,
} from "../services/tripChangePreviewService";
import { clearSharedTripDataAfterAccessLoss } from "../storage/sharedTripDataStorage";

export type TripDataNoticeKind =
  | "available"
  | "snoozed"
  | "revoked"
  | "conflict";

interface UseTripDataRevisionOptions {
  supabase: SupabaseClient;
  userId: string | null;
  userEmail: string | null;
  selectedTripId: string;
  role: Role;
  hasAnyManagementRole: boolean;
  isOnline: boolean;
  onReconcileTrips: () => Promise<boolean>;
}

export const useTripDataRevision = ({
  supabase,
  userId,
  userEmail,
  selectedTripId,
  role,
  hasAnyManagementRole,
  isOnline,
  onReconcileTrips,
}: UseTripDataRevisionOptions) => {
  const [noticeKind, setNoticeKind] = useState<TripDataNoticeKind | null>(null);
  const [isChangePreviewOpen, setIsChangePreviewOpen] = useState(false);
  const [isChangePreviewLoading, setIsChangePreviewLoading] = useState(false);
  const [changePreviewSummary, setChangePreviewSummary] =
    useState<TripChangePreviewSummary | null>(null);
  const [changePreviewError, setChangePreviewError] = useState<string | null>(null);
  const knownRevisionRef = useRef<number | null>(null);
  const knownRevisionUpdatedAtRef = useRef<string | null>(null);
  const changePreviewWindowRef = useRef<TripChangePreviewWindow | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const pendingNoticeRef = useRef(false);
  const selectedTripIdRef = useRef(selectedTripId);
  const userEmailRef = useRef(userEmail);
  const roleRef = useRef(role);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
    userEmailRef.current = userEmail;
    roleRef.current = role;
  }, [role, selectedTripId, userEmail]);

  const inspectAccessAndNotify = useCallback(async () => {
    const tripId = selectedTripIdRef.current;
    const email = userEmailRef.current;
    if (!tripId || !email || !navigator.onLine) {
      return;
    }

    try {
      const selectedTripWasRemoved = await onReconcileTrips();
      if (selectedTripWasRemoved) {
        setNoticeKind(null);
        return;
      }

      const access = await getCurrentTripRemoteAccess(supabase, tripId, email);
      if (!access.tripExists) {
        await onReconcileTrips();
        setNoticeKind(null);
        return;
      }
      if (
        roleRef.current === ROLE.TRIP_EDITOR &&
        !access.isCurrentTripEditor &&
        !access.isSuperAdmin
      ) {
        await clearSharedTripDataAfterAccessLoss(tripId, email);
        setNoticeKind("revoked");
        return;
      }
      setNoticeKind((current) =>
        current === "revoked" || current === "conflict"
          ? current
          : "available",
      );
    } catch (error) {
      console.warn("Failed to revalidate Trip access after revision", error);
    }
  }, [onReconcileTrips, supabase]);

  const scheduleNotice = useCallback(() => {
    pendingNoticeRef.current = true;
    if (noticeTimerRef.current !== null) return;
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      if (!pendingNoticeRef.current) return;
      pendingNoticeRef.current = false;
      void inspectAccessAndNotify();
    }, 400);
  }, [inspectAccessAndNotify]);

  const acceptRevision = useCallback((revision: AppDataRevision): boolean => {
    const knownRevision = knownRevisionRef.current;
    const knownUpdatedAt = knownRevisionUpdatedAtRef.current;
    if (knownRevision === null) {
      knownRevisionRef.current = revision.revision;
      knownRevisionUpdatedAtRef.current = revision.updatedAt;
      return false;
    }
    if (revision.revision <= knownRevision) return false;

    const shouldNotify = shouldNotifyForRevision(knownRevision, revision);
    if (shouldNotify) {
      const previousWindow = changePreviewWindowRef.current;
      changePreviewWindowRef.current = {
        fromRevision: previousWindow?.fromRevision ?? knownRevision,
        toRevision: revision.revision,
        fromUpdatedAt:
          previousWindow?.fromUpdatedAt ??
          knownUpdatedAt ??
          revision.updatedAt,
        toUpdatedAt: revision.updatedAt,
      };
      setChangePreviewSummary(null);
      setChangePreviewError(null);
      scheduleNotice();
    }

    knownRevisionRef.current = revision.revision;
    knownRevisionUpdatedAtRef.current = revision.updatedAt;
    return shouldNotify;
  }, [scheduleNotice]);

  const checkForRemoteTripChange = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine || !hasAnyManagementRole) return false;
    try {
      const revision = await getAppDataRevision(supabase);
      if (!revision) {
        return false;
      }
      const shouldNotify = acceptRevision(revision);
      if (
        !shouldNotify &&
        (noticeKind === "available" || noticeKind === "snoozed")
      ) {
        await inspectAccessAndNotify();
      }
      return shouldNotify;
    } catch (error) {
      console.warn("Failed to check Trip data revision", error);
      return false;
    }
  }, [
    acceptRevision,
    hasAnyManagementRole,
    inspectAccessAndNotify,
    noticeKind,
    supabase,
  ]);

  useEffect(() => {
    if (!isOnline || !hasAnyManagementRole) return;
    const timer = window.setTimeout(() => {
      void checkForRemoteTripChange();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkForRemoteTripChange, hasAnyManagementRole, isOnline]);

  useEffect(() => {
    if (
      !isOnline ||
      !userId ||
      !hasAnyManagementRole ||
      noticeKind === "revoked"
    ) return;

    let checkedAfterFailure = false;
    void supabase.realtime.setAuth();
    const channel = supabase
      .channel(`travel-companion:data-revision:${userId}`, {
        config: { private: true },
      })
      .on("broadcast", { event: "revision_changed" }, ({ payload }) => {
        const revision = toAppDataRevision(payload);
        if (revision) acceptRevision(revision);
      })
      .subscribe((status) => {
        if (
          !checkedAfterFailure &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        ) {
          checkedAfterFailure = true;
          void checkForRemoteTripChange();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    acceptRevision,
    checkForRemoteTripChange,
    hasAnyManagementRole,
    isOnline,
    noticeKind,
    supabase,
    userId,
  ]);

  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void checkForRemoteTripChange();
      }
    };
    const checkWhenFocused = () => void checkForRemoteTripChange();
    window.addEventListener("focus", checkWhenFocused);
    window.addEventListener("online", checkWhenFocused);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", checkWhenFocused);
      window.removeEventListener("online", checkWhenFocused);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkForRemoteTripChange]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
  }, []);

  const openChangePreview = useCallback(async () => {
    const previewWindow = changePreviewWindowRef.current;
    const tripId = selectedTripIdRef.current;
    setIsChangePreviewOpen(true);
    setChangePreviewError(null);

    if (!navigator.onLine) {
      setIsChangePreviewLoading(false);
      setChangePreviewSummary(null);
      setChangePreviewError("目前沒有網路連線。");
      return;
    }
    if (!previewWindow || !tripId) {
      setIsChangePreviewLoading(false);
      setChangePreviewSummary(null);
      setChangePreviewError("目前沒有可用的變更摘要範圍。");
      return;
    }

    setIsChangePreviewLoading(true);
    try {
      const summary = await getTripChangePreview(
        supabase,
        tripId,
        previewWindow,
      );
      setChangePreviewSummary(summary);
    } catch (error) {
      console.warn("Failed to load Trip change preview", error);
      setChangePreviewSummary(null);
      setChangePreviewError("變更摘要暫時無法讀取。");
    } finally {
      setIsChangePreviewLoading(false);
    }
  }, [supabase]);

  const closeChangePreview = useCallback(() => {
    setIsChangePreviewOpen(false);
  }, []);

  const showConflict = useCallback(() => setNoticeKind("conflict"), []);
  const snooze = useCallback(() => {
    setNoticeKind((current) => current === "available" ? "snoozed" : current);
  }, []);
  const reload = useCallback(() => window.location.reload(), []);

  return {
    noticeKind,
    isTripMasterLocked: noticeKind !== null,
    isChangePreviewOpen,
    isChangePreviewLoading,
    changePreviewSummary,
    changePreviewError,
    checkForRemoteTripChange,
    openChangePreview,
    closeChangePreview,
    showConflict,
    snooze,
    reload,
    sourceClientId: APP_SOURCE_CLIENT_ID,
  };
};
