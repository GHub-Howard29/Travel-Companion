import { createHash } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const tableSpecs = [
  {
    name: "trips",
    columns: ["id", "title", "departure_date", "currency_config", "sidebar_config", "content", "created_at", "updated_at", "is_public"],
    where: (candidate) => `t.id = ${candidate}.id`,
    key: (row) => row.id,
  },
  {
    name: "checklists",
    columns: ["id", "trip_id", "scope", "title", "created_at", "updated_at"],
    where: (candidate) => `t.id = ${candidate}.id`,
    key: (row) => row.id,
  },
  {
    name: "checklist_items",
    columns: ["id", "checklist_id", "client_item_id", "label", "is_checked", "sort_order", "created_at", "updated_at", "deleted_at", "category"],
    where: (candidate) => `(t.id = ${candidate}.id OR (${candidate}.client_item_id IS NOT NULL AND t.checklist_id = ${candidate}.checklist_id AND t.client_item_id = ${candidate}.client_item_id))`,
    key: (row) => row.id,
  },
  {
    name: "expenses",
    columns: ["trip_id", "title", "amount", "currency", "created_at", "expense_date", "client_item_id", "updated_at", "deleted_at"],
    where: (candidate) => `t.trip_id = ${candidate}.trip_id AND t.client_item_id = ${candidate}.client_item_id`,
    key: (row) => `${row.trip_id}/${row.client_item_id}`,
  },
  {
    name: "exchange_purchases",
    columns: ["id", "trip_id", "client_item_id", "foreign_currency", "purchase_date", "twd_amount", "foreign_amount", "created_at", "updated_at"],
    where: (candidate) => `(t.id = ${candidate}.id OR (t.trip_id = ${candidate}.trip_id AND t.client_item_id = ${candidate}.client_item_id))`,
    key: (row) => row.id,
  },
  {
    name: "other_info_items",
    columns: ["id", "trip_id", "client_item_id", "folder_id", "title", "content", "allowed_roles", "sort_order", "created_at", "updated_at", "deleted_at"],
    where: (candidate) => `(t.id = ${candidate}.id OR (${candidate}.client_item_id IS NOT NULL AND t.trip_id = ${candidate}.trip_id AND t.client_item_id = ${candidate}.client_item_id))`,
    key: (row) => row.id,
  },
];

const allowedTables = tableSpecs.map((spec) => spec.name);
const root = process.cwd();

export function normalizeFixtureRows(data) {
  const normalized = {};
  for (const table of allowedTables) {
    const spec = tableSpecs.find((item) => item.name === table);
    normalized[table] = [...(data[table] ?? [])].map((row) => Object.fromEntries(
      spec.columns.filter((column) => Object.hasOwn(row, column)).map((column) => [column, row[column]]),
    )).sort((left, right) =>
      String(spec.key(left)).localeCompare(String(spec.key(right))));
  }
  for (const trip of normalized.trips) {
    delete trip.participants;
    if (trip.content && typeof trip.content === "object") {
      trip.content = { ...trip.content };
      if (trip.content.__testFixture === true && !trip.content.testPurpose) {
        trip.content.testPurpose = "three-way-sync";
      }
      delete trip.content.__testFixture;
      for (const key of ["participants", "participantEmailMap", "checklistData", "participantMap", "participantEmailMaps"]) {
        delete trip.content[key];
      }
    }
  }
  for (const expense of normalized.expenses) delete expense.payer;
  return normalized;
}

function canonicalFixtureValue(value) {
  if (Array.isArray(value)) return value.map(canonicalFixtureValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalFixtureValue(value[key])]));
  }
  return value;
}

export function checksumFixture(data) {
  // Database timestamps are audit metadata, not business content or sync direction.
  const normalized = normalizeFixtureRows(data);
  const content = Object.fromEntries(Object.entries(normalized).map(([table, rows]) => [
    table,
    rows.map((row) => {
      const { created_at: _createdAt, updated_at: _updatedAt, ...businessFields } = row;
      return businessFields;
    }),
  ]));
  return createHash("sha256").update(JSON.stringify(canonicalFixtureValue(content))).digest("hex");
}

export function latestFixtureTimestamp(data) {
  const rows = allowedTables.flatMap((table) => data?.[table] ?? []);
  const timestamps = rows.map((row) => row.updated_at || row.created_at);
  if (!timestamps.length || timestamps.some((value) => value === null || value === undefined || value === "")) {
    throw new Error("測試 Fixture 有資料列缺少 created_at／updated_at，無法判斷資料新舊。");
  }
  const parsed = timestamps.map((value) => Date.parse(value));
  if (parsed.some((value) => !Number.isFinite(value))) throw new Error("測試 Fixture 含無效 created_at／updated_at，無法判斷資料新舊。");
  return new Date(Math.max(...parsed)).toISOString();
}

