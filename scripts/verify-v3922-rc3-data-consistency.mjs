import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const repository = readSource("src/services/tripRepository.ts");
const workspace = readSource("src/hooks/useTripWorkspace.ts");
const cloudService = readSource("src/services/tripCloudService.ts");
const itineraryPage = readSource("src/components/ItineraryPage.tsx");
const timeAdjustment = readSource("src/utils/itineraryTimeAdjustment.ts");
const app = readSource("src/App.tsx");
const restoreTripDeleteTombstoneMigration = readSource(
  "supabase/migrations/20261001141000_v3922_restore_trip_delete_tombstone.sql",
);

assert.match(
  repository,
  /updateTripRecord = \([\s\S]*sourceRecord\?: StoredTripRecord[\s\S]*sourceRecord \?\?/,
);
assert.match(
  repository,
  /cloudUpdatedAt: currentRecord\.cloudUpdatedAt \?\? currentRecord\.updatedAt/,
);
assert.match(workspace, /await getCloudTripRecord\(supabase, selectedTripId\)/);
assert.match(workspace, /reloadCurrentTrip = useCallback\(async \(preferCloud = false\)/);
assert.match(repository, /preferCloud && cloudTrip/);
assert.match(app, /await reloadCurrentTrip\(true\)/);
assert.match(
  workspace,
  /updateTripRecord\([\s\S]*cloudSnapshot \?\? undefined[\s\S]*expectedUpdatedAt[\s\S]*cloudSnapshot\?\.cloudUpdatedAt/,
);
assert.match(
  workspace,
  /saveTripRecordWithCloudSync\([\s\S]*record,[\s\S]*expectedUpdatedAt/,
);

assert.match(cloudService, /export class TripDeletionError extends Error/);
assert.match(
  cloudService,
  /if \(await cloudTripTombstoneExists\(supabase, tripId\)\) return true/,
);
assert.match(
  cloudService,
  /if \(error\) \{[\s\S]*cloudTripTombstoneExists\(supabase, tripId\)[\s\S]*TripDeletionError\("rpc"/,
);
assert.doesNotMatch(
  cloudService,
  /const \{ data: tombstone, error: tombstoneError \}/,
);
assert.match(app, /error instanceof TripDeletionError/);
assert.match(app, /error\.stage === "attachments"/);
assert.match(app, /error\.stage === "rpc"/);

assert.match(
  restoreTripDeleteTombstoneMigration,
  /if tg_op = 'DELETE' then[\s\S]*insert into public\.trip_deletion_tombstones[\s\S]*next_revision\.revision/,
);
assert.match(
  restoreTripDeleteTombstoneMigration,
  /perform private\.tc_record_trip_change\([\s\S]*case when tg_op = 'INSERT' then 'added' else 'deleted' end/,
);
assert.match(
  restoreTripDeleteTombstoneMigration,
  /perform realtime\.send\(/,
);

assert.match(
  timeAdjustment,
  /export const materializeTimeAdjustmentEstimates = async/,
);
assert.match(
  timeAdjustment,
  /getSavedTravelEstimate\(\{ \.\.\.origin, travelToNext: estimate \}, destination\)/,
);
assert.match(
  timeAdjustment,
  /items\[segment\.originIndex\] = \{[\s\S]*travelModeToNext: estimate\.mode,[\s\S]*travelToNext: estimate/,
);
assert.match(itineraryPage, /await materializeTimeAdjustmentEstimates\(/);
assert.match(
  itineraryPage,
  /materializeTimeAdjustmentEstimates\([\s\S]*requestTravelEstimate\([\s\S]*getPreferredTravelMode\(origin\)/,
);

console.log("V3.9.22 RC3 Trip snapshot、刪除 idempotency 與交通 estimate commit 契約驗證通過。");
