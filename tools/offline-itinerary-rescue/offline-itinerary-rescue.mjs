import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ClassicLevel } from "classic-level";
import {
  DEFAULT_TRIP_ID,
  buildFullTripRescue,
  parseChromiumLocalStorageEntry,
  TARGET_ORIGIN,
  TRIP_STORAGE_KEY,
} from "./rescue-core.mjs";

const TOOL_VERSION = "1.1.0";
const WINDOWS_BROWSER_ROOTS = [
  ["Chrome", join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "User Data")],
  ["Edge", join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "User Data")],
];

const parseArguments = () => {
  const args = process.argv.slice(2);
  const valueAfter = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    tripId: valueAfter("--trip") ?? DEFAULT_TRIP_ID,
    leveldbDir: valueAfter("--leveldb-dir"),
    outputDir: valueAfter("--output"),
    nonInteractive: args.includes("--non-interactive"),
  };
};

const assertSafeTripId = (tripId) => {
  if (!/^[A-Za-z0-9_-]+$/.test(tripId)) throw new Error("Trip ID 格式不正確");
};

const timestamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const safeName = (value) => value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";

const findProfiles = (explicitLeveldbDir) => {
  if (explicitLeveldbDir) {
    const path = resolve(explicitLeveldbDir);
    return [{ browser: "指定來源", profile: basename(dirname(dirname(path))), leveldbDir: path }];
  }
  const profiles = [];
  for (const [browser, root] of WINDOWS_BROWSER_ROOTS) {
    if (!root || !existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const leveldbDir = join(root, entry.name, "Local Storage", "leveldb");
      if (existsSync(join(leveldbDir, "CURRENT"))) {
        profiles.push({ browser, profile: entry.name, leveldbDir });
      }
    }
  }
  return profiles;
};

