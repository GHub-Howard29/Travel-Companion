export function classifyFixtureRevision(current, incoming) {
  if (!incoming || !Number.isSafeInteger(incoming.version) || incoming.version < 1 || typeof incoming.checksum !== "string") {
    throw new Error("incoming fixture revision is invalid");
  }
  if (!current) return { action: "bootstrap" };
  if (!Number.isSafeInteger(current.version) || current.version < 1 || typeof current.checksum !== "string") {
    throw new Error("applied fixture revision is invalid");
  }
  if (incoming.version < current.version) return { action: "reject", reason: "rollback" };
  if (incoming.version === current.version) {
    return incoming.checksum === current.checksum
      ? { action: "skip" }
      : { action: "reject", reason: "same-version-checksum-mismatch" };
  }
  if (incoming.version !== current.version + 1) return { action: "reject", reason: "revision-gap" };
  if (incoming.parentVersion !== current.version || incoming.parentChecksum !== current.checksum) {
    return { action: "reject", reason: "parent-mismatch" };
  }
  return { action: "apply" };
}

export function classifyPeerHandoff(applied, current, incoming, databaseMatchesCurrent) {
  if (!current || !Number.isSafeInteger(current.version) || current.version < 1 || typeof current.checksum !== "string") {
    throw new Error("current fixture revision is invalid");
  }
  if (typeof databaseMatchesCurrent !== "boolean") {
    throw new Error("databaseMatchesCurrent must be a boolean");
  }
  if (!applied || !Number.isSafeInteger(applied.version) || applied.version < 1 || typeof applied.checksum !== "string") {
    return { action: "reject", reason: "unknown-baseline" };
  }

  if (incoming) {
    if (!Number.isSafeInteger(incoming.version) || incoming.version !== current.version + 1 ||
        incoming.parentVersion !== current.version || incoming.parentChecksum !== current.checksum ||
        typeof incoming.checksum !== "string" || !/^[a-f0-9]{64}$/.test(incoming.checksum)) {
      throw new Error("incoming fixture revision chain is invalid");
    }
    const matchesParent = applied.version === current.version && applied.checksum === current.checksum;
    if (!matchesParent) return { action: "reject", reason: "baseline-mismatch" };
    return databaseMatchesCurrent
      ? { action: "receive", version: incoming.version }
      : { action: "reject", reason: "local-database-diverged-from-parent" };
  }

  const matchesCurrent = applied.version === current.version && applied.checksum === current.checksum;
  if (!matchesCurrent) return { action: "reject", reason: "baseline-mismatch" };
  return databaseMatchesCurrent
    ? { action: "unchanged", version: current.version }
    : { action: "export-next", version: current.version + 1, parentVersion: current.version, parentChecksum: current.checksum };
}

export function formatFixtureRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("revision must be a positive integer");
  const major = Math.floor(revision / 100);
  const minor = String(revision % 100).padStart(2, "0");
  return `V${major}.${minor}`;
}
