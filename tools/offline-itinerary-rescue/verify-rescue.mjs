import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import {
  buildChromiumLocalStorageKey,
  decodeChromiumStorageString,
  encodeChromiumStorageString,
  parseChromiumLocalStorageEntry,
  TRIP_STORAGE_KEY,
} from "./rescue-core.mjs";

assert.equal(decodeChromiumStorageString(encodeChromiumStorageString("plain-json")), "plain-json");
assert.equal(decodeChromiumStorageString(encodeChromiumStorageString("九州行程")), "九州行程");

const root = mkdtempSync(join(tmpdir(), "tc-rescue-test-"));
const dbPath = join(root, "profile", "Local Storage", "leveldb");
const outputPath = join(root, "output");
const trip = {
  meta: { id: "group-tour-2026-10", title: "英鈦日本九州極上五日", departureDate: "2026-10-03" },
  detail: {
    id: "group-tour-2026-10",
    content: { daysData: { "1": [{ id: "one", title: "測試行程", location: { lat: 33.5, lng: 130.4 } }] }, sidebar: { guide: true } },
  },
  editorEmails: [],
  updatedAt: "2026-09-20T00:00:00Z",
  cloudUpdatedAt: "2026-09-19T00:00:00Z",
};
const rawValue = JSON.stringify([trip]);
const rawKey = buildChromiumLocalStorageKey(TRIP_STORAGE_KEY);
const encodedValue = encodeChromiumStorageString(rawValue);
const parsedEntry = parseChromiumLocalStorageEntry(rawKey, encodedValue);
assert.equal(parsedEntry.key, TRIP_STORAGE_KEY);
assert.equal(parsedEntry.value, rawValue);

const db = new ClassicLevel(dbPath, { keyEncoding: "buffer", valueEncoding: "buffer" });
await db.put(rawKey, encodedValue);
const put = async (key, value) => db.put(buildChromiumLocalStorageKey(key), encodeChromiumStorageString(JSON.stringify(value)));
await put("travel_companion_other_info_group-tour-2026-10", [{ id: "guide", title: "導遊資訊" }]);
await put("travel_companion_folders_group-tour-2026-10", [{ id: "food", name: "美食" }]);
await put("travel_companion_checklist_group-tour-2026-10", { passport: true });
await put("travel_companion_user_shared_checklist_group-tour-2026-10_member@example.com", [{ id: "packing", label: "行李" }]);
await put("travel_companion_private_checklist_group-tour-2026-10_member@example.com", { tripId: "group-tour-2026-10", items: [] });
await put("travel_companion_pending_private_checklist_group-tour-2026-10_member@example.com", { revision: "pending" });
await put("travel_companion_pending_shared_checklist_order_group-tour-2026-10_member@example.com", { revision: "order" });
await put("travel_companion_pending_shared_checklist_progress_group-tour-2026-10_member@example.com", { revision: "progress" });
await put("travel_companion_exchange_rate_local_group-tour-2026-10", [{ id: "rate-1", tripId: "group-tour-2026-10" }]);
await put("travel_companion_exchange_rate_cloud_group-tour-2026-10", [{ id: "rate-2", tripId: "group-tour-2026-10" }]);
await db.put(buildChromiumLocalStorageKey("travel_companion_exchange_rate_cloud_initialized_group-tour-2026-10"), encodeChromiumStorageString("true"));
await put("cached_expenses_group-tour-2026-10", [{ id: "expense-1", trip_id: "group-tour-2026-10", title: "午餐" }]);
await put("cached_expenses_group-tour-2026-10::personal::member@example.com", [{ id: "expense-2", trip_id: "group-tour-2026-10::personal::member@example.com", title: "個人" }]);
await put("offline_expenses", [{ id: "offline-target", trip_id: "group-tour-2026-10" }, { id: "other", trip_id: "another-trip" }]);
await put("admin_profile_group-tour-2026-10", { isAdmin: true });
await db.put(buildChromiumLocalStorageKey("auth_group-tour-2026-10"), encodeChromiumStorageString("secret-session"));
await db.put(buildChromiumLocalStorageKey("sb-test-auth-token"), encodeChromiumStorageString("secret-token"));
await db.close();
const runtimeRootIndex = process.argv.indexOf("--runtime-root");
const runtimeRoot = runtimeRootIndex >= 0 ? process.argv[runtimeRootIndex + 1] : import.meta.dirname;
const runtimeExecutable = runtimeRootIndex >= 0 ? join(runtimeRoot, "node.exe") : process.execPath;
const result = spawnSync(runtimeExecutable, [
  join(runtimeRoot, "offline-itinerary-rescue.mjs"),
  "--leveldb-dir", dbPath,
  "--output", outputPath,
  "--non-interactive",
], {
  encoding: "utf8",
  env: { ...process.env, TRAVEL_COMPANION_RESCUE_TEST: "1" },
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const exported = JSON.parse(readFileSync(join(outputPath, "profile-profile-group-tour-2026-10.json"), "utf8"));
assert.equal(exported.format, "travel-companion-full-local-rescue");
assert.deepEqual(exported.trip.record, trip);
assert.equal(exported.trip.summary[0].cardCount, 1);
assert.deepEqual(exported.data.otherInfoItems.value, [{ id: "guide", title: "導遊資訊" }]);
assert.equal(exported.data.expenseCache.books.length, 2);
assert.deepEqual(exported.data.expenseCache.offlineQueueForTrip.value, [{ id: "offline-target", trip_id: "group-tour-2026-10" }]);
assert.equal(exported.data.exchangePurchases.cloudInitialized.value, true);
assert.equal(exported.integrity.excludedSensitiveKeyCount, 2);
assert.ok(!JSON.stringify(exported).includes("secret-session"));
assert.ok(!JSON.stringify(exported).includes("secret-token"));
rmSync(root, { recursive: true, force: true });
console.log("離線救援工具 LevelDB 解析、完整目標旅程匯出與敏感資料排除驗證通過。");
