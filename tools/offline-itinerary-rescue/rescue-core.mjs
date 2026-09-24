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
  return {
    record,
    summary,
    daysDataSha256: sha256(Buffer.from(JSON.stringify(daysData), "utf8")),
    sourceValueSha256: sha256(Buffer.from(rawValue, "utf8")),
  };
};

const readJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const captureEntry = (entry) => {
  const parsed = readJson(entry.value);
  return {
    sourceKey: entry.key,
    valueSha256: sha256(Buffer.from(entry.value, "utf8")),
    valueFormat: parsed === undefined ? "text" : "json",
    value: parsed === undefined ? entry.value : parsed,
  };
};

const captureMany = (entries, predicate) => entries
  .filter(predicate)
  .map(captureEntry)
  .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

/**
 * 只從同一 Chromium storage partition 的 Local Storage 取出目標 Trip 資料。
 * 登入 session、Supabase token 與其他 Trip 一律不放進救援檔。
 */
export const buildFullTripRescue = (entries, candidate, tripId = DEFAULT_TRIP_ID) => {
  const inPartition = entries.filter((entry) => entry.storageKey === candidate.storageKey);
  const byKey = new Map(inPartition.map((entry) => [entry.key, entry]));
  const one = (key) => {
    const entry = byKey.get(key);
    return entry ? captureEntry(entry) : null;
  };
  const prefix = (keyPrefix) => captureMany(inPartition, (entry) => entry.key.startsWith(keyPrefix));
  const parsed = parseTargetTrip(candidate.value, tripId);
  if (!parsed) return null;

  const cachedExpensePrefix = `cached_expenses_${tripId}`;
  const offlineExpenses = one("offline_expenses");
  let targetOfflineExpenses = null;
  if (offlineExpenses) {
    if (offlineExpenses.valueFormat !== "json" || !Array.isArray(offlineExpenses.value)) {
      throw new Error("Local Storage Key「offline_expenses」不是陣列");
    }
    targetOfflineExpenses = {
      ...offlineExpenses,
      sourceKey: offlineExpenses.sourceKey,
      originalItemCount: offlineExpenses.value.length,
      value: offlineExpenses.value.filter((item) => item?.trip_id === tripId),
    };
  }

  const knownPrefixes = [
    `travel_companion_user_shared_checklist_${tripId}_`,
    `travel_companion_private_checklist_${tripId}_`,
    `travel_companion_pending_private_checklist_${tripId}_`,
    `travel_companion_pending_shared_checklist_order_${tripId}_`,
    `travel_companion_pending_shared_checklist_progress_${tripId}_`,
  ];
  const allowlistedKeys = new Set([
    TRIP_STORAGE_KEY,
    `travel_companion_other_info_${tripId}`,
    `travel_companion_folders_${tripId}`,
    `travel_companion_checklist_${tripId}`,
    `travel_companion_exchange_rate_local_${tripId}`,
    `travel_companion_exchange_rate_cloud_${tripId}`,
    `travel_companion_exchange_rate_cloud_initialized_${tripId}`,
    `travel_companion_other_info_sync_${tripId}`,
    `admin_profile_${tripId}`,
    `attachment_last_sync_${tripId}`,
    "offline_expenses",
  ]);
  const includedKeys = inPartition
    .filter((entry) => allowlistedKeys.has(entry.key) || entry.key === cachedExpensePrefix || entry.key.startsWith(`${cachedExpensePrefix}::personal::`) || knownPrefixes.some((item) => entry.key.startsWith(item)))
    .map((entry) => entry.key)
    .sort();
  const excludedSensitiveKeyCount = inPartition.filter((entry) => /^(auth_|sb-|supabase\.)/i.test(entry.key)).length;

  return {
    trip: {
      tripId,
      record: parsed.record,
      recordSha256: parsed.sourceValueSha256,
      daysDataSha256: parsed.daysDataSha256,
      summary: parsed.summary,
    },
    data: {
      otherInfoItems: one(`travel_companion_other_info_${tripId}`),
      folders: one(`travel_companion_folders_${tripId}`),
      sharedChecklistProgress: one(`travel_companion_checklist_${tripId}`),
      userSharedChecklists: prefix(`travel_companion_user_shared_checklist_${tripId}_`),
      privateChecklists: prefix(`travel_companion_private_checklist_${tripId}_`),
      exchangePurchases: {
        local: one(`travel_companion_exchange_rate_local_${tripId}`),
        cloud: one(`travel_companion_exchange_rate_cloud_${tripId}`),
        cloudInitialized: one(`travel_companion_exchange_rate_cloud_initialized_${tripId}`),
      },
      expenseCache: {
        books: captureMany(inPartition, (entry) => entry.key === cachedExpensePrefix || entry.key.startsWith(`${cachedExpensePrefix}::personal::`)),
        offlineQueueForTrip: targetOfflineExpenses,
        attachmentLastSync: one(`attachment_last_sync_${tripId}`),
      },
      pendingSyncDiagnostics: {
        otherInfo: one(`travel_companion_other_info_sync_${tripId}`),
        privateChecklists: prefix(`travel_companion_pending_private_checklist_${tripId}_`),
        sharedChecklistOrder: prefix(`travel_companion_pending_shared_checklist_order_${tripId}_`),
        sharedChecklistProgress: prefix(`travel_companion_pending_shared_checklist_progress_${tripId}_`),
      },
      permissionCacheDiagnostic: one(`admin_profile_${tripId}`),
    },
    integrity: {
      includedStorageKeys: includedKeys,
      excludedSensitiveKeyCount,
      limitations: [
        "未匯出 auth_、sb-、supabase. 開頭的登入或工作階段資料。",
        "未匯出其他 Trip 的資料。",
        "未匯出 IndexedDB 的未同步附件二進位檔、Cache Storage 或僅存在雲端的資料。",
        "pendingSyncDiagnostics 與 permissionCacheDiagnostic 僅供鑑識，不應直接匯入。",
      ],
    },
  };
};
