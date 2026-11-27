import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/App.tsx", "utf8");
const effectStart = app.indexOf("const loadChecklistCopySources = async () => {");
assert.notEqual(effectStart, -1, "Checklist copy source loader must exist");

const effectEnd = app.indexOf("\n    void loadChecklistCopySources();", effectStart);
assert.notEqual(effectEnd, -1, "Checklist copy source effect must be complete");
const loader = app.slice(effectStart, effectEnd);

assert.match(loader, /tripOptions\.some\(\(trip\) => !isStaticSeedTripId\(trip\.id\)\)/);
assert.match(
  loader,
  /isOnline && hasCloudTrips \? await getCloudTripRecords\(supabase\) : undefined/,
  "Online dynamic Trip details must share one cloud snapshot; seed-only lists must not fetch it",
);
assert.match(
  loader,
  /getTripDetail\(supabase, basePath, trip\.id, trip, cloudRecords\)/,
  "Every Trip detail lookup must reuse the shared cloud snapshot",
);
assert.equal(
  (loader.match(/getCloudTripRecords\(supabase\)/g) ?? []).length,
  1,
  "The loader must fetch the full cloud Trip list at most once per effect run",
);
assert.ok(
  loader.indexOf("await getCloudTripRecords(supabase)") < loader.indexOf("Promise.all("),
  "The shared cloud snapshot must be loaded before per-Trip detail lookups",
);

console.log("Checklist copy source hydration shares one cloud Trip snapshot per effect run — PASS");
