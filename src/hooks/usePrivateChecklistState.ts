import { useCallback, useMemo, useState } from "react";

import type { PrivateChecklistItem } from "../types";
import {
  createPrivateChecklistItem,
  deletePrivateChecklistItem,
  getPrivateChecklist,
  updatePrivateChecklistItem,
} from "../services/privateChecklistService";

export const usePrivateChecklistState = (tripId: string, userId: string) => {
  const [itemsByScope, setItemsByScope] = useState<
    Record<string, PrivateChecklistItem[]>
  >({});
  const scopeKey = `${tripId}:${userId}`;
  const items = useMemo(
    () => itemsByScope[scopeKey] ?? getPrivateChecklist(tripId, userId).items,
    [itemsByScope, scopeKey, tripId, userId],
  );

  const addItem = useCallback((label: string) => {
    setItemsByScope((currentItemsByScope) => {
      const currentItems =
        currentItemsByScope[scopeKey] ??
        getPrivateChecklist(tripId, userId).items;
      const nextChecklist = createPrivateChecklistItem(
        tripId,
        userId,
        label,
        currentItems,
      );

      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
  }, [scopeKey, tripId, userId]);

  const toggleItem = useCallback((itemId: string) => {
    setItemsByScope((currentItemsByScope) => {
      const currentItems =
        currentItemsByScope[scopeKey] ??
        getPrivateChecklist(tripId, userId).items;
      const targetItem = currentItems.find((item) => item.id === itemId);

      if (!targetItem) {
        return currentItemsByScope;
      }

      const nextChecklist = updatePrivateChecklistItem(
        tripId,
        userId,
        itemId,
        { isChecked: !targetItem.isChecked },
        currentItems,
      );

      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
  }, [scopeKey, tripId, userId]);

  const renameItem = useCallback((itemId: string, label: string) => {
    setItemsByScope((currentItemsByScope) => {
      const currentItems =
        currentItemsByScope[scopeKey] ??
        getPrivateChecklist(tripId, userId).items;
      const nextChecklist = updatePrivateChecklistItem(
        tripId,
        userId,
        itemId,
        { label },
        currentItems,
      );

      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
  }, [scopeKey, tripId, userId]);

  const removeItem = useCallback((itemId: string) => {
    setItemsByScope((currentItemsByScope) => {
      const currentItems =
        currentItemsByScope[scopeKey] ??
        getPrivateChecklist(tripId, userId).items;
      const nextChecklist = deletePrivateChecklistItem(
        tripId,
        userId,
        itemId,
        currentItems,
      );

      return {
        ...currentItemsByScope,
        [scopeKey]: nextChecklist.items,
      };
    });
  }, [scopeKey, tripId, userId]);

  return {
    items,
    addItem,
    toggleItem,
    renameItem,
    removeItem,
  };
};
