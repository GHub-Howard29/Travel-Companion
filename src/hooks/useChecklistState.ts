import { useCallback, useMemo, useState } from "react";

import {
  getChecklistProgress,
  toggleChecklistItem as toggleChecklistItemProgress,
} from "../services/checklistService";

export const useChecklistState = (tripId: string) => {
  const [checkedItemIdsByTripId, setCheckedItemIdsByTripId] = useState<
    Record<string, string[]>
  >({});

  const checkedItemIds = useMemo(
    () =>
      checkedItemIdsByTripId[tripId] ??
      getChecklistProgress(tripId).checkedItemIds,
    [checkedItemIdsByTripId, tripId],
  );

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
  }, [tripId]);

  return {
    checkedItemIds,
    toggleChecklistItem,
  };
};
