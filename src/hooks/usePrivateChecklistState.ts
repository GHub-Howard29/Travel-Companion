import { useCallback, useEffect, useMemo, useState } from "react";
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
  pushPrivateChecklistToCloud,
} from "../services/privateChecklistCloudService";
import { writeStoredPrivateChecklist } from "../storage/privateChecklistStorage";

const normalizeUserEmail = (userEmail: string | null): string => {
  return userEmail?.trim().toLowerCase() ?? "";
};

export const usePrivateChecklistState = (
  tripId: string,
  userEmail: string | null,
  supabase: SupabaseClient,
  canSyncPrivateChecklist: boolean,
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
  const canSyncToCloud = canUsePrivateChecklist && canSyncPrivateChecklist;
  const scopeKey = `${tripId}:${ownerEmail}`;
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
  ) => {
    if (!canSyncToCloud) {
      return;
    }

    setSyncStatus("syncing");
    setSyncError(null);

    try {
      await pushPrivateChecklistToCloud(supabase, checklist);
      setSyncStatus("synced");
    } catch (error) {
      console.warn(error);
      setSyncStatus("error");
      setSyncError("雲端同步失敗，資料已保存在本機。");
    }
  }, [canSyncToCloud, supabase]);

  useEffect(() => {
    if (!canSyncToCloud) {
      return;
    }

    let isActive = true;

    const syncInitialChecklist = async () => {
      setSyncStatus("syncing");
      setSyncError(null);

      try {
        const localChecklist = getPrivateChecklist(tripId, ownerEmail);
        const cloudChecklist = await getCloudPrivateChecklist(
          supabase,
          tripId,
          ownerEmail,
        );

        if (!isActive) {
          return;
        }

        if (
          localChecklist.items.length === 0 &&
          cloudChecklist &&
          cloudChecklist.items.length > 0
        ) {
          writeStoredPrivateChecklist(cloudChecklist);
          setItemsByScope((currentItemsByScope) => ({
            ...currentItemsByScope,
            [scopeKey]: cloudChecklist.items,
          }));
        } else if (
          localChecklist.items.length === 0 &&
          cloudChecklist &&
          cloudChecklist.items.length === 0
        ) {
          setItemsByScope((currentItemsByScope) => ({
            ...currentItemsByScope,
            [scopeKey]: [],
          }));
          if (isActive) {
            setSyncStatus("emptyCloud");
          }
          return;
        } else {
          await pushPrivateChecklistToCloud(supabase, localChecklist);
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
  }, [canSyncToCloud, ownerEmail, scopeKey, supabase, tripId]);

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
    void syncChecklistToCloud(nextChecklist);
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
    void syncChecklistToCloud(nextChecklist);
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
    void syncChecklistToCloud(nextChecklist);
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
    void syncChecklistToCloud(nextChecklist);
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
    void syncChecklistToCloud(nextChecklist);
  }, [
    canUsePrivateChecklist,
    ownerEmail,
    scopeKey,
    syncChecklistToCloud,
    tripId,
  ]);

  return {
    items,
    syncStatus: canSyncToCloud ? syncStatus : "local",
    syncError: canSyncToCloud ? syncError : null,
    addItem,
    toggleItem,
    renameItem,
    removeItem,
    replaceItems,
  };
};
