export interface InitialWorkspaceSnapshot<TMeta, TCloudRecord> {
  tripMetas: TMeta[];
  cloudRecords: TCloudRecord[];
}

interface LoadInitialWorkspaceOptions<TMeta, TCloudRecord> {
  loadCloudRecords: () => Promise<TCloudRecord[]>;
  loadTripMetas: (cloudRecords: TCloudRecord[]) => Promise<TMeta[]>;
}

export const loadInitialWorkspaceSnapshot = async <TMeta, TCloudRecord>({
  loadCloudRecords,
  loadTripMetas,
}: LoadInitialWorkspaceOptions<TMeta, TCloudRecord>): Promise<
  InitialWorkspaceSnapshot<TMeta, TCloudRecord>
> => {
  const cloudRecords = await loadCloudRecords();
  const tripMetas = await loadTripMetas(cloudRecords);

  return { tripMetas, cloudRecords };
};
