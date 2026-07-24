import { useCallback, useEffect, useMemo, useState } from "react";
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
    if (!canSyncSharedChecklist) {
      return;
    }

    let isActive = true;

    const syncInitialChecklist = async () => {
      setSyncStatus("syncing");
      setSyncError(null);

      try {
        const localProgress = getChecklistProgress(tripId);
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
            localProgress.checkedItemIds,
          );

          if (!isActive) {
            return;
          }

          const nextCloudChecklist = syncedCloudChecklist ?? cloudChecklist;
          const nextCheckedItemIds = nextCloudChecklist.items
            .filter((item) => item.isChecked)
            .map((item) => item.id);

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
        } else if (canSyncSharedChecklist) {
          const initializedChecklist = await initializeCloudSharedChecklist(
            supabase,
            tripId,
            seedItems,
            localProgress.checkedItemIds,
          );

          if (!isActive) {
            return;
          }

          if (initializedChecklist) {
            setCloudItemsByTripId((currentItemsByTripId) => ({
              ...currentItemsByTripId,
              [tripId]: currentItemsByTripId[tripId] ?? initializedChecklist.items,
            }));
          }
        }

        if (isActive) {
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

    void syncInitialChecklist();

    return () => {
      isActive = false;
    };
  }, [canSyncSharedChecklist, seedItems, supabase, tripId]);

  const toggleChecklistItem = useCallback((itemId: string) => {
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

      if (canSyncSharedChecklist) {
        setSyncStatus("syncing");
        setSyncError(null);
        void (async () => {
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
        })()
          .then(() => {
            setSyncStatus("synced");
          })
          .catch((error) => {
            console.warn(error);
            setSyncStatus("error");
            setSyncError("共同檢查清單雲端同步失敗，變更已保存在本機。");
          });
      }

      return {
        ...currentItemsByTripId,
        [tripId]: nextItems,
      };
    });
  }, [
    canSyncSharedChecklist,
    checkedItemIds,
    seedItems,
    supabase,
    tripId,
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
    syncStatus: canSyncSharedChecklist ? syncStatus : "local",
    syncError: canSyncSharedChecklist ? syncError : null,
    toggleChecklistItem,
    reorderChecklistItems,
  };
};
