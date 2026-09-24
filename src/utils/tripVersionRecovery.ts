interface ComparableTripRecord {
  meta: {
    id: string;
    title: string;
    departureDate: string;
    participants: unknown;
    currencyConfig: unknown;
  };
  detail: {
    id: string;
    title: string;
    departureDate: string;
    sidebarConfig: unknown;
    content: object;
  };
  updatedAt: string;
}

const toTripVersionComparableValue = (record: ComparableTripRecord) => {
  const content = Object.fromEntries(
    Object.entries(record.detail.content).filter(
      ([key]) => key !== "checklistData" && key !== "otherInfoItems",
    ),
  );

  return {
    meta: {
      id: record.meta.id,
      title: record.meta.title,
      departureDate: record.meta.departureDate,
      participants: record.meta.participants,
      currencyConfig: record.meta.currencyConfig,
    },
    detail: {
      id: record.detail.id,
      title: record.detail.title,
      departureDate: record.detail.departureDate,
      sidebarConfig: record.detail.sidebarConfig,
      content,
    },
  };
};

const stableStringify = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (!input || typeof input !== "object") return input;

    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  };

  return JSON.stringify(normalize(value));
};

/**
 * Other Info 與共同清單已有獨立同步資料表，不應讓它們在 trips 快取中的差異
 * 阻止舊版錯誤 cloudUpdatedAt 的安全修復。其餘 Trip 本體必須完全一致。
 */
export const canRecoverStaleTripVersion = (
  storedRecord: ComparableTripRecord,
  cloudRecord: ComparableTripRecord,
): boolean =>
  stableStringify(toTripVersionComparableValue(storedRecord)) ===
  stableStringify(toTripVersionComparableValue(cloudRecord));

interface UpdateTripWithVersionRecoveryOptions<
  TRecord extends ComparableTripRecord,
> {
  currentStoredRecord?: TRecord;
  expectedUpdatedAt: string;
  update: (expectedUpdatedAt: string) => Promise<TRecord>;
  loadLatestCloudRecord: () => Promise<TRecord | null>;
  isVersionConflict: (error: unknown) => boolean;
}

export const updateTripWithVersionRecovery = async <
  TRecord extends ComparableTripRecord,
>({
  currentStoredRecord,
  expectedUpdatedAt,
  update,
  loadLatestCloudRecord,
  isVersionConflict,
}: UpdateTripWithVersionRecoveryOptions<TRecord>): Promise<TRecord> => {
  try {
    return await update(expectedUpdatedAt);
  } catch (error) {
    if (!isVersionConflict(error) || !currentStoredRecord) throw error;

    const latestCloudRecord = await loadLatestCloudRecord();
    if (
      !latestCloudRecord ||
      !canRecoverStaleTripVersion(currentStoredRecord, latestCloudRecord)
    ) {
      throw error;
    }

    return update(latestCloudRecord.updatedAt);
  }
};
