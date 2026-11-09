import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { checksumFixture } from "./testdata-download-apply.mjs";

const digestPattern = /^[a-f0-9]{64}$/;
export const SYNC_STATE_PATH = path.resolve(process.cwd(), "supabase", ".temp", "testdata-sync-baselines.json");

export function classifyThreeWaySync({ localChecksum, remoteChecksum, baseChecksum, localExists = true }) {
  if (typeof remoteChecksum !== "string" || !digestPattern.test(remoteChecksum)) {
    throw new Error("Git fixture 內容指紋格式無效。");
  }
  if (!localExists) {
    return { action: "download", reason: "local-fixture-missing" };
  }
  if (typeof localChecksum !== "string" || !digestPattern.test(localChecksum)) {
    throw new Error("本機 fixture 內容指紋格式無效。");
  }
  // Matching Local and Git content is safe even when Base is missing or stale.
  if (localChecksum === remoteChecksum) {
    return { action: "unchanged", reason: "same-content" };
  }
  if (baseChecksum !== null && baseChecksum !== undefined &&
      (typeof baseChecksum !== "string" || !digestPattern.test(baseChecksum))) {
    return { action: "conflict", reason: "invalid-common-baseline" };
  }
  if (!baseChecksum) return { action: "conflict", reason: "unknown-common-baseline" };

  const localChanged = localChecksum !== baseChecksum;
  const gitChanged = remoteChecksum !== baseChecksum;
  if (!localChanged && !gitChanged) return { action: "unchanged", reason: "both-match-base" };
  if (localChanged && !gitChanged) return { action: "upload", reason: "local-only-change" };
  if (!localChanged && gitChanged) return { action: "download", reason: "git-only-change" };
  return { action: "conflict", reason: "both-sides-changed" };
}

export function resolveBaseChecksum({ state, fixtureId, localChecksum, remoteChecksum, localExists = true }) {
  const saved = state?.fixtures?.[fixtureId]?.checksum;
  const validSaved = typeof saved === "string" && digestPattern.test(saved);
  if (localExists && typeof localChecksum === "string" && localChecksum === remoteChecksum) {
    return { checksum: localChecksum, source: validSaved ? "local-sync-state" : "matching-content-bootstrap", bootstrap: !validSaved };
  }
  if (validSaved) return { checksum: saved, source: "local-sync-state" };
  return {
    checksum: null,
    source: saved === undefined ? "missing-baseline" : "invalid-local-baseline",
  };
}

export function createSyncedManifest(manifest, checksum, syncedAt = new Date().toISOString()) {
  if (typeof checksum !== "string" || !digestPattern.test(checksum)) throw new Error("無法建立無效的共同同步基準。");
  if (!manifest || typeof manifest.fixtureId !== "string" || !manifest.fixtureId.trim()) throw new Error("Fixture manifest 缺少有效 ID。");
  return { ...manifest, syncBaseChecksum: checksum, syncedAt };
}

export async function readSyncState(filePath = SYNC_STATE_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, fixtures: {} };
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      !parsed.fixtures || typeof parsed.fixtures !== "object" || Array.isArray(parsed.fixtures)) {
    return { schemaVersion: 1, fixtures: {}, invalidState: true };
  }
  // Keep only individually valid local baselines. Invalid/missing entries behave as
  // unknown Base and are repaired only when Local and Git content are identical.
  const fixtures = Object.fromEntries(Object.entries(parsed.fixtures).filter(([fixtureId, record]) =>
    Boolean(fixtureId) && typeof record?.checksum === "string" && digestPattern.test(record.checksum)));
  return { schemaVersion: 1, fixtures, invalidState: parsed.schemaVersion !== 1 || Object.keys(fixtures).length !== Object.keys(parsed.fixtures).length };
}

export async function writeSyncState(state, updates, filePath = SYNC_STATE_PATH) {
  const next = structuredClone(state ?? { schemaVersion: 1, fixtures: {} });
  next.schemaVersion = 1;
  next.fixtures ??= {};
  for (const [fixtureId, checksum] of Object.entries(updates)) {
    if (typeof checksum !== "string" || !digestPattern.test(checksum)) throw new Error(`無法保存無效的同步基準：${fixtureId}`);
    next.fixtures[fixtureId] = { checksum, syncedAt: new Date().toISOString() };
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return next;
}

export { checksumFixture };

export function createBaselineRecord({ fixtureId, data, sourceHost, baselineAt }) {
  if (typeof fixtureId !== "string" || !fixtureId.trim() || fixtureId.length > 256 ||
      data?.trips?.length !== 1 || data.trips[0]?.id !== fixtureId) {
    throw new Error("測試資料基準必須對應一筆 ID 相符的合成 TRIP fixture。");
  }
  if (typeof sourceHost !== "string" || !sourceHost.trim()) throw new Error("缺少來源主機識別。");
  // Timestamps are retained as payload fields but never required for sync decisions.
  return {
    schemaVersion: 1,
    fixtureId,
    sourceHost,
    checksum: checksumFixture(data),
    data,
  };
}
