import { spawnSync } from "node:child_process";

const command = process.argv[2];
const databaseUrl = process.env.TRAVEL_COMPANION_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("請先設定 TRAVEL_COMPANION_DATABASE_URL；工具不會保存連線字串。");
}

const runSql = (sql) => {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (result.error) throw new Error(`無法啟動 psql：${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
  process.stdout.write(result.stdout);
};

if (command === "list") {
  runSql(`select jsonb_build_object(
    'id', id,
    'kind', snapshot_kind,
    'taipeiDate', taipei_date,
    'reason', reason,
    'createdAt', created_at,
    'rowCounts', row_counts,
    'checksumSha256', checksum_sha256,
    'checksumValid', checksum_sha256 = encode(extensions.digest(payload::text, 'sha256'), 'hex')
  )
  from private.application_snapshots
  order by created_at desc, id desc;`);
} else if (command === "create-pre-restore") {
  const reason = process.argv.slice(3).join(" ").trim();
  if (!reason) throw new Error("請提供 pre_restore 原因，例如：npm run snapshot:admin -- create-pre-restore \"全域復原前\"");
  const escapedReason = reason.replaceAll("'", "''");
  runSql(`select jsonb_build_object(
    'id', snapshot.id,
    'kind', snapshot.snapshot_kind,
    'createdAt', snapshot.created_at,
    'rowCounts', snapshot.row_counts,
    'checksumSha256', snapshot.checksum_sha256
  ) from private.tc_create_application_snapshot('pre_restore', '${escapedReason}') as snapshot;`);
} else {
  throw new Error("用法：npm run snapshot:admin -- list | create-pre-restore <原因>");
}