export function countExcludedFixtureFields(data) {
  const trips = Array.isArray(data?.trips) ? data.trips : [];
  const content = trips[0]?.content && typeof trips[0].content === "object" ? trips[0].content : {};
  const countArray = (value) => Array.isArray(value) ? value.length : 0;
  const countObjectEntries = (value) => value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0;
  return {
    participants: trips.reduce((sum, trip) => sum + countArray(trip.participants), 0),
    embeddedChecklistData: countArray(content.checklistData),
    emailMaps: countObjectEntries(content.participantEmailMap) + countObjectEntries(content.participantEmailMaps),
    participantMaps: countObjectEntries(content.participantMap),
    expensePayers: (data?.expenses ?? []).filter((row) => row.payer !== null && row.payer !== undefined && row.payer !== "").length,
  };
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

export function buildFixtureImportSql(fixtures) {
  const body = ["DO $tc_fixture$", "DECLARE", "  existing_trip public.trips;", "  match_count integer;", "BEGIN"];
  for (const [table, trigger] of [["trips", "trips_touch_updated_at"], ["checklists", "checklists_touch_updated_at"], ["checklist_items", "checklist_items_touch_updated_at"], ["expenses", "expenses_touch_updated_at"], ["exchange_purchases", "exchange_purchases_touch_updated_at"], ["other_info_items", "other_info_items_touch_updated_at"]]) {
    body.push(`  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${trigger}' AND tgrelid = 'public.${table}'::regclass AND NOT tgisinternal) THEN EXECUTE 'ALTER TABLE public.${table} DISABLE TRIGGER ${trigger}'; END IF;`);
  }
  for (const fixture of fixtures) {
    const { manifest, data } = fixture;
    if (!manifest || typeof manifest.fixtureId !== "string" || !manifest.fixtureId.trim() ||
        !data || !Array.isArray(data.trips) || data.trips.length !== 1 ||
        data.trips[0].id !== manifest.fixtureId ||
        data.trips[0].content?.testPurpose !== "three-way-sync" ||
        Object.hasOwn(data.trips[0], "participants") ||
        JSON.stringify(normalizeFixtureRows(data)) !== JSON.stringify(data)) {
      throw new Error("Incoming fixture structure, test marker, or account/participant exclusion is invalid.");
    }
    for (const table of allowedTables) if (!Array.isArray(data[table])) throw new Error(`Incoming fixture missing table: ${table}`);
    const fixtureId = manifest.fixtureId;
    const requiredText = (value) => typeof value === "string" && value.trim().length > 0;
    const unique = (values, label) => {
      if (values.some((value) => !requiredText(value)) || new Set(values).size !== values.length) {
        throw new Error(`Incoming fixture has missing or duplicate ${label}.`);
      }
    };
    unique(data.checklists.map((row) => row.id), "checklist id");
    unique(data.checklist_items.map((row) => row.id), "checklist item id");
    unique(data.expenses.map((row) => row.client_item_id), "expense client_item_id");
    unique(data.exchange_purchases.map((row) => row.id), "exchange purchase id");
    unique(data.exchange_purchases.map((row) => row.client_item_id), "exchange purchase client_item_id");
    unique(data.other_info_items.map((row) => row.id), "other-info item id");
    unique(data.other_info_items.map((row) => row.client_item_id), "other-info client_item_id");
    if (data.checklists.some((row) => row.trip_id !== fixtureId || row.scope !== "shared")) {
      throw new Error("Incoming fixture contains a checklist outside the shared synthetic trip scope.");
    }
    const checklistIds = new Set(data.checklists.map((row) => row.id));
    if (data.checklist_items.some((row) => !checklistIds.has(row.checklist_id))) {
      throw new Error("Incoming fixture contains an item with an unknown checklist reference.");
    }
    for (const table of ["expenses", "exchange_purchases", "other_info_items"]) {
      if (data[table].some((row) => row.trip_id !== fixtureId)) {
        throw new Error(`Incoming fixture contains rows outside its synthetic trip scope: ${table}.`);
      }
    }
    const tripId = sqlLiteral(fixtureId);
    body.push(`  SELECT * INTO existing_trip FROM public.trips WHERE id = ${tripId} FOR UPDATE;`);
    body.push(`  IF FOUND AND (existing_trip.is_public IS DISTINCT FROM false OR (existing_trip.content ->> 'testPurpose' IS DISTINCT FROM 'three-way-sync' AND existing_trip.content -> '__testFixture' IS DISTINCT FROM 'true'::jsonb)) THEN RAISE EXCEPTION 'Fixture target exists but is not marked test data: %', ${tripId}; END IF;`);

    for (const spec of tableSpecs) {
      const scope = spec.name === "trips" ? `t.id = ${tripId}` :
        spec.name === "checklist_items" ? `t.checklist_id IN (SELECT id FROM public.checklists WHERE trip_id = ${tripId} AND scope = 'shared')` :
        spec.name === "checklists" ? `t.trip_id = ${tripId} AND t.scope = 'shared'` : `t.trip_id = ${tripId}`;
      body.push(`  PERFORM 1 FROM public.${spec.name} t WHERE ${scope} FOR UPDATE;`);
    }

    for (const row of data.trips) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  INSERT INTO public.trips (id, title, departure_date, currency_config, sidebar_config, content, created_at, updated_at, is_public) SELECT r.id, r.title, r.departure_date, r.currency_config, r.sidebar_config, r.content, r.created_at, r.updated_at, r.is_public FROM jsonb_populate_record(NULL::public.trips, ${json}) AS r ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, departure_date = EXCLUDED.departure_date, currency_config = EXCLUDED.currency_config, sidebar_config = EXCLUDED.sidebar_config, content = (public.trips.content - 'testPurpose' - 'fixtureDescription' - 'checklistData' - '__testFixture') || EXCLUDED.content, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, is_public = EXCLUDED.is_public;`);
    }
    for (const row of data.checklists) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.checklists WHERE id = ${sqlLiteral(row.id)} AND (trip_id <> ${tripId} OR scope <> 'shared');`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture checklist id belongs to another scope: %', ${sqlLiteral(row.id)}; END IF;`);
      body.push(`  INSERT INTO public.checklists (id, trip_id, scope, title, created_at, updated_at) SELECT r.id, r.trip_id, r.scope, r.title, r.created_at, r.updated_at FROM jsonb_populate_record(NULL::public.checklists, ${json}) AS r ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;`);
    }
    for (const row of data.checklist_items) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.checklist_items i WHERE i.id = ${sqlLiteral(row.id)} AND NOT EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = i.checklist_id AND c.trip_id = ${tripId} AND c.scope = 'shared');`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture checklist item id belongs to another scope: %', ${sqlLiteral(row.id)}; END IF;`);
      if (row.client_item_id !== null && row.client_item_id !== undefined) {
        body.push(`  SELECT count(*) INTO match_count FROM public.checklist_items WHERE checklist_id = ${sqlLiteral(row.checklist_id)} AND client_item_id = ${sqlLiteral(row.client_item_id)} AND id <> ${sqlLiteral(row.id)};`);
        body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture checklist business key has a different local id: %', ${sqlLiteral(row.client_item_id)}; END IF;`);
      }
      body.push(`  INSERT INTO public.checklist_items (id, checklist_id, client_item_id, label, is_checked, sort_order, created_at, updated_at, deleted_at, category) SELECT r.id, r.checklist_id, r.client_item_id, r.label, r.is_checked, r.sort_order, r.created_at, r.updated_at, r.deleted_at, r.category FROM jsonb_populate_record(NULL::public.checklist_items, ${json}) AS r ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, is_checked = EXCLUDED.is_checked, sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, category = EXCLUDED.category;`);
    }
    for (const row of data.expenses) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  INSERT INTO public.expenses (trip_id, client_item_id, title, amount, currency, created_at, expense_date, updated_at, deleted_at) SELECT r.trip_id, r.client_item_id, r.title, r.amount, r.currency, r.created_at, r.expense_date, r.updated_at, r.deleted_at FROM jsonb_populate_record(NULL::public.expenses, ${json}) AS r ON CONFLICT (trip_id, client_item_id) DO UPDATE SET title = EXCLUDED.title, amount = EXCLUDED.amount, currency = EXCLUDED.currency, created_at = EXCLUDED.created_at, expense_date = EXCLUDED.expense_date, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at;`);
    }
    for (const row of data.exchange_purchases) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.exchange_purchases WHERE id = ${sqlLiteral(row.id)} AND trip_id <> ${tripId};`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture exchange purchase id belongs to another trip: %', ${sqlLiteral(row.id)}; END IF;`);
      body.push(`  SELECT count(*) INTO match_count FROM public.exchange_purchases WHERE trip_id = ${tripId} AND client_item_id = ${sqlLiteral(row.client_item_id)} AND id <> ${sqlLiteral(row.id)};`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture exchange purchase business key has a different local id: %', ${sqlLiteral(row.client_item_id)}; END IF;`);
      body.push(`  INSERT INTO public.exchange_purchases (id, trip_id, client_item_id, foreign_currency, purchase_date, twd_amount, foreign_amount, created_at, updated_at) SELECT r.id, r.trip_id, r.client_item_id, r.foreign_currency, r.purchase_date, r.twd_amount, r.foreign_amount, r.created_at, r.updated_at FROM jsonb_populate_record(NULL::public.exchange_purchases, ${json}) AS r ON CONFLICT (id) DO UPDATE SET foreign_currency = EXCLUDED.foreign_currency, purchase_date = EXCLUDED.purchase_date, twd_amount = EXCLUDED.twd_amount, foreign_amount = EXCLUDED.foreign_amount, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;`);
    }
    for (const row of data.other_info_items) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.other_info_items WHERE id = ${sqlLiteral(row.id)} AND trip_id <> ${tripId};`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture other-info item id belongs to another trip: %', ${sqlLiteral(row.id)}; END IF;`);
      if (row.client_item_id !== null && row.client_item_id !== undefined) {
        body.push(`  SELECT count(*) INTO match_count FROM public.other_info_items WHERE trip_id = ${tripId} AND client_item_id = ${sqlLiteral(row.client_item_id)} AND id <> ${sqlLiteral(row.id)};`);
        body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture other-info business key has a different local id: %', ${sqlLiteral(row.client_item_id)}; END IF;`);
      }
      body.push(`  INSERT INTO public.other_info_items (id, trip_id, client_item_id, folder_id, title, content, allowed_roles, sort_order, created_at, updated_at, deleted_at) SELECT r.id, r.trip_id, r.client_item_id, r.folder_id, r.title, r.content, r.allowed_roles, r.sort_order, r.created_at, r.updated_at, r.deleted_at FROM jsonb_populate_record(NULL::public.other_info_items, ${json}) AS r ON CONFLICT (id) DO UPDATE SET folder_id = EXCLUDED.folder_id, title = EXCLUDED.title, content = EXCLUDED.content, allowed_roles = EXCLUDED.allowed_roles, sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at;`);
    }
    const incomingChecklistItemIds = data.checklist_items.map((row) => sqlLiteral(row.id)).join(", ");
    const incomingChecklistIds = data.checklists.map((row) => sqlLiteral(row.id)).join(", ");
    const incomingExpenseKeys = data.expenses.map((row) => sqlLiteral(row.client_item_id)).join(", ");
    const incomingExchangeIds = data.exchange_purchases.map((row) => sqlLiteral(row.id)).join(", ");
    const incomingOtherInfoIds = data.other_info_items.map((row) => sqlLiteral(row.id)).join(", ");
    const deleteSql = [
      ["checklist_items", `DELETE FROM public.checklist_items i WHERE i.checklist_id IN (SELECT id FROM public.checklists WHERE trip_id = ${tripId} AND scope = 'shared')`, "i.id", incomingChecklistItemIds],
      ["checklists", `DELETE FROM public.checklists c WHERE c.trip_id = ${tripId} AND c.scope = 'shared'`, "c.id", incomingChecklistIds],
      ["expenses", `DELETE FROM public.expenses e WHERE e.trip_id = ${tripId}`, "e.client_item_id", incomingExpenseKeys],
      ["exchange_purchases", `DELETE FROM public.exchange_purchases e WHERE e.trip_id = ${tripId}`, "e.id", incomingExchangeIds],
      ["other_info_items", `DELETE FROM public.other_info_items o WHERE o.trip_id = ${tripId}`, "o.id", incomingOtherInfoIds],
    ];
    for (const [table, scopeSql, keySql, incomingKeys] of deleteSql) {
      body.push(incomingKeys
        ? `  ${scopeSql} AND ${keySql} NOT IN (${incomingKeys});`
        : `  ${scopeSql};`);
    }
  }
  for (const [table, trigger] of [["trips", "trips_touch_updated_at"], ["checklists", "checklists_touch_updated_at"], ["checklist_items", "checklist_items_touch_updated_at"], ["expenses", "expenses_touch_updated_at"], ["exchange_purchases", "exchange_purchases_touch_updated_at"], ["other_info_items", "other_info_items_touch_updated_at"]]) {
    body.push(`  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${trigger}' AND tgrelid = 'public.${table}'::regclass AND NOT tgisinternal) THEN EXECUTE 'ALTER TABLE public.${table} ENABLE TRIGGER ${trigger}'; END IF;`);
  }
  body.push("END $tc_fixture$;");
  return body.join("\n\n") + "\n";
}

export async function applyFixtureImport(fixtures, { cwd = root, runCli } = {}) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) throw new Error("至少需要一個通過基準檢查的 fixture。");
  if (typeof runCli !== "function") throw new Error("必須提供已確認 loopback 連線的本機 Supabase CLI runner。");
  const sql = buildFixtureImportSql(fixtures);
  const sqlFile = path.join(os.tmpdir(), `travel-companion-testdata-import-${process.pid}-${Date.now()}.sql`);
  try {
    await writeFile(sqlFile, sql, { flag: "wx" });
    runCli(["db", "query", "--local", "--file", sqlFile]);
  } finally {
    await rm(sqlFile, { force: true });
  }
}
