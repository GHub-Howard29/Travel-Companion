import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getChecklistProgress,
  toggleChecklistItem as toggleChecklistItemProgress,
} from "../services/checklistService";
import {
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
  const canSyncToCloud = canSyncSharedChecklist && isOnline;

  const checkedItemIds = useMemo(
    () =>
      checkedItemIdsByTripId[tripId] ??
      getChecklistProgress(tripId).checkedItemIds,
    [checkedItemIdsByTripId, tripId],
  );
  const items = useMemo(() => {
    if (!canSyncSharedChecklist) {
      return mapSeedItemsToSharedItems(tripId, seedItems, checkedItemIds);
    }

    return (
      cloudItemsByTripId[tripId] ??
      mapSeedItemsToSharedItems(tripId, seedItems, checkedItemIds)
    );
  }, [
    canSyncSharedChecklist,
    checkedItemIds,
    cloudItemsByTripId,
    seedItems,
    tripId,
  ]);

  useEffect(() => {
    if (!canSyncToCloud) {
      return;
    }

    let isActive = true;

    const syncInitialChecklist = async () => {
      const syncStartMutationRevision = localMutationRevisionRef.current;
      setSyncStatus("syncing");
      setSyncError(null);

      try {
        const localProgress = getChecklistProgress(tripId);
        const pendingOrder = userEmail
          ? readPendingSharedChecklistOrder(tripId, userEmail)
          : null;
        if (pendingOrder) {
          setSyncStatus("local");
          return;
        }
        const pendingProgress = userEmail
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
          const syncedCloudChecklist = await syncCloudSharedChecklistSeedItems(
            supabase,
            tripId,
            seedItems,
            pendingProgress?.checkedItemIds ?? localProgress.checkedItemIds,
            Boolean(pendingProgress),
          );

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

          if (pendingProgress && userEmail) {
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
  }, [canSyncToCloud, seedItems, supabase, tripId, userEmail]);

  const toggleChecklistItem = useCallback((itemId: string) => {
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
          });
      }

      return {
        ...currentItemsByTripId,
        [tripId]: nextItems,
      };
    });
  }, [
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
    syncStatus: canSyncToCloud ? syncStatus : "local",
    syncError: canSyncToCloud ? syncError : null,
    toggleChecklistItem,
    reorderChecklistItems,
  };
};
