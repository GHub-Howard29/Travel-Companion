import { SYNC_TABLES, sqlTimestampLiteral } from "./testdata-clock-sync.mjs";

const columns = {
  trips: ["id", "title", "departure_date", "currency_config", "sidebar_config", "content", "created_at", "updated_at", "is_public"],
  checklists: ["id", "trip_id", "scope", "title", "created_at", "updated_at"],
  checklist_items: ["id", "checklist_id", "client_item_id", "label", "is_checked", "sort_order", "created_at", "updated_at", "deleted_at", "category"],
  expenses: ["trip_id", "title", "amount", "currency", "created_at", "expense_date", "client_item_id", "updated_at", "deleted_at"],
  exchange_purchases: ["id", "trip_id", "client_item_id", "foreign_currency", "purchase_date", "twd_amount", "foreign_amount", "created_at", "updated_at"],
  other_info_items: ["id", "trip_id", "client_item_id", "folder_id", "title", "content", "allowed_roles", "sort_order", "created_at", "updated_at", "deleted_at"],
};

const excludedTripContentKey = /participant|email|phone|password|token|secret|api.?key|attachment|uploaded_by|owner_user_id|created_by|payer|testPurpose|__testFixture|fixtureDescription|checklistData/i;

function redactTripContent(value) {
  if (Array.isArray(value)) return value.map(redactTripContent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !excludedTripContentKey.test(key))
    .map(([key, item]) => [key, redactTripContent(item)]));
}

function canonicalRow(table, row) {
  const result = Object.fromEntries(columns[table]
    .filter((column) => Object.hasOwn(row, column))
    .map((column) => [column, row[column]]));
  if (table === "trips") result.content = redactTripContent(result.content ?? {});
  return result;
}

export function normalizeDatabaseDataset(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("同步資料集格式無效。");
  }
  const result = {};
  for (const table of SYNC_TABLES) {
    if (!Array.isArray(input[table])) throw new Error(`同步資料集缺少資料表：${table}`);
    result[table] = input[table].map((row) => canonicalRow(table, row))
      .sort((left, right) => String(left.id ?? `${left.trip_id}/${left.client_item_id}`)
        .localeCompare(String(right.id ?? `${right.trip_id}/${right.client_item_id}`)));
  }
  return result;
}

function assertUnique(values, label) {
  if (values.some((value) => value === null || value === undefined || value === "") ||
      new Set(values).size !== values.length) {
    throw new Error(`同步資料集存在缺漏或重複的 ${label}。`);
  }
}

function inspectSensitive(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectSensitive(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/email|phone|password|token|secret|api.?key|attachment|uploaded_by|owner_user_id|created_by|participant|payer/i.test(key) &&
          item !== null && item !== "" && item !== false) {
        throw new Error(`同步資料集含禁止跨機欄位：${location}.${key}`);
      }
      inspectSensitive(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /(?:電話|手機|聯絡電話|tel(?:ephone)?|phone)\s*[:：]?\s*\+?[\d ()-]{7,}/i.test(value) ||
    /\b09\d{2}[- ]?\d{3}[- ]?\d{3}\b/.test(value) ||
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/.test(value)
  )) {
    throw new Error(`同步資料集疑似含 Email 或憑證：${location}`);
  }
}

