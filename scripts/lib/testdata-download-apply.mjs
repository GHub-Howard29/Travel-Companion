import { createHash } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const tableSpecs = [
  {
    name: "trips",
    columns: ["id", "title", "departure_date", "participants", "currency_config", "sidebar_config", "content", "created_at", "updated_at", "is_public"],
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
    columns: ["trip_id", "title", "amount", "payer", "currency", "created_at", "expense_date", "client_item_id", "updated_at", "deleted_at"],
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
    normalized[table] = [...(data[table] ?? [])].sort((left, right) =>
      String(spec.key(left)).localeCompare(String(spec.key(right))));
  }
  return normalized;
}

export function checksumFixture(data) {
  return createHash("sha256").update(JSON.stringify(normalizeFixtureRows(data))).digest("hex");
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

export function buildFixtureImportSql(fixtures) {
  const body = ["DO $tc_fixture$", "DECLARE", "  existing_trip public.trips;", "  match_count integer;", "BEGIN"];
  for (const fixture of fixtures) {
    const { manifest, data, previousData } = fixture;
    const tripId = sqlLiteral(manifest.fixtureId);
    body.push(`  SELECT * INTO existing_trip FROM public.trips WHERE id = ${tripId} FOR UPDATE;`);
    if (previousData) {
      body.push(`  IF NOT FOUND OR existing_trip.content ->> '__testFixture' <> 'true' THEN RAISE EXCEPTION 'Fixture target missing or unmarked: %', ${tripId}; END IF;`);
    } else {
      body.push(`  IF FOUND THEN RAISE EXCEPTION 'Fixture initial import target already exists: %', ${tripId}; END IF;`);
    }

    for (const spec of tableSpecs) {
      const previousRows = previousData?.[spec.name] ?? [];
      const scope = spec.name === "trips" ? `t.id = ${tripId}` :
        spec.name === "checklist_items" ? `t.checklist_id IN (SELECT id FROM public.checklists WHERE trip_id = ${tripId} AND scope = 'shared')` :
        spec.name === "checklists" ? `t.trip_id = ${tripId} AND t.scope = 'shared'` : `t.trip_id = ${tripId}`;
      const comparableColumns = spec.columns.filter((column) => !["created_at", "updated_at"].includes(column));
      const currentJson = `jsonb_build_object(${comparableColumns.map((column) => `${sqlLiteral(column)}, t.${column}`).join(", ")})`;
      body.push(`  PERFORM 1 FROM public.${spec.name} t WHERE ${scope} FOR UPDATE;`);
      body.push(`  SELECT count(*) INTO match_count FROM public.${spec.name} t WHERE ${scope};`);
      body.push(`  IF match_count <> ${previousRows.length} THEN RAISE EXCEPTION 'Fixture target row count mismatch in ${spec.name}: %', ${tripId}; END IF;`);
      for (const expected of previousRows) {
        const json = sqlLiteral(JSON.stringify(expected)) + "::jsonb";
        const candidate = `(jsonb_populate_record(NULL::public.${spec.name}, ${json}))`;
        const expectedJson = `jsonb_build_object(${comparableColumns.map((column) => `${sqlLiteral(column)}, ${candidate}.${column}`).join(", ")})`;
        body.push(`  SELECT count(*) INTO match_count FROM public.${spec.name} t WHERE ${spec.where(candidate)};`);
        body.push(`  IF match_count <> 1 OR NOT EXISTS (SELECT 1 FROM public.${spec.name} t WHERE ${spec.where(candidate)} AND ${currentJson} IS NOT DISTINCT FROM ${expectedJson}) THEN RAISE EXCEPTION 'Fixture target differs from parent revision in ${spec.name}: %', ${tripId}; END IF;`);
      }
    }

    for (const row of data.trips) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      if (previousData) {
        const updates = ["title", "departure_date", "participants", "currency_config", "sidebar_config", "content", "is_public"];
        body.push(`  UPDATE public.trips AS t SET ${updates.map((column) => `${column} = r.${column}`).join(", ")} FROM jsonb_populate_record(NULL::public.trips, ${json}) AS r WHERE t.id = r.id;`);
      } else {
        body.push(`  INSERT INTO public.trips (id, title, departure_date, participants, currency_config, sidebar_config, content, is_public) SELECT r.id, r.title, r.departure_date, r.participants, r.currency_config, r.sidebar_config, r.content, r.is_public FROM jsonb_populate_record(NULL::public.trips, ${json}) AS r;`);
      }
    }
    for (const row of data.checklists) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.checklists WHERE id = ${sqlLiteral(row.id)} AND (trip_id <> ${tripId} OR scope <> 'shared');`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture checklist id belongs to another scope: %', ${sqlLiteral(row.id)}; END IF;`);
      body.push(`  INSERT INTO public.checklists (id, trip_id, scope, title) SELECT r.id, r.trip_id, r.scope, r.title FROM jsonb_populate_record(NULL::public.checklists, ${json}) AS r ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;`);
    }
    for (const row of data.checklist_items) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.checklist_items i WHERE i.id = ${sqlLiteral(row.id)} AND NOT EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = i.checklist_id AND c.trip_id = ${tripId} AND c.scope = 'shared');`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture checklist item id belongs to another scope: %', ${sqlLiteral(row.id)}; END IF;`);
      if (row.client_item_id !== null && row.client_item_id !== undefined) {
        body.push(`  SELECT count(*) INTO match_count FROM public.checklist_items WHERE checklist_id = ${sqlLiteral(row.checklist_id)} AND client_item_id = ${sqlLiteral(row.client_item_id)} AND id <> ${sqlLiteral(row.id)};`);
        body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture checklist business key has a different local id: %', ${sqlLiteral(row.client_item_id)}; END IF;`);
      }
      body.push(`  INSERT INTO public.checklist_items (id, checklist_id, client_item_id, label, is_checked, sort_order, deleted_at, category) SELECT r.id, r.checklist_id, r.client_item_id, r.label, r.is_checked, r.sort_order, r.deleted_at, r.category FROM jsonb_populate_record(NULL::public.checklist_items, ${json}) AS r ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, is_checked = EXCLUDED.is_checked, sort_order = EXCLUDED.sort_order, deleted_at = EXCLUDED.deleted_at, category = EXCLUDED.category;`);
    }
    for (const row of data.expenses) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  INSERT INTO public.expenses (trip_id, client_item_id, title, amount, payer, currency, expense_date, deleted_at) SELECT r.trip_id, r.client_item_id, r.title, r.amount, r.payer, r.currency, r.expense_date, r.deleted_at FROM jsonb_populate_record(NULL::public.expenses, ${json}) AS r ON CONFLICT (trip_id, client_item_id) DO UPDATE SET title = EXCLUDED.title, amount = EXCLUDED.amount, payer = EXCLUDED.payer, currency = EXCLUDED.currency, expense_date = EXCLUDED.expense_date, deleted_at = EXCLUDED.deleted_at;`);
    }
    for (const row of data.exchange_purchases) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.exchange_purchases WHERE id = ${sqlLiteral(row.id)} AND trip_id <> ${tripId};`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture exchange purchase id belongs to another trip: %', ${sqlLiteral(row.id)}; END IF;`);
      body.push(`  SELECT count(*) INTO match_count FROM public.exchange_purchases WHERE trip_id = ${tripId} AND client_item_id = ${sqlLiteral(row.client_item_id)} AND id <> ${sqlLiteral(row.id)};`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture exchange purchase business key has a different local id: %', ${sqlLiteral(row.client_item_id)}; END IF;`);
      body.push(`  INSERT INTO public.exchange_purchases (id, trip_id, client_item_id, foreign_currency, purchase_date, twd_amount, foreign_amount) SELECT r.id, r.trip_id, r.client_item_id, r.foreign_currency, r.purchase_date, r.twd_amount, r.foreign_amount FROM jsonb_populate_record(NULL::public.exchange_purchases, ${json}) AS r ON CONFLICT (id) DO UPDATE SET foreign_currency = EXCLUDED.foreign_currency, purchase_date = EXCLUDED.purchase_date, twd_amount = EXCLUDED.twd_amount, foreign_amount = EXCLUDED.foreign_amount;`);
    }
    for (const row of data.other_info_items) {
      const json = sqlLiteral(JSON.stringify(row)) + "::jsonb";
      body.push(`  SELECT count(*) INTO match_count FROM public.other_info_items WHERE id = ${sqlLiteral(row.id)} AND trip_id <> ${tripId};`);
      body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture other-info item id belongs to another trip: %', ${sqlLiteral(row.id)}; END IF;`);
      if (row.client_item_id !== null && row.client_item_id !== undefined) {
        body.push(`  SELECT count(*) INTO match_count FROM public.other_info_items WHERE trip_id = ${tripId} AND client_item_id = ${sqlLiteral(row.client_item_id)} AND id <> ${sqlLiteral(row.id)};`);
        body.push(`  IF match_count > 0 THEN RAISE EXCEPTION 'Fixture other-info business key has a different local id: %', ${sqlLiteral(row.client_item_id)}; END IF;`);
      }
      body.push(`  INSERT INTO public.other_info_items (id, trip_id, client_item_id, folder_id, title, content, allowed_roles, sort_order, deleted_at) SELECT r.id, r.trip_id, r.client_item_id, r.folder_id, r.title, r.content, r.allowed_roles, r.sort_order, r.deleted_at FROM jsonb_populate_record(NULL::public.other_info_items, ${json}) AS r ON CONFLICT (id) DO UPDATE SET folder_id = EXCLUDED.folder_id, title = EXCLUDED.title, content = EXCLUDED.content, allowed_roles = EXCLUDED.allowed_roles, sort_order = EXCLUDED.sort_order, deleted_at = EXCLUDED.deleted_at;`);
    }
    if (previousData) {
      for (const row of previousData.checklist_items.filter((item) => !data.checklist_items.some((next) => next.id === item.id || (next.checklist_id === item.checklist_id && next.client_item_id === item.client_item_id)))) {
        body.push(`  DELETE FROM public.checklist_items WHERE id = ${sqlLiteral(row.id)} AND checklist_id IN (SELECT id FROM public.checklists WHERE trip_id = ${tripId} AND scope = 'shared');`);
      }
      for (const row of previousData.checklists.filter((item) => !data.checklists.some((next) => next.id === item.id))) {
        body.push(`  DELETE FROM public.checklists WHERE id = ${sqlLiteral(row.id)} AND trip_id = ${tripId} AND scope = 'shared';`);
      }
      for (const row of previousData.expenses.filter((item) => !data.expenses.some((next) => next.trip_id === item.trip_id && next.client_item_id === item.client_item_id))) {
        body.push(`  DELETE FROM public.expenses WHERE trip_id = ${tripId} AND client_item_id = ${sqlLiteral(row.client_item_id)};`);
      }
      for (const row of previousData.exchange_purchases.filter((item) => !data.exchange_purchases.some((next) => next.id === item.id || (next.trip_id === item.trip_id && next.client_item_id === item.client_item_id)))) {
        body.push(`  DELETE FROM public.exchange_purchases WHERE trip_id = ${tripId} AND client_item_id = ${sqlLiteral(row.client_item_id)};`);
      }
      for (const row of previousData.other_info_items.filter((item) => !data.other_info_items.some((next) => next.id === item.id || (next.trip_id === item.trip_id && next.client_item_id === item.client_item_id)))) {
        body.push(`  DELETE FROM public.other_info_items WHERE trip_id = ${tripId} AND id = ${sqlLiteral(row.id)};`);
      }
    }
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
