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
  writeConfirmedItinerarySnapshot,
  type TripChangePreviewSummary,
  type TripChangePreviewWindow,
} from "../services/tripChangePreviewService";
import { getCloudTripRecord } from "../services/tripCloudService";
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
  const [hasNewChangesDuringPreview, setHasNewChangesDuringPreview] = useState(false);
  const [isConfirmingPreview, setIsConfirmingPreview] = useState(false);
  const knownRevisionRef = useRef<number | null>(null);
  const knownRevisionUpdatedAtRef = useRef<string | null>(null);
  const changePreviewWindowRef = useRef<TripChangePreviewWindow | null>(null);
  const tripMonitoringBaselineRef = useRef<{ revision: number; updatedAt: string; daysData: Record<string, import("../types").ItineraryItem[]> } | null>(null);
  const previewRequestRef = useRef(0);
  const refreshPreviewRef = useRef<(() => Promise<void>) | null>(null);
  const previewedRevisionRef = useRef<number | null>(null);
  const confirmingRef = useRef(false);
  const suppressNoticeRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);
  const pendingNoticeRef = useRef(false);
  const selectedTripIdRef = useRef(selectedTripId);
  const userEmailRef = useRef(userEmail);
  const roleRef = useRef(role);
  const monitoredTripIdRef = useRef<string | null>(null);
  const isTripBaselineReadyRef = useRef(false);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
    userEmailRef.current = userEmail;
    roleRef.current = role;
  }, [role, selectedTripId, userEmail]);

  useEffect(() => {
    monitoredTripIdRef.current = selectedTripId;
    isTripBaselineReadyRef.current = false;
    knownRevisionRef.current = null;
    knownRevisionUpdatedAtRef.current = null;
    changePreviewWindowRef.current = null;
    tripMonitoringBaselineRef.current = null;
    previewedRevisionRef.current = null;
    suppressNoticeRef.current = false;
    if (!selectedTripId || !isOnline || !hasAnyManagementRole) return;

    let disposed = false;
    void (async () => {
      try {
        const [revision, cloudRecord] = await Promise.all([
          getAppDataRevision(supabase),
          getCloudTripRecord(supabase, selectedTripId),
        ]);
        if (disposed || monitoredTripIdRef.current !== selectedTripId) return;
        if (!revision || !cloudRecord) return;
        knownRevisionRef.current = revision.revision;
        knownRevisionUpdatedAtRef.current = revision.updatedAt;
        tripMonitoringBaselineRef.current = {
          revision: revision.revision,
          updatedAt: cloudRecord.updatedAt,
          daysData: cloudRecord.detail.content.daysData,
        };
        isTripBaselineReadyRef.current = true;
      } catch (error) {
        console.warn("Failed to establish Trip revision monitoring baseline", error);
      }
    })();
    return () => { disposed = true; };
  }, [hasAnyManagementRole, isOnline, selectedTripId, supabase]);

  const refreshOpenChangePreview = useCallback(async () => {
    const tripId = selectedTripIdRef.current;
    if (!tripId || monitoredTripIdRef.current !== tripId || !isTripBaselineReadyRef.current) return;
    if (!changePreviewWindowRef.current || !navigator.onLine) return;

    // Invalidate any older in-flight preview as soon as a newer revision asks for a refresh.
    const requestId = ++previewRequestRef.current;
    const baseline = tripMonitoringBaselineRef.current;
    if (!baseline) return;
    setIsChangePreviewLoading(true);
    try {
      const cloudRecord = await getCloudTripRecord(supabase, tripId);
      if (!cloudRecord) throw new Error("無法取得最新雲端行程資料。");
      const latestRevision = await getAppDataRevision(supabase);
      if (!latestRevision) throw new Error("無法確認最新資料版本。");
      if ((knownRevisionRef.current ?? 0) > latestRevision.revision) {
        if (requestId === previewRequestRef.current) {
          const baseline = tripMonitoringBaselineRef.current;
          if (baseline) {
            changePreviewWindowRef.current = {
              fromRevision: baseline.revision,
              toRevision: knownRevisionRef.current!,
              fromUpdatedAt: baseline.updatedAt,
              toUpdatedAt: knownRevisionUpdatedAtRef.current ?? latestRevision.updatedAt,
            };
          }
          window.setTimeout(() => {
            if (isChangePreviewOpen) void refreshPreviewRef.current?.();
          }, 0);
        }
        return;
      }
      const summary = await getTripChangePreview(
        supabase,
        tripId,
        {
          fromRevision: baseline.revision,
          toRevision: latestRevision.revision,
          fromUpdatedAt: baseline.updatedAt,
          toUpdatedAt: latestRevision.updatedAt,
        },
        cloudRecord.detail.content.daysData,
        cloudRecord.updatedAt,
        baseline,
      );
      if (requestId !== previewRequestRef.current) return;
      setChangePreviewSummary(summary);
      setChangePreviewError(null);
      previewedRevisionRef.current = latestRevision.revision;
      if (summary.totalChanges === 0) {
        // Keep the preview open if the user explicitly opened it. A zero-net
        // state clears the notice only when the preview was not already open.
        suppressNoticeRef.current = true;
        changePreviewWindowRef.current = null;
        setHasNewChangesDuringPreview(false);
        setChangePreviewSummary(null);
        if (!isChangePreviewOpen) {
          setNoticeKind((current) => current === "available" ? null : current);
        }
      } else {
        suppressNoticeRef.current = false;
        changePreviewWindowRef.current = {
          fromRevision: baseline.revision,
          toRevision: latestRevision.revision,
          fromUpdatedAt: baseline.updatedAt,
          toUpdatedAt: latestRevision.updatedAt,
        };
      }
      knownRevisionRef.current = Math.max(knownRevisionRef.current ?? 0, latestRevision.revision);
      knownRevisionUpdatedAtRef.current = latestRevision.updatedAt;
    } catch (error) {
      if (requestId !== previewRequestRef.current) return;
      console.warn("Failed to refresh Trip change preview", error);
      setChangePreviewError("收到新的變更，但最新摘要暫時無法讀取；請稍後重新預覽。");
    } finally {
      if (requestId === previewRequestRef.current) setIsChangePreviewLoading(false);
    }
  }, [isChangePreviewOpen, supabase]);

  useEffect(() => {
    refreshPreviewRef.current = refreshOpenChangePreview;
  }, [refreshOpenChangePreview]);

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
      // Revalidate access even when a zero-net summary suppresses the normal notice.
      if (suppressNoticeRef.current) return;
      // Workspace reconciliation applies safe remote data automatically;
      // this notice never reloads the page or blocks ordinary card editing.
      setNoticeKind((current) =>
        current === "revoked" || current === "conflict" ? current : "available",
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

  const acceptRevision = useCallback(async (revision: AppDataRevision): Promise<boolean> => {
    const tripId = selectedTripIdRef.current;
    if (!tripId || monitoredTripIdRef.current !== tripId || !isTripBaselineReadyRef.current) {
      return false;
    }
    const knownRevision = knownRevisionRef.current;
    if (knownRevision === null) return false;
    if (revision.revision <= knownRevision) return false;

    const shouldNotify = shouldNotifyForRevision(knownRevision, revision);
    if (shouldNotify) {
      const tripId = selectedTripIdRef.current;
      const baseline = tripMonitoringBaselineRef.current;
      if (!baseline || monitoredTripIdRef.current !== tripId) return false;
      changePreviewWindowRef.current = {
        fromRevision: baseline.revision,
        toRevision: revision.revision,
        fromUpdatedAt: baseline.updatedAt,
        toUpdatedAt: revision.updatedAt,
      };
      setChangePreviewError(null);
      suppressNoticeRef.current = false;
      if (isChangePreviewOpen) setHasNewChangesDuringPreview(true);
      // Calculate the net result immediately after receiving a newer revision.
      // A zero-net result clears the notice without requiring a manual preview.
      void refreshOpenChangePreview();
      scheduleNotice();
    }

    knownRevisionRef.current = Math.max(knownRevisionRef.current ?? 0, revision.revision);
    knownRevisionUpdatedAtRef.current =
      knownRevisionRef.current === revision.revision
        ? revision.updatedAt
        : knownRevisionUpdatedAtRef.current;
    return shouldNotify;
  }, [isChangePreviewOpen, refreshOpenChangePreview, scheduleNotice]);

  const checkForRemoteTripChange = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine || !hasAnyManagementRole) return false;
    try {
      const revision = await getAppDataRevision(supabase);
      if (!revision) {
        return false;
      }
      const shouldNotify = await acceptRevision(revision);
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
        if (revision) void acceptRevision(revision);
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
    setHasNewChangesDuringPreview(false);
    setChangePreviewError(null);

    if (!navigator.onLine) {
      setIsChangePreviewLoading(false);
      setChangePreviewError("目前沒有網路連線。");
      return;
    }
    if (!previewWindow || !tripId) {
      setIsChangePreviewLoading(false);
      setChangePreviewError("目前沒有可用的變更摘要範圍。");
      return;
    }

    await refreshOpenChangePreview();
  }, [refreshOpenChangePreview]);

  const closeChangePreview = useCallback(() => {
    setIsChangePreviewOpen(false);
  }, []);

  const showConflict = useCallback(() => setNoticeKind("conflict"), []);
  const confirmNotice = useCallback(async () => {
    if (noticeKind !== "available" || confirmingRef.current) return;
    const tripId = selectedTripIdRef.current;
    if (!navigator.onLine || !tripId) {
      setChangePreviewError("目前無法連線確認最新資料，請恢復連線後再確認。");
      return;
    }

    confirmingRef.current = true;
    setIsConfirmingPreview(true);
    setIsChangePreviewLoading(true);
    try {
      const revisionBeforeRead = await getAppDataRevision(supabase);
      if (!revisionBeforeRead) throw new Error("無法確認最新資料版本。");
      const cloudRecord = await getCloudTripRecord(supabase, tripId);
      if (!cloudRecord) throw new Error("無法取得最新雲端行程資料。");
      const revisionAfterRead = await getAppDataRevision(supabase);
      if (!revisionAfterRead) throw new Error("無法再次確認最新資料版本。");

      if (
        revisionBeforeRead.revision !== revisionAfterRead.revision ||
        (previewedRevisionRef.current !== null &&
          revisionBeforeRead.revision !== previewedRevisionRef.current)
      ) {
        knownRevisionRef.current = Math.max(
          knownRevisionRef.current ?? 0,
          revisionAfterRead.revision,
        );
        knownRevisionUpdatedAtRef.current = revisionAfterRead.updatedAt;
        const monitoringBaseline = tripMonitoringBaselineRef.current;
        if (monitoringBaseline) {
          changePreviewWindowRef.current = {
            fromRevision: monitoringBaseline.revision,
            toRevision: revisionAfterRead.revision,
            fromUpdatedAt: monitoringBaseline.updatedAt,
            toUpdatedAt: revisionAfterRead.updatedAt,
          };
        }
        setHasNewChangesDuringPreview(true);
        setChangePreviewError(null);
        await refreshOpenChangePreview();
        return;
      }

      const confirmedBaseline = {
        revision: revisionAfterRead.revision,
        updatedAt: cloudRecord.updatedAt,
        daysData: cloudRecord.detail.content.daysData,
      };
      writeConfirmedItinerarySnapshot(tripId, {
        revision: revisionAfterRead.revision,
        updatedAt: revisionAfterRead.updatedAt,
        daysData: cloudRecord.detail.content.daysData,
      });
      tripMonitoringBaselineRef.current = confirmedBaseline;
      knownRevisionRef.current = revisionAfterRead.revision;
      knownRevisionUpdatedAtRef.current = revisionAfterRead.updatedAt;
      previewedRevisionRef.current = revisionAfterRead.revision;
      suppressNoticeRef.current = false;
      changePreviewWindowRef.current = null;
      setChangePreviewSummary(null);
      setChangePreviewError(null);
      setHasNewChangesDuringPreview(false);
      setNoticeKind((current) => current === "available" ? null : current);
      setIsChangePreviewOpen(false);
    } catch (error) {
      console.warn("Failed to confirm Trip change preview baseline", error);
      setChangePreviewError("無法確認最新雲端資料；摘要與提示已保留，請稍後重試。");
    } finally {
      confirmingRef.current = false;
      setIsConfirmingPreview(false);
      setIsChangePreviewLoading(false);
    }
  }, [noticeKind, refreshOpenChangePreview, supabase]);
  const reload = useCallback(() => window.location.reload(), []);

  return {
    noticeKind,
    isTripMasterLocked: noticeKind === "revoked",
    isChangePreviewOpen,
    isChangePreviewLoading,
    isConfirmingPreview,
    changePreviewSummary,
    changePreviewError,
    hasNewChangesDuringPreview,
    checkForRemoteTripChange,
    openChangePreview,
    closeChangePreview,
    showConflict,
    confirmNotice,
    reload,
    sourceClientId: APP_SOURCE_CLIENT_ID,
  };
};
