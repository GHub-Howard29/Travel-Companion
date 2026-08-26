import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminProfile,
  OtherInfoItem,
  SidebarItemConfig,
  TripDetail,
  TripEditorInput,
  TripMeta,
  TripMode,
} from "../types";
import {
  deleteStoredTripRecord,
  replaceStoredTripRecords,
  readStoredTripRecords,
  upsertStoredTripRecord,
  type StoredTripRecord,
} from "../storage/tripStorage";
import {
  cloudTripExists,
  deleteCloudTripRecord,
  getCloudTripRecords,
  insertCloudTripRecord,
  upsertCloudTripRecord,
} from "./tripCloudService";
import { getCloudOtherInfoItems } from "./otherInfoCloudService";
import { sortTripsByDateDesc } from "../utils/tripHelpers";
import { readOtherInfoSyncState } from "../storage/otherInfoSyncStorage";
import { normalizeOtherInfoItems } from "../utils/otherInfoUtils";

const SPECIAL_INFO_SCREEN_ID = "trip_special_info";
const LEGACY_SPECIAL_INFO_SCREEN_IDS = new Set([
  "leader_info",
  "custom_info",
]);
const GUIDED_SPECIAL_INFO_FOLDER_ID = "special-info-guided";
const SELF_GUIDED_SPECIAL_INFO_FOLDER_ID = "special-info-self-guided";

const getSpecialInfoFolderId = (mode: TripMode): string =>
  mode === "guided"
    ? GUIDED_SPECIAL_INFO_FOLDER_ID
    : SELF_GUIDED_SPECIAL_INFO_FOLDER_ID;

const isLegacySpecialInfoItem = (item: SidebarItemConfig): boolean =>
  LEGACY_SPECIAL_INFO_SCREEN_IDS.has(item.id) ||
  (item.type === "text" &&
    (item.title.includes("領隊") ||
      item.title.includes("導遊") ||
      item.title.includes("自駕") ||
      item.title.includes("租車")));

const createSpecialInfoSidebarItem = (mode: TripMode): SidebarItemConfig => ({
  id: SPECIAL_INFO_SCREEN_ID,
  title: mode === "guided" ? "領隊導遊聯絡資訊" : "自駕租車須知",
  type: "otherInfo",
});

const createSidebarConfig = (mode: TripMode): SidebarItemConfig[] => [
  { id: "itinerary", title: "每日詳細行程", type: "itinerary" },
  { id: "checklist", title: "共同檢查清單", type: "checklist" },
  createSpecialInfoSidebarItem(mode),
  { id: "other_info", title: "其他資訊", type: "otherInfo" },
  { id: "expense", title: "旅費記帳本", type: "expense" },
  { id: "exchange_rate", title: "外幣換算", type: "exchangeRate" },
];

const inferTripMode = (
  meta: Pick<TripMeta, "mode"> | null | undefined,
  detail: Pick<TripDetail, "sidebarConfig"> | null | undefined,
): TripMode => {
  if (meta?.mode === "guided" || meta?.mode === "selfGuided") {
    return meta.mode;
  }

  const specialTitle = detail?.sidebarConfig.find(
    (item) => item.id === SPECIAL_INFO_SCREEN_ID || isLegacySpecialInfoItem(item),
  )?.title;

  if (specialTitle?.includes("自駕") || specialTitle?.includes("租車")) {
    return "selfGuided";
  }

  return "guided";
};

