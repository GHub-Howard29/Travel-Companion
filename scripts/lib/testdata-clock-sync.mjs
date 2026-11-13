const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function validateSyncTimestamp(value, label) {
  if (typeof value !== "string" || !timestampPattern.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} 缺漏或格式錯誤；同步已停止。`);
  }
  return value;
}

export function classifyTimestampSync({ localLastChangedAt, lastSyncedAt, gitLastChangedAt }) {
  const localChangedAt = validateSyncTimestamp(localLastChangedAt, "local_last_changed_at");
  if (lastSyncedAt === null || lastSyncedAt === undefined) {
    return {
      action: gitLastChangedAt ? "initial-download-required" : "initial-upload-required",
      localChanged: true,
      gitChanged: Boolean(gitLastChangedAt),
    };
  }

  const baseline = validateSyncTimestamp(lastSyncedAt, "last_synced_at");
  const gitChangedAt = validateSyncTimestamp(gitLastChangedAt, "git_last_changed_at");
  const localChanged = localChangedAt > baseline;
  const gitChanged = gitChangedAt > baseline;

  if (localChanged && gitChanged) return { action: "conflict", localChanged, gitChanged };
  if (localChanged) return { action: "upload", localChanged, gitChanged };
  if (gitChanged) return { action: "download", localChanged, gitChanged };
  return { action: "unchanged", localChanged, gitChanged };
}

export function sqlTimestampLiteral(value, label = "timestamp") {
  const timestamp = validateSyncTimestamp(value, label);
  return `'${timestamp}'::timestamptz`;
}

export const SYNC_DATASET_ID = "local-database";
export const SYNC_TABLES = [
  "trips",
  "checklists",
  "checklist_items",
  "expenses",
  "exchange_purchases",
  "other_info_items",
];
export const SYNC_CLOCK_SQL_PATH = "scripts/sql/testdata-sync-clock.sql";
export const SYNC_DATASET_DIRECTORY = "supabase/test-fixtures/local-database";
