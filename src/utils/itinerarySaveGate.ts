export type ItinerarySaveResult = { localSaved: boolean; cloudSynced: boolean };

export type ItinerarySaveGateDependencies<T> = {
  canEdit: boolean;
  checkForRemoteTripChange: () => Promise<boolean>;
  save: (trip: T) => Promise<ItinerarySaveResult>;
  showVersionConflict: () => void;
  isVersionConflict: (error: unknown) => boolean;
};

/**
 * Revision notifications are informational and must not act as a write lock.
 * The persistence layer remains responsible for same-trip version conflicts.
 */
export const saveItineraryWithRevisionNotice = async <T>(
  trip: T,
  dependencies: ItinerarySaveGateDependencies<T>,
): Promise<ItinerarySaveResult> => {
  if (!dependencies.canEdit) {
    return { localSaved: false, cloudSynced: false };
  }

  // Refresh revision state so the UI can notify the user, but do not gate save.
  await dependencies.checkForRemoteTripChange();

  try {
    return await dependencies.save(trip);
  } catch (error) {
    if (dependencies.isVersionConflict(error)) {
      dependencies.showVersionConflict();
    }
    throw error;
  }
};
