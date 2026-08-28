import assert from "node:assert/strict";

import {
  compareSemanticVersions,
  evaluateAppUpdatePolicy,
  parseAppVersionMetadata,
} from "../src/utils/appVersionPolicy.ts";

const metadata = (overrides = {}) => ({
  version: "3.5.7",
  releaseDate: "2026-08-29",
  releaseNotes: ["一般功能更新"],
  forceUpdate: true,
  minimumSupportedVersion: "3.5.6",
  ...overrides,
});

assert.equal(compareSemanticVersions("3.5.9", "3.5.10"), -1);
assert.equal(compareSemanticVersions("3.6.0", "3.5.10"), 1);
assert.equal(compareSemanticVersions("3.5", "3.5.0"), null);

assert.deepEqual(evaluateAppUpdatePolicy("3.5.5", metadata()), {
  hasUpdate: true,
  isMandatoryForCurrentClient: true,
});
assert.deepEqual(evaluateAppUpdatePolicy("3.5.6", metadata()), {
  hasUpdate: true,
  isMandatoryForCurrentClient: false,
});
assert.deepEqual(
  evaluateAppUpdatePolicy("3.5.5", metadata({ minimumSupportedVersion: undefined })),
  { hasUpdate: true, isMandatoryForCurrentClient: true },
);
assert.deepEqual(
  evaluateAppUpdatePolicy(
    "3.5.5",
    metadata({ forceUpdate: false, minimumSupportedVersion: undefined }),
  ),
  { hasUpdate: true, isMandatoryForCurrentClient: false },
);
assert.equal(
  evaluateAppUpdatePolicy("3.5.6", metadata({ minimumSupportedVersion: "錯誤" })),
  null,
);
assert.equal(parseAppVersionMetadata(metadata({ version: "3.5" })), null);
assert.equal(parseAppVersionMetadata(metadata({ minimumSupportedVersion: "3.5" })), null);

console.log("最低支援版本與橋接相容政策驗證通過。");
