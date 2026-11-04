import { checksumFixture } from "./testdata-download-apply.mjs";

const digestPattern = /^[a-f0-9]{64}$/;

export function classifyBaselineSync(local, remote) {
  if (!remote || typeof remote.baselineAt !== "string" || !Number.isFinite(Date.parse(remote.baselineAt)) ||
      typeof remote.checksum !== "string" || !digestPattern.test(remote.checksum)) {
    throw new Error("遠端測試資料基準格式無效。");
  }
  if (!local) return { action: "download", reason: "local-baseline-missing" };
  if (typeof local.baselineAt !== "string" || !Number.isFinite(Date.parse(local.baselineAt)) ||
      typeof local.checksum !== "string" || !digestPattern.test(local.checksum)) {
    throw new Error("本機測試資料基準格式無效。");
  }

  const localTime = Date.parse(local.baselineAt);
  const remoteTime = Date.parse(remote.baselineAt);
  if (remoteTime > localTime) return { action: "download", reason: "remote-baseline-newer" };
  if (localTime > remoteTime) return { action: "upload", reason: "local-baseline-newer" };
  return local.checksum === remote.checksum
    ? { action: "unchanged", reason: "same-time-same-checksum" }
    : { action: "conflict", reason: "same-time-different-checksum" };
}

export { checksumFixture };

export function createBaselineRecord({ fixtureId, data, sourceHost, baselineAt = new Date().toISOString() }) {
  if (!/^tc-test-[a-z0-9][a-z0-9-]{2,60}$/.test(fixtureId)) {
    throw new Error("只允許 tc-test- 合成測試 fixture。");
  }
  if (typeof sourceHost !== "string" || !sourceHost.trim()) throw new Error("缺少來源主機識別。");
  if (!Number.isFinite(Date.parse(baselineAt))) throw new Error("baselineAt 必須是有效 ISO 8601 時間。");
  return {
    schemaVersion: 1,
    fixtureId,
    baselineAt: new Date(baselineAt).toISOString(),
    sourceHost,
    checksum: checksumFixture(data),
    data,
  };
}
