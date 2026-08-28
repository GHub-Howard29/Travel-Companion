export type AppVersionMetadata = {
  version: string;
  releaseDate: string;
  releaseNotes: string[];
  forceUpdate: boolean;
  minimumSupportedVersion?: string;
};

export type AppUpdatePolicy = {
  hasUpdate: boolean;
  isMandatoryForCurrentClient: boolean;
};

const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const parseSemanticVersion = (version: string): [number, number, number] | null => {
  const match = version.match(SEMANTIC_VERSION_PATTERN);
  if (!match) return null;

  const parts = match.slice(1).map(Number) as [number, number, number];
  return parts.every(Number.isSafeInteger) ? parts : null;
};

export const compareSemanticVersions = (left: string, right: string): number | null => {
  const leftParts = parseSemanticVersion(left);
  const rightParts = parseSemanticVersion(right);
  if (!leftParts || !rightParts) return null;

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }

  return 0;
};

export const evaluateAppUpdatePolicy = (
  currentVersion: string,
  metadata: AppVersionMetadata,
): AppUpdatePolicy | null => {
  const latestComparison = compareSemanticVersions(currentVersion, metadata.version);
  if (latestComparison === null) return null;

  if (metadata.minimumSupportedVersion !== undefined) {
    const minimumComparison = compareSemanticVersions(
      currentVersion,
      metadata.minimumSupportedVersion,
    );
    if (minimumComparison === null) return null;

    return {
      hasUpdate: latestComparison < 0,
      isMandatoryForCurrentClient: minimumComparison < 0,
    };
  }

  return {
    hasUpdate: latestComparison < 0,
    isMandatoryForCurrentClient: latestComparison < 0 && metadata.forceUpdate,
  };
};

export const parseAppVersionMetadata = (value: unknown): AppVersionMetadata | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<AppVersionMetadata>;

  if (
    typeof data.version !== "string" ||
    !parseSemanticVersion(data.version) ||
    typeof data.releaseDate !== "string" ||
    !Array.isArray(data.releaseNotes) ||
    typeof data.forceUpdate !== "boolean" ||
    !data.releaseNotes.every((note) => typeof note === "string") ||
    (data.minimumSupportedVersion !== undefined &&
      (typeof data.minimumSupportedVersion !== "string" ||
        !parseSemanticVersion(data.minimumSupportedVersion)))
  ) {
    return null;
  }

  return {
    version: data.version,
    releaseDate: data.releaseDate,
    releaseNotes: data.releaseNotes,
    forceUpdate: data.forceUpdate,
    ...(data.minimumSupportedVersion === undefined
      ? {}
      : { minimumSupportedVersion: data.minimumSupportedVersion }),
  };
};