export function validateDatabaseDataset(input) {
  const data = normalizeDatabaseDataset(input);
  if (JSON.stringify(data) !== JSON.stringify(input)) {
    throw new Error("同步資料集欄位或排序不符合白名單格式。");
  }

  for (const trip of data.trips) {
    if (typeof trip.id !== "string" || !trip.id.trim() || trip.is_public !== false) {
      throw new Error("同步資料集只允許具備有效 ID 的非公開行程。");
    }
    if (typeof trip.content !== "object" || trip.content === null || Array.isArray(trip.content)) {
      throw new Error("Trip content 必須是 JSON object。");
    }
  }
  if (data.other_info_items.some((row) => typeof row.content !== "string" || typeof row.folder_id !== "string")) {
    throw new Error("Other-info content 與 folder_id 必須符合資料庫文字欄位格式。");
  }
  if (data.exchange_purchases.some((row) => !["JPY", "KRW", "USD", "EUR"].includes(row.foreign_currency) ||
      !(Number(row.foreign_amount) > 0) || !(Number(row.twd_amount) > 0))) {
    throw new Error("Exchange purchase 金額或幣別不符合資料庫限制。");
  }
  if (data.expenses.some((row) => typeof row.client_item_id !== "string" || !row.client_item_id.trim())) {
    throw new Error("Expense 缺少 client_item_id。");
  }
  assertUnique(data.trips.map((row) => row.id), "Trip ID");
  assertUnique(data.checklists.map((row) => row.id), "Checklist ID");
  assertUnique(data.checklist_items.map((row) => row.id), "Checklist item ID");
  assertUnique(data.expenses.map((row) => `${row.trip_id}/${row.client_item_id}`), "Expense business key");
  assertUnique(data.exchange_purchases.map((row) => row.id), "Exchange purchase ID");
  assertUnique(data.exchange_purchases.map((row) => `${row.trip_id}/${row.client_item_id}`), "Exchange purchase business key");
  assertUnique(data.other_info_items.map((row) => row.id), "Other-info item ID");
  assertUnique(data.other_info_items.filter((row) => row.client_item_id !== null).map((row) => `${row.trip_id}/${row.client_item_id}`), "Other-info business key");

  const tripIds = new Set(data.trips.map((row) => row.id));
  const checklistIds = new Set(data.checklists.map((row) => row.id));
  if (data.checklists.some((row) => !tripIds.has(row.trip_id) || row.scope !== "shared")) {
    throw new Error("Checklist 必須屬於同步行程且 scope 必須為 shared。");
  }
  if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) {
    throw new Error("Checklist item 找不到對應的 shared checklist。");
  }
  for (const table of ["expenses", "exchange_purchases", "other_info_items"]) {
    if (data[table].some((row) => !tripIds.has(row.trip_id))) {
      throw new Error(`${table} 含有同步範圍以外的行程資料。`);
    }
  }
  inspectSensitive(data);
  return data;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildLocalDatabaseSnapshotSql() {
  return [
    "SELECT json_build_object(",
    "  'local_last_changed_at', to_char(s.local_last_changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),",
    "  'last_synced_at', CASE WHEN s.last_synced_at IS NULL THEN NULL ELSE to_char(s.last_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') END,",
    "  'data', json_build_object(",
    "    'trips', coalesce((SELECT json_agg(to_jsonb(t) ORDER BY t.id) FROM (SELECT id,title,departure_date,currency_config,sidebar_config,content,created_at,updated_at,is_public FROM public.trips WHERE is_public=false) t), '[]'::json),",
    "    'checklists', coalesce((SELECT json_agg(to_jsonb(c) ORDER BY c.id) FROM (SELECT id,trip_id,scope,title,created_at,updated_at FROM public.checklists WHERE scope='shared' AND trip_id IN (SELECT id FROM public.trips WHERE is_public=false)) c), '[]'::json),",
    "    'checklist_items', coalesce((SELECT json_agg(to_jsonb(i) ORDER BY i.id) FROM (SELECT i.id,i.checklist_id,i.client_item_id,i.label,i.is_checked,i.sort_order,i.created_at,i.updated_at,i.deleted_at,i.category FROM public.checklist_items i JOIN public.checklists c ON c.id=i.checklist_id WHERE c.scope='shared' AND c.trip_id IN (SELECT id FROM public.trips WHERE is_public=false)) i), '[]'::json),",
    "    'expenses', coalesce((SELECT json_agg(to_jsonb(e) ORDER BY e.trip_id,e.client_item_id) FROM (SELECT trip_id,title,amount,currency,created_at,expense_date,client_item_id,updated_at,deleted_at FROM public.expenses WHERE trip_id IN (SELECT id FROM public.trips WHERE is_public=false)) e), '[]'::json),",
    "    'exchange_purchases', coalesce((SELECT json_agg(to_jsonb(e) ORDER BY e.id) FROM (SELECT id,trip_id,client_item_id,foreign_currency,purchase_date,twd_amount,foreign_amount,created_at,updated_at FROM public.exchange_purchases WHERE trip_id IN (SELECT id FROM public.trips WHERE is_public=false)) e), '[]'::json),",
    "    'other_info_items', coalesce((SELECT json_agg(to_jsonb(o) ORDER BY o.id) FROM (SELECT id,trip_id,client_item_id,folder_id,title,content,allowed_roles,sort_order,created_at,updated_at,deleted_at FROM public.other_info_items WHERE trip_id IN (SELECT id FROM public.trips WHERE is_public=false)) o), '[]'::json)",
    "  )",
    ") AS payload",
    "FROM tc_testdata.sync_state s WHERE s.singleton=true;",
  ].join("\n");
}

