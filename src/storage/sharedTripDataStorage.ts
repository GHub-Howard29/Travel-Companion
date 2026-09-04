import { clearStoredChecklistProgress } from "./checklistStorage";
import { clearExchangePurchases } from "./exchangeRateStorage";
import { readStoredExpenses } from "./expenseStorage";
import { clearStoredFolders } from "./folderStorage";
import { clearStoredOtherInfoItems } from "./otherInfoStorage";
import { clearOtherInfoSyncState, readOtherInfoSyncState } from "./otherInfoSyncStorage";
import {
  clearPendingSharedChecklistOrder,
  clearPendingSharedChecklistProgress,
  readPendingSharedChecklistOrder,
  readPendingSharedChecklistProgress,
} from "./sharedChecklistSyncStorage";
import { clearUserSharedChecklist } from "./userSharedChecklistStorage";
import { deleteLocalAttachmentsForTrip } from "./attachmentStorage";
import {
  deleteStoredTripRecord,
  removeRestrictedOtherInfoFromStoredTrip,
} from "./tripStorage";

const removeOfflineExpensesForTrip = (tripId: string): void => {
  const remaining = readStoredExpenses("offline_expenses", "", "TWD").filter(
    (item) => item.trip_id !== tripId,
  );
  localStorage.setItem("offline_expenses", JSON.stringify(remaining));
};

export const clearSharedTripDataAfterAccessLoss = async (
  tripId: string,
  userEmail: string,
  tripWasDeleted = false,
): Promise<void> => {
  localStorage.removeItem(`auth_${tripId}`);
  localStorage.removeItem(`admin_profile_${tripId}`);
  localStorage.removeItem(`cached_expenses_${tripId}`);
  localStorage.removeItem(`attachment_last_sync_${tripId}`);
  removeOfflineExpensesForTrip(tripId);

  clearStoredChecklistProgress(tripId);
  clearUserSharedChecklist(tripId, userEmail);
  clearStoredFolders(tripId);
  clearStoredOtherInfoItems(tripId);
  if (tripWasDeleted) {
    deleteStoredTripRecord(tripId);
  } else {
    removeRestrictedOtherInfoFromStoredTrip(tripId);
  }
  clearExchangePurchases(tripId, "cloud");
  localStorage.removeItem(
    `travel_companion_exchange_rate_cloud_initialized_${tripId}`,
  );

  const pendingOrder = readPendingSharedChecklistOrder(tripId, userEmail);
  if (pendingOrder) {
    clearPendingSharedChecklistOrder(tripId, userEmail, pendingOrder.revision);
  }
  const pendingProgress = readPendingSharedChecklistProgress(tripId, userEmail);
  if (pendingProgress) {
    clearPendingSharedChecklistProgress(
      tripId,
      userEmail,
      pendingProgress.revision,
    );
  }
  const otherInfoSync = readOtherInfoSyncState(tripId);
  if (otherInfoSync) {
    clearOtherInfoSyncState(tripId, otherInfoSync.revision);
  }

  await deleteLocalAttachmentsForTrip(tripId);
};