const normalizeSidebarConfig = (
  sidebarConfig: SidebarItemConfig[],
  mode: TripMode,
): SidebarItemConfig[] => {
  const specialItem = createSpecialInfoSidebarItem(mode);
  const hasSpecialItem = sidebarConfig.some((item) => item.id === SPECIAL_INFO_SCREEN_ID);
  const normalizedItems = sidebarConfig
    .filter(
      (item) =>
        item.id !== SPECIAL_INFO_SCREEN_ID &&
        !isLegacySpecialInfoItem(item),
    )
    .map((item) =>
      item.id === "other_info" && item.type === "otherInfo"
        ? { ...item, title: "其他資訊" }
        : item,
    );
  const checklistIndex = normalizedItems.findIndex((item) => item.type === "checklist");
  const nextItems = [...normalizedItems];

  if (hasSpecialItem || checklistIndex >= 0) {
    nextItems.splice(checklistIndex >= 0 ? checklistIndex + 1 : 2, 0, specialItem);
  }

  if (nextItems.length === 0) return createSidebarConfig(mode);

  if (!nextItems.some((item) => item.type === "exchangeRate")) {
    const expenseIndex = nextItems.findIndex((item) => item.type === "expense");
    nextItems.splice(expenseIndex >= 0 ? expenseIndex + 1 : nextItems.length, 0, {
      id: "exchange_rate",
      title: "外幣換算",
      type: "exchangeRate",
    });
  }

  return nextItems;
};

const createSpecialInfoItem = (
  tripId: string,
  mode: TripMode,
): OtherInfoItem => {
  const now = new Date().toISOString();

  return {
    id: `${tripId}-${mode}-special-info`,
    tripId,
    folderId: getSpecialInfoFolderId(mode),
    title: mode === "guided" ? "領隊導遊聯絡資訊" : "自駕租車資訊",
    content:
      mode === "guided"
        ? "領隊：\n電話：\n導遊：\n電話：\n集合提醒："
        : "租車公司：\n取車地點：\n取車時間：\n還車地點：\n還車時間：\n注意事項：",
    order: 1,
    createdAt: now,
    updatedAt: now,
  };
};

const ensureSpecialInfoItems = (
  tripId: string,
  mode: TripMode,
  items: OtherInfoItem[] | undefined,
): OtherInfoItem[] => {
  const title = mode === "guided" ? "領隊導遊聯絡資訊" : "自駕租車資訊";
  const currentItems = (items ?? []).filter((item) => item.tripId === tripId);
  const specialFolderId = getSpecialInfoFolderId(mode);
  const normalizedItems = currentItems.map((item) => {
    const isMatchingSpecialItem =
      item.title === title ||
      (mode === "guided" &&
        (item.title.includes("領隊") || item.title.includes("導遊"))) ||
      (mode === "selfGuided" &&
        (item.title.includes("自駕") || item.title.includes("租車")));

    return isMatchingSpecialItem
      ? { ...item, folderId: specialFolderId }
      : item;
  });

  if (normalizedItems.some((item) => item.title === title)) {
    return normalizedItems;
  }

  return [createSpecialInfoItem(tripId, mode), ...normalizedItems];
};

const mergeOtherInfoItems = (
  baseItems: OtherInfoItem[] | undefined,
  cloudItems: OtherInfoItem[],
): OtherInfoItem[] => {
  const mergedItemsById = new Map<string, OtherInfoItem>();

  (baseItems ?? []).forEach((item) => {
    mergedItemsById.set(item.id, item);
  });

  cloudItems.forEach((item) => {
    const localItem = mergedItemsById.get(item.id);
    if (
      !localItem ||
      (!localItem.isDeleted &&
        new Date(item.updatedAt).getTime() > new Date(localItem.updatedAt).getTime())
    ) {
      mergedItemsById.set(item.id, item);
    }
  });

  return Array.from(mergedItemsById.values());
};

const normalizeTripDetail = (
  detail: TripDetail,
  meta: Pick<TripMeta, "mode"> | null | undefined,
  otherInfoItems?: OtherInfoItem[],
): TripDetail => {
  const mode = inferTripMode(meta, detail);
  const shouldNormalizeOtherInfoItems =
    otherInfoItems !== undefined || detail.content.otherInfoItems !== undefined;

  const normalizedOtherInfoItems = shouldNormalizeOtherInfoItems
    ? normalizeOtherInfoItems(
        ensureSpecialInfoItems(
          detail.id,
          mode,
          otherInfoItems ?? detail.content.otherInfoItems,
        ),
      )
    : undefined;

  return {
    ...detail,
    sidebarConfig: normalizeSidebarConfig(detail.sidebarConfig, mode),
    content: {
      ...detail.content,
      mode,
      ...(shouldNormalizeOtherInfoItems && normalizedOtherInfoItems
        ? { otherInfoItems: normalizedOtherInfoItems }
        : {}),
    },
  };
};

