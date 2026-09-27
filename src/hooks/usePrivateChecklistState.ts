import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PrivateChecklist, PrivateChecklistItem } from "../types";
import {
  createPrivateChecklistItem,
  deletePrivateChecklistItem,
  getPrivateChecklist,
  updatePrivateChecklistItem,
} from "../services/privateChecklistService";
import {
  getCloudPrivateChecklist,
  getCloudPrivateChecklistId,
  syncPrivateChecklistWithCloud,
} from "../services/privateChecklistCloudService";
import {
  markPrivateChecklistPending,
  writeStoredPrivateChecklist,
} from "../storage/privateChecklistStorage";

const normalizeUserEmail = (userEmail: string | null): string => {
  return userEmail?.trim().toLowerCase() ?? "";
};

export const usePrivateChecklistState = (
  tripId: string,
  userEmail: string | null,
  supabase: SupabaseClient,
  canSyncPrivateChecklist: boolean,
  isOnline: boolean,
) => {
  const [itemsByScope, setItemsByScope] = useState<
    Record<string, PrivateChecklistItem[]>
  >({});
  const [syncStatus, setSyncStatus] = useState<
    "local" | "syncing" | "synced" | "emptyCloud" | "error"
  >("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const ownerEmail = normalizeUserEmail(userEmail);
  const canUsePrivateChecklist = Boolean(tripId && ownerEmail);
  const canSyncToCloud =
    canUsePrivateChecklist && canSyncPrivateChecklist && isOnline;
  const scopeKey = `${tripId}:${ownerEmail}`;
  const pendingReorderRef = useRef<PrivateChecklist | null>(null);
  const reorderTimerRef = useRef<number | null>(null);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const [realtimeChecklistScope, setRealtimeChecklistScope] = useState<{
    tripId: string;
    ownerEmail: string;
    checklistId: string | null;
  } | null>(null);
  const realtimeChecklistId =
    realtimeChecklistScope?.tripId === tripId &&
    realtimeChecklistScope.ownerEmail === ownerEmail
      ? realtimeChecklistScope.checklistId
      : null;
  const items = useMemo(
    () =>
      canUsePrivateChecklist
        ? itemsByScope[scopeKey] ??
          getPrivateChecklist(tripId, ownerEmail).items
        : [],
    [canUsePrivateChecklist, itemsByScope, ownerEmail, scopeKey, tripId],
  );

  const syncChecklistToCloud = useCallback(async (
    checklist: PrivateChecklist,
    baseItems: PrivateChecklistItem[],
  ) => {
    markPrivateChecklistPending(checklist, baseItems);
    if (!canSyncToCloud) {
      return;
    }

    setSyncStatus("syncing");
    setSyncError(null);

    try {
      const syncedChecklist = await syncPrivateChecklistWithCloud(
        supabase,
        checklist.tripId,
        checklist.userEmail,
      );
      const syncedScopeKey = `${checklist.tripId}:${checklist.userEmail}`;
      setItemsByScope((currentItemsByScope) => ({
        ...currentItemsByScope,
        [syncedScopeKey]: syncedChecklist.items,
      }));
      setSyncStatus("synced");
    } catch (error) {
      console.warn(error);
      setSyncStatus("error");
      setSyncError("雲端同步失敗，資料已保存在本機。");
    }
  }, [canSyncToCloud, supabase]);

  const applyCloudChecklist = useCallback((checklist: PrivateChecklist) => {
    writeStoredPrivateChecklist(checklist);
    setItemsByScope((currentItemsByScope) => ({
      ...currentItemsByScope,
      [scopeKey]: checklist.items,
    }));
  }, [scopeKey]);

  const syncLatestChecklist = useCallback(async () => {
    if (!canSyncToCloud) {
      return;
    }

    setSyncStatus("syncing");
    setSyncError(null);

    const latestChecklist = await syncPrivateChecklistWithCloud(
      supabase,
      tripId,
      ownerEmail,
    );
    applyCloudChecklist(latestChecklist);
  }, [applyCloudChecklist, canSyncToCloud, ownerEmail, supabase, tripId]);

  const reloadPrivateChecklistFromCloud = useCallback(async () => {
    if (!canSyncToCloud) {
      return;
    }

    const cloudChecklist = await getCloudPrivateChecklist(
      supabase,
      tripId,
      ownerEmail,
    );
    if (!cloudChecklist) return;

    applyCloudChecklist(cloudChecklist);
    setSyncStatus("synced");
    setSyncError(null);
  }, [
    applyCloudChecklist,
    canSyncToCloud,
    ownerEmail,
    supabase,
    tripId,
  ]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void reloadPrivateChecklistFromCloud().catch((error) => {
        console.warn(error);
        setSyncStatus("error");
        setSyncError("雲端同步失敗，資料已保存在本機。");
      });
    }, 350);
  }, [reloadPrivateChecklistFromCloud]);

  useEffect(() => {
    if (!canSyncToCloud) {
      return;
    }

    let isActive = true;
    const resolveChecklistId = async () => {
      try {
        const checklistId = await getCloudPrivateChecklistId(supabase, tripId);
        if (isActive) {
          setRealtimeChecklistScope({ tripId, ownerEmail, checklistId });
        }
      } catch (error) {
        console.warn(error);
      }
    };

    void resolveChecklistId();

    const channel = supabase
      .channel(`travel-companion-private-checklist-${tripId}-${ownerEmail}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklists",
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          void resolveChecklistId();
          scheduleRealtimeRefresh();
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [
    canSyncToCloud,
    ownerEmail,
    scheduleRealtimeRefresh,
    supabase,
    tripId,
  ]);

  useEffect(() => {
    if (!canSyncToCloud || !realtimeChecklistId) return;

    const channel = supabase
      .channel(`travel-companion-private-checklist-items-${realtimeChecklistId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_items",
          filter: `checklist_id=eq.${realtimeChecklistId}`,
        },
        scheduleRealtimeRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    canSyncToCloud,
    realtimeChecklistId,
    scheduleRealtimeRefresh,
    supabase,
  ]);

  useEffect(() => () => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
  }, []);

  const flushPendingReorder = useCallback(async () => {
    if (reorderTimerRef.current !== null) {
      window.clearTimeout(reorderTimerRef.current);
      reorderTimerRef.current = null;
    }

    const pendingChecklist = pendingReorderRef.current;
    if (!pendingChecklist) return;

    pendingReorderRef.current = null;
    await syncChecklistToCloud(pendingChecklist, []);
  }, [syncChecklistToCloud]);

  const deferReorderSync = useCallback((
    checklist: PrivateChecklist,
    baseItems: PrivateChecklistItem[],
  ) => {
    markPrivateChecklistPending(checklist, baseItems);
    if (!canSyncToCloud) return;

    pendingReorderRef.current = checklist;
    if (reorderTimerRef.current !== null) {
      window.clearTimeout(reorderTimerRef.current);
    }
    reorderTimerRef.current = window.setTimeout(() => {
      void flushPendingReorder();
    }, 800);
  }, [canSyncToCloud, flushPendingReorder]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingReorder();
      }
    };

    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      void flushPendingReorder();
    };
  }, [flushPendingReorder]);

  useEffect(() => {
    if (!canSyncToCloud) {
      return;
    }

    let isActive = true;

    const syncInitialChecklist = async () => {
      setSyncStatus("syncing");
      setSyncError(null);

      try {
        await syncLatestChecklist();

        if (!isActive) {
          return;
        }

        if (isActive) {
          setSyncStatus("synced");
        }
      } catch (error) {
        console.warn(error);
        if (isActive) {
          setSyncStatus("error");
          setSyncError("雲端同步失敗，資料已保存在本機。");
        }
      }
    };

    void syncInitialChecklist();

    return () => {
      isActive = false;
    };
  }, [canSyncToCloud, syncLatestChecklist]);

  useEffect(() => {
    if (!canSyncToCloud) {
      return;
    }

    const syncWhenActive = () => {
      if (document.visibilityState === "visible") {
        void syncLatestChecklist()
          .then(() => setSyncStatus("synced"))
          .catch((error) => {
            console.warn(error);
            setSyncStatus("error");
            setSyncError("雲端同步失敗，資料已保存在本機。");
          });
      }
    };

    window.addEventListener("focus", syncWhenActive);
    document.addEventListener("visibilitychange", syncWhenActive);
    return () => {
      window.removeEventListener("focus", syncWhenActive);
      document.removeEventListener("visibilitychange", syncWhenActive);
    };
  }, [canSyncToCloud, syncLatestChecklist]);

  const addItem = useCallback((label: string) => {
    if (!canUsePrivateChecklist) {
      return;
    }

    const nextChecklist = createPrivateChecklistItem(
      tripId,
      ownerEmail,
      label,
      items,
    );

    setItemsByScope((currentItemsByScope) => {
      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
    void syncChecklistToCloud(nextChecklist, items);
  }, [
    canUsePrivateChecklist,
    items,
    ownerEmail,
    scopeKey,
    syncChecklistToCloud,
    tripId,
  ]);

  const toggleItem = useCallback((itemId: string) => {
    if (!canUsePrivateChecklist) {
      return;
    }

    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem) {
      return;
    }

    const nextChecklist = updatePrivateChecklistItem(
      tripId,
      ownerEmail,
      itemId,
      { isChecked: !targetItem.isChecked },
      items,
    );

    setItemsByScope((currentItemsByScope) => {
      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
    void syncChecklistToCloud(nextChecklist, items);
  }, [
    canUsePrivateChecklist,
    items,
    ownerEmail,
    scopeKey,
    syncChecklistToCloud,
    tripId,
  ]);

  const renameItem = useCallback((itemId: string, label: string) => {
    if (!canUsePrivateChecklist) {
      return;
    }

    const nextChecklist = updatePrivateChecklistItem(
      tripId,
      ownerEmail,
      itemId,
      { label },
      items,
    );

    setItemsByScope((currentItemsByScope) => {
      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
    void syncChecklistToCloud(nextChecklist, items);
  }, [
    canUsePrivateChecklist,
    items,
    ownerEmail,
    scopeKey,
    syncChecklistToCloud,
    tripId,
  ]);

  const removeItem = useCallback((itemId: string) => {
    if (!canUsePrivateChecklist) {
      return;
    }

    const nextChecklist = deletePrivateChecklistItem(
      tripId,
      ownerEmail,
      itemId,
      items,
    );

    setItemsByScope((currentItemsByScope) => {
      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
    void syncChecklistToCloud(nextChecklist, items);
  }, [
    canUsePrivateChecklist,
    items,
    ownerEmail,
    scopeKey,
    syncChecklistToCloud,
    tripId,
  ]);

  const replaceItems = useCallback((labels: string[]) => {
    if (!canUsePrivateChecklist) {
      return;
    }

    const now = new Date().toISOString();
    const nextChecklist: PrivateChecklist = {
      tripId,
      userEmail: ownerEmail,
      items: labels
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => ({
          id: crypto.randomUUID(),
          tripId,
          userEmail: ownerEmail,
          label,
          isChecked: false,
          createdAt: now,
          updatedAt: now,
        })),
      updatedAt: now,
    };

    writeStoredPrivateChecklist(nextChecklist);
    setItemsByScope((currentItemsByScope) => ({
      ...currentItemsByScope,
      [scopeKey]: nextChecklist.items,
    }));
    void syncChecklistToCloud(nextChecklist, items);
  }, [
    canUsePrivateChecklist,
    items,
    ownerEmail,
    scopeKey,
    syncChecklistToCloud,
    tripId,
  ]);

  const reorderItems = useCallback((nextItems: PrivateChecklistItem[]) => {
    if (!canUsePrivateChecklist) return;

    const nextChecklist: PrivateChecklist = {
      tripId,
      userEmail: ownerEmail,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    };
    writeStoredPrivateChecklist(nextChecklist);
    setItemsByScope((currentItemsByScope) => ({
      ...currentItemsByScope,
      [scopeKey]: nextItems,
    }));
    deferReorderSync(nextChecklist, items);
  }, [canUsePrivateChecklist, deferReorderSync, items, ownerEmail, scopeKey, tripId]);

  return {
    items,
    syncStatus: canSyncToCloud ? syncStatus : "local",
    syncError: canSyncToCloud ? syncError : null,
    addItem,
    toggleItem,
    renameItem,
    removeItem,
    replaceItems,
    reorderItems,
    flushPendingReorder,
  };
};
