import assert from "node:assert/strict";
import { classifyInitialDownload } from "./lib/testdata-download-policy.mjs";

assert.deepEqual(
  classifyInitialDownload({ hasAppliedBaseline: false, databaseMatchesCurrent: true, localDatabaseEmpty: false }),
  { action: "adopt-current-baseline" },
);
assert.deepEqual(
  classifyInitialDownload({ hasAppliedBaseline: false, databaseMatchesCurrent: false, localDatabaseEmpty: true }),
  { action: "stop-unknown-baseline" },
);
assert.deepEqual(
  classifyInitialDownload({ hasAppliedBaseline: false, databaseMatchesCurrent: false, localDatabaseEmpty: false }),
  { action: "stop-local-data-divergence" },
);
assert.deepEqual(
  classifyInitialDownload({ hasAppliedBaseline: true, databaseMatchesCurrent: false, localDatabaseEmpty: false }),
  { action: "continue-revision-check" },
);

console.log("testdata initial download policy checks passed (adopt exact baseline / reject empty unknown / reject divergent data)");
