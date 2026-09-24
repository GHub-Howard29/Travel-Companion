import { spawnSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(3).map((value, index, all) =>
  value.startsWith("--") ? [value.slice(2), all[index + 1]?.startsWith("--") ? "" : all[index + 1]] : ["", ""],
).filter(([key]) => key));
const command = process.argv[2];
const tripId = args.trip;
const day = Number(args.day);
const databaseUrl = process.env.TRAVEL_COMPANION_DATABASE_URL;

if (!databaseUrl) throw new Error("請先設定 TRAVEL_COMPANION_DATABASE_URL；工具不會保存連線字串。");
if (!/^[A-Za-z0-9_-]+$/.test(tripId ?? "")) throw new Error("--trip 格式不正確");
if (!Number.isSafeInteger(day) || day < 1) throw new Error("--day 必須是正整數");

const runSql = (sql) => {
  const result = spawnSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error) throw new Error(`無法啟動 psql：${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
  process.stdout.write(result.stdout);
};

const quotedTrip = `'${tripId.replaceAll("'", "''")}'`;

if (command === "list") {
  runSql(`with current_day as (
    select updated_at, coalesce(content->'daysData'->'${day}', '[]'::jsonb) as items
    from public.trips where id = ${quotedTrip}
  )
  select jsonb_build_object(
    'id', history.id,
    'tripId', history.trip_id,
    'day', history.day,
    'capturedAt', history.captured_at,
    'sourceUpdatedAt', history.source_updated_at,
    'currentUpdatedAt', current_day.updated_at,
    'actorUserId', history.actor_user_id,
    'sourceClientId', history.source_client_id,
    'cardCount', jsonb_array_length(history.previous_items),
    'titles', (select coalesce(jsonb_agg(item->>'title'), '[]'::jsonb) from jsonb_array_elements(history.previous_items) item),
    'differenceFromCurrent', jsonb_build_object(
      'addedNow', (select coalesce(jsonb_agg(item->>'title'), '[]'::jsonb)
        from jsonb_array_elements(current_day.items) item
        where not exists (select 1 from jsonb_array_elements(history.previous_items) old_item where old_item->>'id' = item->>'id')),
      'missingNow', (select coalesce(jsonb_agg(item->>'title'), '[]'::jsonb)
        from jsonb_array_elements(history.previous_items) item
        where not exists (select 1 from jsonb_array_elements(current_day.items) current_item where current_item->>'id' = item->>'id')),
      'changedNow', (select coalesce(jsonb_agg(item->>'title'), '[]'::jsonb)
        from jsonb_array_elements(history.previous_items) item
        join lateral (
          select current_item from jsonb_array_elements(current_day.items) current_item
          where current_item->>'id' = item->>'id' limit 1
        ) matched on true
        where matched.current_item is distinct from item)
    )
  ) from private.itinerary_day_history history
  cross join current_day
  where history.trip_id = ${quotedTrip} and history.day = ${day}
  order by history.captured_at desc, history.id desc limit 30;`);
} else if (command === "restore") {
  const historyId = Number(args["history-id"]);
  const expectedUpdatedAt = args["expected-updated-at"];
  const confirmation = `RESTORE ${tripId} DAY ${day} FROM ${historyId}`;
  if (!Number.isSafeInteger(historyId) || historyId < 1) throw new Error("--history-id 格式不正確");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(expectedUpdatedAt ?? "")) throw new Error("必須提供 --expected-updated-at");
  if (args.confirm !== confirmation) {
    throw new Error(`二次確認不符；請加上 --confirm \"${confirmation}\"`);
  }
  const quotedUpdatedAt = `'${expectedUpdatedAt.replaceAll("'", "''")}'`;
  runSql(`begin;
    do $$
    declare history_items jsonb;
    begin
      select previous_items into history_items
      from private.itinerary_day_history
      where id = ${historyId} and trip_id = ${quotedTrip} and day = ${day};
      if history_items is null then raise exception '復原失敗：歷程不存在'; end if;
      update public.trips
      set content = jsonb_set(content, array['daysData', '${day}'], history_items, true)
      where id = ${quotedTrip} and updated_at = ${quotedUpdatedAt}::timestamptz;
      if not found then raise exception '復原失敗：版本已變更或 Trip 不存在'; end if;
    end $$;
    select jsonb_build_object(
      'restoredTripId', id,
      'updatedAt', updated_at,
      'cardCount', jsonb_array_length(content->'daysData'->'${day}')
    ) from public.trips where id = ${quotedTrip};
  commit;`);
} else {
  throw new Error("用法：npm run itinerary:history -- list|restore --trip <id> --day <n> ...");
}
