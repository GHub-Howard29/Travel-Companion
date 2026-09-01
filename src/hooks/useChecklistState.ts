import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getChecklistProgress,
  toggleChecklistItem as toggleChecklistItemProgress,
} from "../services/checklistService";
import {
  getCloudSharedChecklistId,
  getCloudSharedChecklist,
  initializeCloudSharedChecklist,
  syncCloudSharedChecklistSeedItems,
  updateCloudSharedChecklistItemChecked,
} from "../services/sharedChecklistCloudService";
import { writeStoredChecklistProgress } from "../storage/checklistStorage";
import {
  clearPendingSharedChecklistProgress,
  readPendingSharedChecklistOrder,
  readPendingSharedChecklistProgress,
  writePendingSharedChecklistProgress,
} from "../storage/sharedChecklistSyncStorage";
import type { ChecklistItem, SharedChecklistItem } from "../types";

const mapSeedItemsToSharedItems = (
  tripId: string,
  seedItems: ChecklistItem[],
  checkedItemIds: string[],
): SharedChecklistItem[] => {
  const checkedItemIdSet = new Set(checkedItemIds);
  const now = new Date().toISOString();

  return seedItems.map((item, sortOrder) => ({
    id: item.id,
    tripId,
    category: item.category,
    label: item.label,
    isChecked: checkedItemIdSet.has(item.id),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }));
};