export const createTripId = (
  mode: TripMode,
  departureDate: string,
): string => {
  const prefix = mode === "selfGuided" ? "free-travel" : "group-tour";
  return `${prefix}-${departureDate}`;
};

const createDays = (dayCount: number): number[] => {
  return Array.from({ length: dayCount }, (_, index) => index + 1);
};

const createEmptyDaysData = (days: number[]): TripDetail["content"]["daysData"] => {
  return days.reduce<TripDetail["content"]["daysData"]>((result, day) => {
    result[String(day)] = [];
    return result;
  }, {});
};

const normalizeEmails = (emails: string[]): string[] => {
  return Array.from(
    new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  );
};

const normalizeParticipantEmailMap = (
  participantEmailMap: Record<string, string> | undefined,
  participants: string[],
): Record<string, string> => {
  if (!participantEmailMap) return {};

  const participantSet = new Set(participants.map((item) => item.trim()).filter(Boolean));
  const entries = Object.entries(participantEmailMap)
    .map(([participant, email]) => [
      participant.trim(),
      email.trim().toLowerCase(),
    ] as const)
    .filter(
      ([participant, email]) =>
        participantSet.has(participant) && email.includes("@"),
    );

  return Object.fromEntries(entries);
};

const fetchJson = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const withDayCount = (trip: TripMeta, detail: TripDetail | null): TripMeta => {
  const mode = inferTripMode(trip, detail);
  const participantEmailMap = normalizeParticipantEmailMap(
    trip.participantEmailMap ?? detail?.content.participantEmailMap,
    trip.participants,
  );

  return {
    ...trip,
    mode,
    dayCount: detail?.content.days.length ?? trip.dayCount ?? 1,
    participantEmailMap,
  };
};

const enrichSeedTripsWithDayCount = async (
  basePath: string,
  seedTrips: TripMeta[],
): Promise<TripMeta[]> => {
  const enrichedTrips = await Promise.all(
    seedTrips.map(async (trip) => {
      const detailPath = trip.detailPath || `/trips/${trip.id}.json`;
      const url = `${basePath}${detailPath.replace(/^\//, "")}`.replace(
        /\/+/g,
        "/",
      );
      const detail = await fetchJson<TripDetail>(url);
      return withDayCount(trip, detail);
    }),
  );

  return enrichedTrips;
};

const mergeTripRecords = (
  seedTrips: TripMeta[],
  cloudRecords: StoredTripRecord[],
  storedRecords: StoredTripRecord[],
): TripMeta[] => {
  const recordsById = new Map<string, TripMeta>();
  const latestRecordsById = new Map<string, StoredTripRecord>();

  for (const trip of seedTrips) {
    recordsById.set(trip.id, trip);
  }

  for (const record of [...cloudRecords, ...storedRecords]) {
    const currentRecord = latestRecordsById.get(record.meta.id);
    if (!currentRecord || isNewerRecord(record, currentRecord)) {
      latestRecordsById.set(record.meta.id, record);
    }
  }

  for (const record of latestRecordsById.values()) {
    recordsById.set(record.meta.id, record.meta);
  }

  return sortTripsByDateDesc(Array.from(recordsById.values()));
};

const isNewerRecord = (
  candidate: StoredTripRecord,
  current: StoredTripRecord,
): boolean => {
  return new Date(candidate.updatedAt).getTime() >= new Date(current.updatedAt).getTime();
};

