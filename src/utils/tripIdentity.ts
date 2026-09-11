export const createTripId = (): string =>
  `trip-${globalThis.crypto.randomUUID()}`;