export function buildDatabaseDatasetImportSql({
  data,
  gitLastChangedAt,
  expectedLocalLastChangedAt,
  expectedLastSyncedAt,
  initialize = false,
}) {
  const dataset = validateDatabaseDataset(data);
  const gitAt = sqlTimestampLiteral(gitLastChangedAt, "git_last_changed_at");
  const localAt = sqlTimestampLiteral(expectedLocalLastChangedAt, "local_last_changed_at");
  const syncedAt = expectedLastSyncedAt === null
    ? "NULL::timestamptz"
    : sqlTimestampLiteral(expectedLastSyncedAt, "last_synced_at");
  const json = sqlLiteral(JSON.stringify(dataset));
  const tableList = [...SYNC_TABLES.map((table) => `public.${table}`), "public.itinerary_card_edit_leases", "public.route_estimate_cache", "private.itinerary_day_history"].join(", ");
  const statements = [
    "DO $tc_dataset$",
    "DECLARE",
    `  payload jsonb := (${json})::jsonb;`,
    "  current_local timestamptz;",
    "  current_synced timestamptz;",
    "BEGIN",
    `  EXECUTE 'LOCK TABLE ${tableList} IN SHARE ROW EXCLUSIVE MODE';`,
    "  SELECT local_last_changed_at, last_synced_at INTO current_local, current_synced",
    "  FROM tc_testdata.sync_state WHERE singleton = true FOR UPDATE;",
    `  IF current_local IS DISTINCT FROM ${localAt} OR current_synced IS DISTINCT FROM ${syncedAt} THEN`,
    "    RAISE EXCEPTION 'Local database changed after sync preflight; retry the download.';",
    "  END IF;",
  ];
  // Initial download is an explicit Git-authoritative replacement; existing local rows are replaceable.

  const tripJson = "payload -> 'trips'";
  statements.push(
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.trips, ${tripJson}) incoming JOIN public.trips existing ON existing.id = incoming.id WHERE existing.is_public IS DISTINCT FROM false) THEN RAISE EXCEPTION 'Incoming private Trip ID conflicts with a public Trip.'; END IF;`,
    `  DELETE FROM public.trips t WHERE t.is_public = false AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.trips, ${tripJson}) r WHERE r.id = t.id);`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.checklists, payload -> 'checklists') incoming JOIN public.checklists existing ON existing.id = incoming.id WHERE existing.trip_id IS DISTINCT FROM incoming.trip_id OR existing.scope IS DISTINCT FROM incoming.scope) THEN RAISE EXCEPTION 'Checklist ID belongs to a different trip or scope.'; END IF;`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.checklist_items, payload -> 'checklist_items') incoming JOIN public.checklist_items existing ON existing.id = incoming.id WHERE existing.checklist_id IS DISTINCT FROM incoming.checklist_id OR existing.client_item_id IS DISTINCT FROM incoming.client_item_id) THEN RAISE EXCEPTION 'Checklist item ID belongs to a different checklist or business key.'; END IF;`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.checklist_items, payload -> 'checklist_items') incoming JOIN public.checklist_items existing ON existing.checklist_id = incoming.checklist_id AND existing.client_item_id = incoming.client_item_id AND existing.id <> incoming.id WHERE incoming.client_item_id IS NOT NULL) THEN RAISE EXCEPTION 'Checklist item business key conflicts with a different local ID.'; END IF;`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.exchange_purchases, payload -> 'exchange_purchases') incoming JOIN public.exchange_purchases existing ON existing.id = incoming.id WHERE existing.trip_id IS DISTINCT FROM incoming.trip_id OR existing.client_item_id IS DISTINCT FROM incoming.client_item_id) THEN RAISE EXCEPTION 'Exchange purchase ID belongs to a different Trip or business key.'; END IF;`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.exchange_purchases, payload -> 'exchange_purchases') incoming JOIN public.exchange_purchases existing ON existing.trip_id = incoming.trip_id AND existing.client_item_id = incoming.client_item_id AND existing.id <> incoming.id) THEN RAISE EXCEPTION 'Exchange purchase business key conflicts with a different local ID.'; END IF;`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.other_info_items, payload -> 'other_info_items') incoming JOIN public.other_info_items existing ON existing.id = incoming.id WHERE existing.trip_id IS DISTINCT FROM incoming.trip_id OR existing.client_item_id IS DISTINCT FROM incoming.client_item_id) THEN RAISE EXCEPTION 'Other-info item ID belongs to a different Trip or business key.'; END IF;`,
    `  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.other_info_items, payload -> 'other_info_items') incoming JOIN public.other_info_items existing ON existing.trip_id = incoming.trip_id AND existing.client_item_id = incoming.client_item_id AND existing.id <> incoming.id WHERE incoming.client_item_id IS NOT NULL) THEN RAISE EXCEPTION 'Other-info business key conflicts with a different local ID.'; END IF;`,
    `  DELETE FROM public.checklist_items i USING public.checklists c, public.trips t WHERE i.checklist_id = c.id AND c.trip_id = t.id AND c.scope = 'shared' AND t.is_public = false AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.checklist_items, payload -> 'checklist_items') r WHERE r.id = i.id);`,
    `  DELETE FROM public.checklists c USING public.trips t WHERE c.trip_id = t.id AND c.scope = 'shared' AND t.is_public = false AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.checklists, payload -> 'checklists') r WHERE r.id = c.id);`,
    `  DELETE FROM public.expenses e USING public.trips t WHERE e.trip_id = t.id AND t.is_public = false AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.expenses, payload -> 'expenses') r WHERE r.trip_id = e.trip_id AND r.client_item_id = e.client_item_id);`,
    `  DELETE FROM public.exchange_purchases e USING public.trips t WHERE e.trip_id = t.id AND t.is_public = false AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.exchange_purchases, payload -> 'exchange_purchases') r WHERE r.id = e.id);`,
    `  DELETE FROM public.other_info_items o USING public.trips t WHERE o.trip_id = t.id AND t.is_public = false AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.other_info_items, payload -> 'other_info_items') r WHERE r.id = o.id);`,
    `  INSERT INTO public.trips (id, title, departure_date, currency_config, sidebar_config, content, created_at, updated_at, is_public)`,
    `  SELECT r.id, r.title, r.departure_date, r.currency_config, r.sidebar_config, r.content, r.created_at, r.updated_at, r.is_public`,
    `  FROM jsonb_populate_recordset(NULL::public.trips, ${tripJson}) AS r`,
    `  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, departure_date = EXCLUDED.departure_date,`,
    `    currency_config = EXCLUDED.currency_config, sidebar_config = EXCLUDED.sidebar_config,`,
    `    content = EXCLUDED.content,`,
    `    created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, is_public = EXCLUDED.is_public;`,
  );

  for (const table of ["checklists", "checklist_items", "expenses", "exchange_purchases", "other_info_items"]) {
    const list = columns[table];
    const insertColumns = list.join(", ");
    const selectColumns = list.map((column) => `r.${column}`).join(", ");
    const conflictKey = table === "expenses" ? "(trip_id, client_item_id)" : "(id)";
    const updates = list.filter((column) => !["id", "trip_id", "checklist_id", "client_item_id", "scope"].includes(column));
    const assignments = updates.map((column) => `${column} = EXCLUDED.${column}`).join(", ");
    statements.push(
      `  INSERT INTO public.${table} (${insertColumns}) SELECT ${selectColumns}`,
      `  FROM jsonb_populate_recordset(NULL::public.${table}, payload -> '${table}') AS r`,
      `  ON CONFLICT ${conflictKey} DO UPDATE SET ${assignments};`,
    );
  }

  statements.push(
    `  UPDATE tc_testdata.sync_state SET local_last_changed_at = ${gitAt}, last_synced_at = ${gitAt} WHERE singleton = true;`,
    "END; $tc_dataset$;",
  );

  return statements.join("\n") + "\n";
}