const chooseLatestRecord = (
  records: Array<StoredTripRecord | undefined>,
): StoredTripRecord | null => {
  return records.reduce<StoredTripRecord | null>((latestRecord, record) => {
    if (!record) return latestRecord;
    if (!latestRecord || isNewerRecord(record, latestRecord)) return record;
    return latestRecord;
  }, null);
};

export const getTripMetas = async (
  supabase: SupabaseClient,
  basePath: string,
): Promise<TripMeta[]> => {
  const seedUrl = `${basePath}trips/list.json`.replace(/\/+/g, "/");
  const seedTrips = await enrichSeedTripsWithDayCount(
    basePath,
    (await fetchJson<TripMeta[]>(seedUrl)) ?? [],
  );
  const cloudRecords = await getCloudTripRecords(supabase);
  const currentStoredRecords = readStoredTripRecords();
  const storedRecords = (() => {
    if (cloudRecords.length === 0) return currentStoredRecords;

    const recordsById = new Map(
      cloudRecords.map((record) => [record.meta.id, record]),
    );
    currentStoredRecords.forEach((record) => {
      const cloudRecord = recordsById.get(record.meta.id);
      if (
        readOtherInfoSyncState(record.meta.id) ||
        !cloudRecord ||
        isNewerRecord(record, cloudRecord)
      ) {
        recordsById.set(record.meta.id, record);
      }
    });

    return replaceStoredTripRecords(Array.from(recordsById.values()));
  })();

  return mergeTripRecords(seedTrips, cloudRecords, storedRecords);
};

export const getTripDetail = async (
  supabase: SupabaseClient,
  basePath: string,
  tripId: string,
  selectedTripMeta?: TripMeta,
): Promise<TripDetail | null> => {
  const storedTrip = readStoredTripRecords().find(
    (record) => record.meta.id === tripId,
  );
  const cloudTrip = (await getCloudTripRecords(supabase)).find(
    (record) => record.meta.id === tripId,
  );
  const latestRecord = chooseLatestRecord([cloudTrip, storedTrip]);
  if (latestRecord) {
    if (readOtherInfoSyncState(tripId) && storedTrip) {
      return normalizeTripDetail(storedTrip.detail, storedTrip.meta);
    }

    const cloudOtherInfoItems = await getCloudOtherInfoItems(supabase, tripId);

    if (cloudOtherInfoItems && cloudOtherInfoItems.length > 0) {
      return normalizeTripDetail(
        latestRecord.detail,
        latestRecord.meta,
        mergeOtherInfoItems(
          latestRecord.detail.content.otherInfoItems,
          cloudOtherInfoItems,
        ),
      );
    }

    return normalizeTripDetail(latestRecord.detail, latestRecord.meta);
  }

  const detailPath = selectedTripMeta?.detailPath || `/trips/${tripId}.json`;
  const url = `${basePath}${detailPath.replace(/^\//, "")}`.replace(/\/+/g, "/");
  const seedDetail = await fetchJson<TripDetail>(url);
  const cloudOtherInfoItems = await getCloudOtherInfoItems(supabase, tripId);

  if (seedDetail && cloudOtherInfoItems && cloudOtherInfoItems.length > 0) {
    return normalizeTripDetail(
      seedDetail,
      selectedTripMeta,
      mergeOtherInfoItems(seedDetail.content.otherInfoItems, cloudOtherInfoItems),
    );
  }

  return seedDetail ? normalizeTripDetail(seedDetail, selectedTripMeta) : null;
};

