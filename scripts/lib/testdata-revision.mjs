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

export function formatFixtureRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("revision must be a positive integer");
  const major = Math.floor(revision / 100);
  const minor = String(revision % 100).padStart(2, "0");
  return `V${major}.${minor}`;
}
