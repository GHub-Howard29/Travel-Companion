import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

let tripQueryCount = 0;
const { loadInitialWorkspaceSnapshot } = await import(
  "../src/services/tripInitialization.ts"
);

const snapshot = await loadInitialWorkspaceSnapshot({
  loadCloudRecords: async () => {
    tripQueryCount += 1;
    return [{ id: "self-guided-2026-09-08" }];
  },
  loadTripMetas: async (cloudRecords) =>
    cloudRecords.map((record) => ({ id: record.id, title: "V3.6.5 初始化測試" })),
});
assert.equal(snapshot.tripMetas.length, 1);
assert.equal(snapshot.cloudRecords.length, 1);
assert.equal(tripQueryCount, 1, "initial metadata must query the full cloud Trip set once");

const repository = readSource("src/services/tripRepository.ts");
assert.match(repository, /loadInitialWorkspaceSnapshot\(\{/);
assert.match(repository, /initialCloudRecords \?\? await getCloudTripRecords\(supabase\)/);
assert.match(repository, /getTripMetas\(supabase, basePath, cloudRecords\)/);

const workspaceHook = readSource("src/hooks/useTripWorkspace.ts");
const app = readSource("src/App.tsx");
assert.match(workspaceHook, /if \(!isSessionReady\) return;/);
assert.match(workspaceHook, /initialCloudRecordsRef\.current = cloudRecords/);
assert.match(workspaceHook, /initialCloudRecordsRef\.current = null/);
assert.equal(
  existsSync(new URL("../src/utils/appPerformance.ts", import.meta.url)),
  false,
  "temporary performance instrumentation must be removed from the release candidate",
);
for (const source of [
  app,
  workspaceHook,
  readSource("src/main.tsx"),
  readSource("src/hooks/useAppUpdate.ts"),
]) {
  assert.doesNotMatch(source, /appPerformance|App Performance|recordAppPerformance|markAppPerformance/);
}

const launchReadyIndex = app.indexOf("{isSessionReady && !isLoading && <AppLaunchReady />}");
const screenSuspenseIndex = app.indexOf("<Suspense fallback={screenLoadingFallback}>");
assert.ok(launchReadyIndex >= 0, "launch screen readiness must follow Session and data readiness");
assert.ok(
  launchReadyIndex < screenSuspenseIndex,
  "launch screen removal must not wait for the lazy screen Suspense boundary",
);

console.log("V3.6.5 啟動畫面與單次 Trip 雲端快照驗證通過。");