export const createTripRecord = (input: TripEditorInput): StoredTripRecord => {
  const id = createTripId(input.mode, input.departureDate);
  const days = createDays(input.dayCount);
  const editorEmails = normalizeEmails(input.editorEmails);
  const mode = input.mode;
  const participants = input.participants.map((item) => item.trim()).filter(Boolean);
  const participantEmailMap = normalizeParticipantEmailMap(
    input.participantEmailMap,
    participants,
  );
  const meta: TripMeta = {
    id,
    title: input.title.trim(),
    departureDate: input.departureDate,
    dayCount: input.dayCount,
    mode,
    participants,
    participantEmailMap,
    currencyConfig: {
      code: input.currencyCode.trim().toUpperCase(),
      symbol: input.currencySymbol.trim(),
    },
  };
  const detail: TripDetail = {
    id,
    title: meta.title,
    departureDate: meta.departureDate,
    isPublic: true,
    sidebarConfig: createSidebarConfig(mode),
    content: {
      mode,
      days,
      custom_tab_1: {
        subtitle: "旅程備忘錄",
        mainText: "",
      },
      checklistData: [],
      participantEmailMap,
      otherInfoItems: ensureSpecialInfoItems(id, mode, []),
      daysData: createEmptyDaysData(days),
    },
  };

  return {
    meta,
    detail,
    editorEmails,
    updatedAt: new Date().toISOString(),
  };
};

export class DuplicateTripIdError extends Error {
  constructor(public readonly tripId: string) {
    super(`Trip ID 已存在：${tripId}`);
    this.name = "DuplicateTripIdError";
  }
}

export class TripCreationOfflineError extends Error {
  constructor() {
    super("新增旅程需要網路連線");
    this.name = "TripCreationOfflineError";
  }
}

const isUniqueViolation = (error: unknown): boolean => {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
};

export const createTripRecordWithCloudSync = async (
  supabase: SupabaseClient,
  record: StoredTripRecord,
  knownTripIds: string[],
): Promise<StoredTripRecord> => {
  if (!navigator.onLine) throw new TripCreationOfflineError();

  const localTripIds = new Set([
    ...knownTripIds,
    ...readStoredTripRecords().map((item) => item.meta.id),
  ]);
  if (localTripIds.has(record.meta.id)) {
    throw new DuplicateTripIdError(record.meta.id);
  }

  if (await cloudTripExists(supabase, record.meta.id)) {
    throw new DuplicateTripIdError(record.meta.id);
  }

  try {
    const insertedRecord = await insertCloudTripRecord(supabase, record);
    const storedRecord = {
      ...insertedRecord,
      editorEmails: record.editorEmails,
    };
    try {
      saveTripRecord(storedRecord);
    } catch (error) {
      console.warn("Cloud Trip created but local cache could not be updated", error);
    }
    return storedRecord;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateTripIdError(record.meta.id);
    }
    if (!navigator.onLine) throw new TripCreationOfflineError();
    throw error;
  }
};

export const updateTripRecord = (
  tripId: string,
  input: TripEditorInput,
): StoredTripRecord | null => {
  const currentRecord = readStoredTripRecords().find(
    (record) => record.meta.id === tripId,
  );
  if (!currentRecord) return null;

  const days = createDays(input.dayCount);
  const currentDaysData = currentRecord.detail.content.daysData;
  const mode = input.mode;
  const participants = input.participants.map((item) => item.trim()).filter(Boolean);
  const participantEmailMap = normalizeParticipantEmailMap(
    input.participantEmailMap,
    participants,
  );
  const nextDaysData = days.reduce<TripDetail["content"]["daysData"]>(
    (result, day) => {
      result[String(day)] = currentDaysData[String(day)] ?? [];
      return result;
    },
    {},
  );
  const meta: TripMeta = {
    ...currentRecord.meta,
    title: input.title.trim(),
    departureDate: input.departureDate,
    dayCount: input.dayCount,
    mode,
    participants,
    participantEmailMap,
    currencyConfig: {
      code: input.currencyCode.trim().toUpperCase(),
      symbol: input.currencySymbol.trim(),
    },
  };
  const detail: TripDetail = {
    ...currentRecord.detail,
    title: meta.title,
    departureDate: meta.departureDate,
    sidebarConfig: normalizeSidebarConfig(currentRecord.detail.sidebarConfig, mode),
    content: {
      ...currentRecord.detail.content,
      mode,
      days,
      participantEmailMap,
      otherInfoItems: ensureSpecialInfoItems(
        currentRecord.detail.id,
        mode,
        currentRecord.detail.content.otherInfoItems,
      ),
      daysData: nextDaysData,
    },
  };

  return {
    meta,
    detail,
    editorEmails: normalizeEmails(input.editorEmails),
    updatedAt: new Date().toISOString(),
  };
};

