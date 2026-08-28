export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const isPlace = (value: unknown): value is { placeId: string } =>
  isRecord(value) &&
  typeof value.placeId === "string" &&
  /^[A-Za-z0-9_-]{10,300}$/.test(value.placeId);

export const isValidTime = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
};

export const isValidIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(yearText) &&
    date.getUTCMonth() + 1 === Number(monthText) &&
    date.getUTCDate() === Number(dayText);
};

export const parseDurationSeconds = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Math.round(Number(match[1]));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

export const normalizeTransitVehicle = (value: unknown): string => {
  const type = typeof value === "string" ? value : "";
  if (type.includes("BUS") || type === "SHARE_TAXI" || type === "TROLLEYBUS") return "bus";
  if (type === "SUBWAY" || type === "METRO_RAIL" || type === "MONORAIL") return "subway";
  if (type === "TRAM" || type === "CABLE_CAR" || type === "FUNICULAR") return "tram";
  if (type === "FERRY") return "ferry";
  if (type.includes("TRAIN") || type === "RAIL" || type === "HEAVY_RAIL") return "rail";
  return "other";
};
