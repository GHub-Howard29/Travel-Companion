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
    content: { daysData: { "1": [{ id: "one", title: "測試行程" }] } },
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
assert.deepEqual(exported.trip.daysData, trip.detail.content.daysData);
assert.equal(exported.summary[0].cardCount, 1);
rmSync(root, { recursive: true, force: true });
console.log("離線救援工具 LevelDB 解析、資料最小化與匯出驗證通過。");