export const createTripRecordFromExisting = (
  meta: TripMeta,
  detail: TripDetail,
  input: TripEditorInput,
): StoredTripRecord => {
  const days = createDays(input.dayCount);
  const mode = input.mode;
  const participants = input.participants.map((item) => item.trim()).filter(Boolean);
  const participantEmailMap = normalizeParticipantEmailMap(
    input.participantEmailMap,
    participants,
  );
  const nextDaysData = days.reduce<TripDetail["content"]["daysData"]>(
    (result, day) => {
      result[String(day)] = detail.content.daysData[String(day)] ?? [];
      return result;
    },
    {},
  );
  const nextMeta: TripMeta = {
    ...meta,
    title: input.title.trim(),
    departureDate: input.departureDate,
    dayCount: input.dayCount,
    mode,
    participants,
    participantEmailMap,
    currencyConfig: {
      code: input.currencyCode.trim().toUpperCase(),
      symbol: input.currencySymbol.trim(),
    },
  };
  const nextDetail: TripDetail = {
    ...detail,
    title: nextMeta.title,
    departureDate: nextMeta.departureDate,
    sidebarConfig: normalizeSidebarConfig(detail.sidebarConfig, mode),
    content: {
      ...detail.content,
      mode,
      days,
      participantEmailMap,
      otherInfoItems: ensureSpecialInfoItems(
        detail.id,
        mode,
        detail.content.otherInfoItems,
      ),
      daysData: nextDaysData,
    },
  };

  return {
    meta: nextMeta,
    detail: nextDetail,
    editorEmails: normalizeEmails(input.editorEmails),
    updatedAt: new Date().toISOString(),
  };
};

export const saveTripRecord = (record: StoredTripRecord): TripMeta[] => {
  const storedRecords = upsertStoredTripRecord(record);
  return sortTripsByDateDesc(storedRecords.map((item) => item.meta));
};

export const saveTripRecordWithCloudSync = async (
  supabase: SupabaseClient,
  record: StoredTripRecord,
): Promise<boolean> => {
  saveTripRecord(record);
  const syncedRecord = await upsertCloudTripRecord(supabase, record);
  if (syncedRecord) {
    upsertStoredTripRecord({
      ...syncedRecord,
      editorEmails: record.editorEmails,
    });
    return true;
  }

  return false;
};

export const deleteTripRecordWithCloudSync = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> => {
  const didDeleteCloudRecord = await deleteCloudTripRecord(supabase, tripId);
  if (!didDeleteCloudRecord) {
    throw new Error("無法完成行程刪除，雲端附件與資料均未變更。");
  }

  deleteStoredTripRecord(tripId);
};

export const createTripRecordFromDetail = (
  meta: TripMeta,
  detail: TripDetail,
  editorEmails: string[],
): StoredTripRecord => {
  const mode = inferTripMode(meta, detail);
  const participantEmailMap = normalizeParticipantEmailMap(
    detail.content.participantEmailMap ?? meta.participantEmailMap,
    meta.participants,
  );

  return {
    meta: {
      ...meta,
      title: detail.title,
      departureDate: detail.departureDate,
      dayCount: detail.content.days.length,
      mode,
      participantEmailMap,
    },
    detail: {
      ...detail,
      sidebarConfig: normalizeSidebarConfig(detail.sidebarConfig, mode),
      content: {
        ...detail.content,
        participantEmailMap,
        otherInfoItems: ensureSpecialInfoItems(
          detail.id,
          mode,
          detail.content.otherInfoItems,
        ),
      },
    },
    editorEmails: normalizeEmails(editorEmails),
    updatedAt: new Date().toISOString(),
  };
};

