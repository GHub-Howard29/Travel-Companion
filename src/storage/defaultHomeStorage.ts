const keyFor = (tripId: string, userEmail: string) =>
  `travel_companion_default_home_${tripId}_${userEmail.trim().toLowerCase()}`;

export const getDefaultHomeScreen = (tripId: string, userEmail: string): string | null =>
  localStorage.getItem(keyFor(tripId, userEmail));

export const setDefaultHomeScreen = (
  tripId: string,
  userEmail: string,
  screenId: string,
): void => {
  localStorage.setItem(keyFor(tripId, userEmail), screenId);
};