export const useChecklistState = (
  tripId: string,
  seedItems: ChecklistItem[],
  supabase: SupabaseClient,
  canReadCloudSharedChecklist: boolean,
  canSyncSharedChecklist: boolean,
  isOnline: boolean,
  userEmail: string | null,
) => {
  const [checkedItemIdsByTripId, setCheckedItemIdsByTripId] = useState<
    Record<string, string[]>
  >({});
  const [cloudItemsByTripId, setCloudItemsByTripId] = useState<
    Record<string, SharedChecklistItem[]>
  >({});
  const [syncStatus, setSyncStatus] = useState<
    "local" | "syncing" | "synced" | "error"
  >("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const localMutationRevisionRef = useRef(0);
  const initialSyncPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const cloudWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isCloudWritePendingRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const [realtimeChecklistScope, setRealtimeChecklistScope] = useState<{
    tripId: string;
    checklistId: string | null;
  } | null>(null);
  const realtimeChecklistId =
    realtimeChecklistScope?.tripId === tripId
      ? realtimeChecklistScope.checklistId
      : null;
  const canSyncToCloud = canSyncSharedChecklist && isOnline;
  const canReadCloud = canReadCloudSharedChecklist && isOnline;

  const checkedItemIds = useMemo(
    () =>
      checkedItemIdsByTripId[tripId] ??
      getChecklistProgress(tripId).checkedItemIds,
    [checkedItemIdsByTripId, tripId],
  );
  const items = useMemo(() => {
    if (!canReadCloudSharedChecklist) {
      return mapSeedItemsToSharedItems(tripId, seedItems, checkedItemIds);
    }

    return (
      cloudItemsByTripId[tripId] ??
      mapSeedItemsToSharedItems(tripId, seedItems, checkedItemIds)
    );
  }, [
    canReadCloudSharedChecklist,
    checkedItemIds,
    cloudItemsByTripId,
    seedItems,
    tripId,
  ]);

  useEffect(() => {
    if (!canReadCloud) {
      return;
    }

    let isActive = true;

    const syncInitialChecklist = async () => {
      const syncStartMutationRevision = localMutationRevisionRef.current;
      setSyncStatus("syncing");
      setSyncError(null);

      try {
        const localProgress = getChecklistProgress(tripId);
        const pendingOrder = canSyncSharedChecklist && userEmail
          ? readPendingSharedChecklistOrder(tripId, userEmail)
          : null;
        if (pendingOrder) {
          setSyncStatus("local");
          return;
        }
        const pendingProgress = canSyncSharedChecklist && userEmail
          ? readPendingSharedChecklistProgress(tripId, userEmail)
          : null;
        const cloudChecklist = await getCloudSharedChecklist(
          supabase,
          tripId,
          seedItems,
        );

        if (!isActive) {
          return;
        }

        if (cloudChecklist) {
          const syncedCloudChecklist = canSyncToCloud
            ? await syncCloudSharedChecklistSeedItems(
                supabase,
                tripId,
                seedItems,
                pendingProgress?.checkedItemIds ?? localProgress.checkedItemIds,
                Boolean(pendingProgress),
              )
            : null;

          if (!isActive) {
            return;
          }

          // The cloud request may have started before the user toggled an
          // item. Never let that older snapshot replace a newer optimistic
          // state; the queued toggle write below will be the final cloud
          // operation.
          if (localMutationRevisionRef.current !== syncStartMutationRevision) {
            return;
          }

          const nextCloudChecklist = syncedCloudChecklist ?? cloudChecklist;
          const nextCheckedItemIds = nextCloudChecklist.items
            .filter((item) => item.isChecked)
            .map((item) => item.id);

          if (canSyncToCloud && pendingProgress && userEmail) {
            clearPendingSharedChecklistProgress(
              tripId,
              userEmail,
              pendingProgress.revision,
            );
          }

          setCheckedItemIdsByTripId((currentIdsByTripId) => {
            if (currentIdsByTripId[tripId]) {
              return currentIdsByTripId;
            }

            writeStoredChecklistProgress({
              tripId,
              checkedItemIds: nextCheckedItemIds,
              updatedAt: nextCloudChecklist.updatedAt,
            });

            return {
              ...currentIdsByTripId,
              [tripId]: nextCheckedItemIds,
            };
          });
          setCloudItemsByTripId((currentItemsByTripId) => ({
            ...currentItemsByTripId,
            [tripId]: nextCloudChecklist.items,
          }));
        } else if (canSyncToCloud) {
          const initializedChecklist = await initializeCloudSharedChecklist(
            supabase,
            tripId,
            seedItems,
            localProgress.checkedItemIds,
          );

          if (!isActive) {
            return;
          }

          if (localMutationRevisionRef.current !== syncStartMutationRevision) {
            return;
          }

          if (initializedChecklist) {
            setCloudItemsByTripId((currentItemsByTripId) => ({
              ...currentItemsByTripId,
              [tripId]: currentItemsByTripId[tripId] ?? initializedChecklist.items,
            }));
          }
        }

        if (
          isActive &&
          localMutationRevisionRef.current === syncStartMutationRevision
        ) {
          setSyncStatus("synced");
        }
      } catch (error) {
        console.warn(error);
        if (isActive) {
          setSyncStatus("error");
          setSyncError("共同檢查清單雲端同步失敗，暫時使用本機資料。");
        }
      }
    };

    const initialSyncPromise = syncInitialChecklist();
    initialSyncPromiseRef.current = initialSyncPromise;
    void initialSyncPromise;

    return () => {
      isActive = false;
    };
  }, [
    canReadCloud,
    canSyncSharedChecklist,
    canSyncToCloud,
    seedItems,
    supabase,
    tripId,
    userEmail,
  ]);

  const reloadSharedChecklistFromCloud = useCallback(async () => {
    if (!canReadCloud || isCloudWritePendingRef.current) return;
    if (
      canSyncSharedChecklist && userEmail &&
      (readPendingSharedChecklistOrder(tripId, userEmail) ||
        readPendingSharedChecklistProgress(tripId, userEmail))
    ) {
      return;
    }

    const mutationRevision = localMutationRevisionRef.current;
    const cloudChecklist = await getCloudSharedChecklist(supabase, tripId, seedItems);
    if (
      !cloudChecklist ||
      isCloudWritePendingRef.current ||
      localMutationRevisionRef.current !== mutationRevision ||
      (canSyncSharedChecklist && userEmail &&
        (readPendingSharedChecklistOrder(tripId, userEmail) ||
          readPendingSharedChecklistProgress(tripId, userEmail)))
    ) {
      return;
    }

    const nextCheckedItemIds = cloudChecklist.items
      .filter((item) => item.isChecked)
      .map((item) => item.id);
    writeStoredChecklistProgress({
      tripId,
      checkedItemIds: nextCheckedItemIds,
      updatedAt: cloudChecklist.updatedAt,
    });
    setCheckedItemIdsByTripId((current) => ({
      ...current,
      [tripId]: nextCheckedItemIds,
    }));
    setCloudItemsByTripId((current) => ({
      ...current,
      [tripId]: cloudChecklist.items,
    }));
    setSyncStatus("synced");
  }, [
    canReadCloud,
    canSyncSharedChecklist,
    seedItems,
    supabase,
    tripId,
    userEmail,
  ]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void reloadSharedChecklistFromCloud().catch(console.warn);
    }, 400);
  }, [reloadSharedChecklistFromCloud]);

  useEffect(() => {
    if (!canReadCloud) return;

    let isActive = true;
    const resolveChecklistId = async () => {
      try {
        const checklistId = await getCloudSharedChecklistId(supabase, tripId);
        if (isActive) {
          setRealtimeChecklistScope({ tripId, checklistId });
        }
      } catch (error) {
        console.warn(error);
      }
    };
    void resolveChecklistId();

    const channel = supabase
      .channel(`travel-companion-shared-checklist-${tripId}`)
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
  }, [canReadCloud, scheduleRealtimeRefresh, supabase, tripId]);

  useEffect(() => {
    if (!canReadCloud || !realtimeChecklistId) return;

    const channel = supabase
      .channel(`travel-companion-shared-checklist-items-${realtimeChecklistId}`)
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
    canReadCloud,
    realtimeChecklistId,
    scheduleRealtimeRefresh,
    supabase,
  ]);

  useEffect(() => () => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
  }, []);

  const toggleChecklistItem = useCallback((itemId: string) => {
    if (!canSyncSharedChecklist) return;
    const mutationRevision = localMutationRevisionRef.current + 1;
    localMutationRevisionRef.current = mutationRevision;

    setCheckedItemIdsByTripId((currentIdsByTripId) => {
      const currentIds =
        currentIdsByTripId[tripId] ??
        getChecklistProgress(tripId).checkedItemIds;
      const nextProgress = toggleChecklistItemProgress(
        tripId,
        itemId,
        currentIds,
      );

      return {
        ...currentIdsByTripId,
        [tripId]: nextProgress.checkedItemIds,
      };
    });

    setCloudItemsByTripId((currentItemsByTripId) => {
      const currentItems =
        currentItemsByTripId[tripId] ??
        mapSeedItemsToSharedItems(tripId, seedItems, checkedItemIds);
      const targetItem = currentItems.find((item) => item.id === itemId);

      if (!targetItem) {
        return currentItemsByTripId;
      }

      const nextIsChecked = !targetItem.isChecked;
      const nextItems = currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              isChecked: nextIsChecked,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      const nextCheckedItemIds = nextItems
        .filter((item) => item.isChecked)
        .map((item) => item.id);
      const pendingProgress = userEmail
        ? writePendingSharedChecklistProgress(
            tripId,
            userEmail,
            nextCheckedItemIds,
          )
        : null;

      if (canSyncToCloud) {
        setSyncStatus("syncing");
        setSyncError(null);
        isCloudWritePendingRef.current = true;
        const writeOperation = cloudWriteQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            // Serialize the user's cloud write after the in-flight initial
            // read and all earlier toggles. The newest click therefore stays
            // last even if network responses would otherwise arrive out of
            // order.
            await initialSyncPromiseRef.current;

            const didUpdate = await updateCloudSharedChecklistItemChecked(
              supabase,
              tripId,
              itemId,
              nextIsChecked,
            );

            if (!didUpdate) {
              await initializeCloudSharedChecklist(
                supabase,
                tripId,
                seedItems,
                nextCheckedItemIds,
              );
              await updateCloudSharedChecklistItemChecked(
                supabase,
                tripId,
                itemId,
                nextIsChecked,
              );
            }
          });
        cloudWriteQueueRef.current = writeOperation;

        void writeOperation
          .then(() => {
            if (pendingProgress && userEmail) {
              clearPendingSharedChecklistProgress(
                tripId,
                userEmail,
                pendingProgress.revision,
              );
            }
            if (localMutationRevisionRef.current === mutationRevision) {
              setSyncStatus("synced");
            }
          })
          .catch((error) => {
            console.warn(error);
            if (localMutationRevisionRef.current === mutationRevision) {
              setSyncStatus("error");
              setSyncError("共同檢查清單雲端同步失敗，變更已保存在本機。");
            }
          })
          .finally(() => {
            if (localMutationRevisionRef.current === mutationRevision) {
              isCloudWritePendingRef.current = false;
            }
          });
      }

      return {
        ...currentItemsByTripId,
        [tripId]: nextItems,
      };
    });
  }, [
    canSyncSharedChecklist,
    canSyncToCloud,
    checkedItemIds,
    seedItems,
    supabase,
    tripId,
    userEmail,
  ]);

  const reorderChecklistItems = useCallback((nextSeedItems: ChecklistItem[]) => {
    setCloudItemsByTripId((currentItemsByTripId) => {
      const currentItems =
        currentItemsByTripId[tripId] ??
        mapSeedItemsToSharedItems(tripId, seedItems, checkedItemIds);
      const currentItemsById = new Map(currentItems.map((item) => [item.id, item]));
      const now = new Date().toISOString();

      return {
        ...currentItemsByTripId,
        [tripId]: nextSeedItems.map((seedItem, sortOrder) => ({
          ...(currentItemsById.get(seedItem.id) ?? {
            id: seedItem.id,
            tripId,
            isChecked: checkedItemIds.includes(seedItem.id),
            createdAt: now,
            updatedAt: now,
          }),
          category: seedItem.category,
          label: seedItem.label,
          sortOrder,
        })),
      };
    });
  }, [checkedItemIds, seedItems, tripId]);

  return {
    items,
    checkedItemIds,
    syncStatus: canReadCloud ? syncStatus : "local",
    syncError: canReadCloud ? syncError : null,
    toggleChecklistItem,
    reorderChecklistItems,
  };
};