export const getStoredTripEditorEmails = (tripId: string): string[] => {
  return (
    readStoredTripRecords().find((record) => record.meta.id === tripId)
      ?.editorEmails ?? []
  );
};

export const getTripEditorEmails = async (
  supabase: SupabaseClient,
  tripId: string,
): Promise<string[]> => {
  const localEmails = getStoredTripEditorEmails(tripId);

  if (!navigator.onLine) return localEmails;

  const { data, error } = await supabase
    .from("admin_users")
    .select("email")
    .eq("role", "trip_editor")
    .eq("trip_id", tripId);

  if (error) {
    console.warn("Failed to load trip editors", error);
    return localEmails;
  }

  return normalizeEmails([
    ...localEmails,
    ...((data ?? []) as Array<{ email: string }>).map((row) => row.email),
  ]);
};

export const getSuperAdminEmails = async (
  supabase: SupabaseClient,
): Promise<string[]> => {
  if (!navigator.onLine) return [];

  const { data, error } = await supabase
    .from("admin_users")
    .select("email")
    .eq("role", "super_admin");

  if (error) {
    console.warn("Failed to load super admin emails", error);
    return [];
  }

  return normalizeEmails(
    ((data ?? []) as Array<{ email: string | null }>).map((row) => row.email ?? ""),
  );
};

export const getAdminProfiles = async (
  supabase: SupabaseClient,
): Promise<AdminProfile[]> => {
  if (!navigator.onLine) return [];

  const [profileResult, superAdminResult] = await Promise.all([
    supabase
      .from("admin_profiles")
      .select(
        "user_id, email, display_name, include_in_new_trip, sort_order",
      )
      .eq("include_in_new_trip", true)
      .order("sort_order", { ascending: true })
      .order("email", { ascending: true }),
    supabase
      .from("admin_users")
      .select("email")
      .eq("role", "super_admin"),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (superAdminResult.error) throw superAdminResult.error;

  const superAdminEmailSet = new Set(
    ((superAdminResult.data ?? []) as Array<{ email: string | null }>)
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );

  return ((profileResult.data ?? []) as AdminProfile[]).filter((profile) =>
    superAdminEmailSet.has(profile.email.trim().toLowerCase()),
  );
};

export const syncTripEditorEmails = async (
  supabase: SupabaseClient,
  tripId: string,
  editorEmails: string[],
): Promise<void> => {
  if (!navigator.onLine) return;

  const normalizedEmails = normalizeEmails(editorEmails);
  const rows = normalizedEmails.map((email) => ({
    email,
    role: "trip_editor",
    trip_id: tripId,
  }));

  const { data: existingRows, error: selectError } = await supabase
    .from("admin_users")
    .select("email")
    .eq("role", "trip_editor")
    .eq("trip_id", tripId);

  if (selectError) {
    console.warn("Failed to load trip editors before sync", selectError);
    return;
  }

  const nextEmailSet = new Set(normalizedEmails);
  const removedEmails = ((existingRows ?? []) as Array<{ email: string }>)
    .map((row) => row.email)
    .filter((email) => !nextEmailSet.has(email));

  if (removedEmails.length > 0) {
    const { error: deleteError } = await supabase
      .from("admin_users")
      .delete()
      .eq("role", "trip_editor")
      .eq("trip_id", tripId)
      .in("email", removedEmails);

    if (deleteError) {
      console.warn("Failed to remove trip editors", deleteError);
    }
  }

  if (rows.length === 0) return;

  const { error: upsertError } = await supabase.from("admin_users").upsert(rows, {
    onConflict: "email,role,trip_id",
  });

  if (upsertError) {
    console.warn("Failed to sync trip editors", upsertError);
  }
};