const runningBrowsers = () => {
  if (process.platform !== "win32") return [];
  const result = spawnSync("tasklist.exe", ["/FO", "CSV", "/NH"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("無法確認 Chrome／Edge 是否已完全關閉");
  const names = new Set(
    result.stdout.split(/\r?\n/)
      .map((line) => line.match(/^"([^"]+)"/)?.[1]?.toLowerCase())
      .filter(Boolean),
  );
  return ["chrome.exe", "msedge.exe"].filter((name) => names.has(name));
};

const listFiles = (root, current = root) => {
  const result = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(root, path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
};

const fingerprintDirectory = (root) => {
  const hash = createHash("sha256");
  for (const path of listFiles(root)) {
    const relative = path.slice(root.length).replaceAll("\\", "/");
    const stat = statSync(path);
    hash.update(relative).update("\0").update(String(stat.size)).update("\0").update(readFileSync(path));
  }
  return hash.digest("hex");
};

const copyStableSnapshot = (source, destination) => {
  const before = fingerprintDirectory(source);
  cpSync(source, destination, { recursive: true, errorOnExist: true });
  const after = fingerprintDirectory(source);
  if (before !== after) {
    rmSync(destination, { recursive: true, force: true });
    throw new Error("來源資料在複製期間發生變化；請完全關閉瀏覽器與 PWA 後重試");
  }
  return before;
};

const readTripStorageValues = async (snapshotDir) => {
  const db = new ClassicLevel(snapshotDir, {
    createIfMissing: false,
    keyEncoding: "buffer",
    valueEncoding: "buffer",
  });
  const values = [];
  try {
    await db.open();
    for await (const [rawKey, rawValue] of db.iterator()) {
      const entry = parseChromiumLocalStorageEntry(rawKey, rawValue);
      if (entry && (entry.storageKey === TARGET_ORIGIN || entry.storageKey.startsWith(`${TARGET_ORIGIN}^`))) {
        values.push(entry);
      }
    }
  } finally {
    await db.close().catch(() => undefined);
  }
  return values;
};

const exportCandidate = (candidate, fullExport, profile, outputRoot, sourceFingerprint) => {
  const createdAt = new Date().toISOString();
  const document = {
    format: "travel-companion-full-local-rescue",
    formatVersion: 2,
    toolVersion: TOOL_VERSION,
    exportedAt: createdAt,
    source: {
      browser: profile.browser,
      profile: profile.profile,
      origin: TARGET_ORIGIN,
      storagePartition: candidate.storageKey,
      leveldbSha256: sourceFingerprint,
      localStorageValueSha256: fullExport.trip.recordSha256,
    },
    ...fullExport,
  };
  const partitionSuffix = candidate.storageKey === TARGET_ORIGIN
    ? ""
    : `-${createHash("sha256").update(candidate.storageKey).digest("hex").slice(0, 8)}`;
  const fileName = `${safeName(profile.browser)}-${safeName(profile.profile)}-${safeName(fullExport.trip.tripId)}${partitionSuffix}.json`;
  const path = join(outputRoot, fileName);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { path, document };
};

const main = async () => {
  const options = parseArguments();
  assertSafeTripId(options.tripId);
  console.log("Travel Companion 完整資料離線救援工具");
  console.log(`工具版本：${TOOL_VERSION}`);
  console.log("本工具沒有網路功能，且只會讀取 Chrome／Edge Local Storage。\n");

  if (!options.leveldbDir && process.env.TRAVEL_COMPANION_RESCUE_TEST !== "1") {
    const running = runningBrowsers();
    if (running.length > 0) {
      throw new Error(`請先完全關閉以下程式後再執行：${running.join("、")}`);
    }
  }

  if (!options.nonInteractive) {
    const prompt = createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question("確認已中斷網路並完全關閉 PWA／Chrome／Edge，請輸入 EXPORT：");
    prompt.close();
    if (answer.trim() !== "EXPORT") throw new Error("未取得精確確認，已停止且未匯出任何資料");
  }

  const profiles = findProfiles(options.leveldbDir);
  if (profiles.length === 0) throw new Error("找不到 Chrome／Edge Local Storage LevelDB");
  const outputRoot = resolve(options.outputDir ?? join(dirname(process.argv[1]), `救援匯出_${timestamp()}`));
  mkdirSync(outputRoot, { recursive: false });
  const report = [];
  const exports = [];

  for (const profile of profiles) {
    const snapshotDir = join(tmpdir(), `travel-companion-rescue-${process.pid}-${safeName(profile.browser)}-${safeName(profile.profile)}`);
    try {
      if (!existsSync(join(profile.leveldbDir, "CURRENT"))) {
        report.push(`${profile.browser} / ${profile.profile}：略過，LevelDB 不完整`);
        continue;
      }
      const fingerprint = copyStableSnapshot(profile.leveldbDir, snapshotDir);
      const values = await readTripStorageValues(snapshotDir);
      let found = false;
      for (const entry of values.filter((item) => item.key === TRIP_STORAGE_KEY)) {
        const fullExport = buildFullTripRescue(values, entry, options.tripId);
        if (!fullExport) continue;
        found = true;
        const exported = exportCandidate(entry, fullExport, profile, outputRoot, fingerprint);
        exports.push(exported);
        report.push(`${profile.browser} / ${profile.profile}：已匯出 ${exported.document.trip.record.meta?.title ?? exported.document.trip.record.detail?.title ?? options.tripId}，Day 卡片數 ${exported.document.trip.summary.map((day) => `${day.day}:${day.cardCount}`).join("、")}，Local Storage 資料鍵 ${exported.document.integrity.includedStorageKeys.length} 個`);
      }
      if (!found) report.push(`${profile.browser} / ${profile.profile}：未找到目標 Trip`);
    } catch (error) {
      report.push(`${profile.browser} / ${profile.profile}：失敗－${error instanceof Error ? error.message : String(error)}`);
    } finally {
      rmSync(snapshotDir, { recursive: true, force: true });
    }
  }

  writeFileSync(
    join(outputRoot, "救援報告.txt"),
    [
      "Travel Companion 完整資料離線救援報告",
      `產生時間：${new Date().toISOString()}`,
      `目標 Trip：${options.tripId}`,
      "",
      ...report,
      "",
      `成功匯出：${exports.length} 份`,
      "此工具未修改瀏覽器資料，也未連接任何網路服務。匯出不包含登入憑證與 IndexedDB 附件檔案。",
    ].join("\r\n"),
    { encoding: "utf8", flag: "wx" },
  );
  console.log(`\n${report.join("\n")}`);
  console.log(`\n輸出位置：${outputRoot}`);
  if (exports.length === 0) throw new Error("未找到可匯出的目標 Trip；請保留救援報告供檢查");
};

await main().catch((error) => {
  console.error(`\n救援工具停止：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
