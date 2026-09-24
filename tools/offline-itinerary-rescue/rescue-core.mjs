import { createHash } from "node:crypto";

export const TARGET_ORIGIN = "https://ghub-howard29.github.io";
export const TRIP_STORAGE_KEY = "travel_companion_custom_trips";
export const DEFAULT_TRIP_ID = "group-tour-2026-10";

export const decodeChromiumStorageString = (input) => {
  const value = Buffer.from(input);
  if (value.length === 0) return "";
  if (value[0] === 0) {
    if ((value.length - 1) % 2 !== 0) throw new Error("UTF-16 localStorage 資料長度不正確");
    return value.subarray(1).toString("utf16le");
  }
  if (value[0] === 1) return value.subarray(1).toString("latin1");
  throw new Error(`未知的 localStorage 字串格式：${value[0]}`);
};

export const encodeChromiumStorageString = (value) => {
  const canUseLatin1 = [...value].every((character) => character.codePointAt(0) <= 0xff);
  return canUseLatin1
    ? Buffer.concat([Buffer.from([1]), Buffer.from(value, "latin1")])
    : Buffer.concat([Buffer.from([0]), Buffer.from(value, "utf16le")]);
};

export const parseChromiumLocalStorageEntry = (rawKey, rawValue) => {
  const key = Buffer.from(rawKey);
  if (key[0] !== 0x5f) return null;
  const separatorIndex = key.indexOf(0, 1);
  if (separatorIndex < 0) return null;
  const storageKey = key.subarray(1, separatorIndex).toString("utf8");
  return {
    storageKey,
    key: decodeChromiumStorageString(key.subarray(separatorIndex + 1)),
    value: decodeChromiumStorageString(rawValue),
  };
};

export const buildChromiumLocalStorageKey = (
  key,
  storageKey = TARGET_ORIGIN,
) => Buffer.concat([
  Buffer.from(`_${storageKey}\0`, "utf8"),
  encodeChromiumStorageString(key),
]);

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const parseTargetTrip = (rawValue, tripId = DEFAULT_TRIP_ID) => {
  const records = JSON.parse(rawValue);
  if (!Array.isArray(records)) throw new Error("Trip 本機資料不是陣列");
  const record = records.find((item) => item?.meta?.id === tripId && item?.detail?.id === tripId);
  if (!record) return null;
  const daysData = record.detail?.content?.daysData;
  if (!daysData || typeof daysData !== "object" || Array.isArray(daysData)) {
    throw new Error(`Trip ${tripId} 缺少有效的 daysData`);
  }
  const summary = Object.entries(daysData)
    .filter(([day, items]) => /^[1-9]\d*$/.test(day) && Array.isArray(items))
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([day, items]) => ({
      day: Number(day),
      cardCount: items.length,
      titles: items.map((item) => typeof item?.title === "string" ? item.title : "（無標題）"),
    }));
  const payload = {
    tripId,
    title: record.meta?.title ?? record.detail?.title ?? "",
    departureDate: record.meta?.departureDate ?? record.detail?.departureDate ?? "",
    localUpdatedAt: record.updatedAt ?? null,
    cloudUpdatedAt: record.cloudUpdatedAt ?? null,
    daysData,
  };
  return {
    payload,
    summary,
    daysDataSha256: sha256(Buffer.from(JSON.stringify(daysData), "utf8")),
    sourceValueSha256: sha256(Buffer.from(rawValue, "utf8")),
  };
};
