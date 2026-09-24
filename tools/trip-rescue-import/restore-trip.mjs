import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const TOOL_VERSION = "0.1.0";
const CONFIRMATION = "RESTORE TRIP";
const TRIP_SELECT = "id, title, departure_date, participants, currency_config, sidebar_config, content, updated_at";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const options = {
  input: valueAfter("--input"),
  output: valueAfter("--output"),
  url: valueAfter("--url") ?? process.env.SUPABASE_URL,
  key: valueAfter("--publishable-key") ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY,
  accessToken: valueAfter("--access-token") ?? process.env.SUPABASE_ACCESS_TOKEN,
  apply: args.includes("--apply"),
  replaceOtherInfo: args.includes("--replace-other-info"),
  validateOnly: args.includes("--validate-only"),
};

const fail = (message) => { throw new Error(message); };
const formatError = (error) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const details = [error.message, error.code && `code=${error.code}`, error.details && `details=${error.details}`, error.hint && `hint=${error.hint}`].filter(Boolean);
    if (details.length > 0) return details.join(" | ");
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const cleanPromptValue = (value) => value.trim().replace(/^"(.*)"$/, "$1");
let promptInterface;
const ask = async (question) => {
  promptInterface ??= createInterface({ input: stdin, output: stdout });
  const answer = await promptInterface.question(question);
  return cleanPromptValue(answer);
};
const closePrompt = () => {
  promptInterface?.close();
  promptInterface = undefined;
};
const collectInteractiveOptions = async () => {
  if (!options.input) options.input = await ask("請貼上救援 JSON 完整路徑：");
  if (options.validateOnly) return;
  if (!options.url) options.url = await ask("請貼上 Supabase URL：");
  if (!options.key) options.key = await ask("請貼上 publishable／anon key：");
  if (!options.accessToken) options.accessToken = await ask("請貼上目前登入 access token：");
};
const resolveInputPath = async () => {
  const candidate = resolve(options.input);
  if (!existsSync(candidate)) fail(`找不到救援檔或資料夾：${candidate}`);
  if (!statSync(candidate).isDirectory()) {
    options.input = candidate;
    return;
  }
  const jsonFiles = readdirSync(candidate, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  if (jsonFiles.length === 0) fail("指定資料夾內找不到 JSON 救援檔");
  if (jsonFiles.length === 1) {
    options.input = join(candidate, jsonFiles[0]);
    return;
  }
  console.log("\n指定資料夾內有多份 JSON，請選擇：");
  jsonFiles.forEach((name, index) => console.log(`${index + 1}. ${name}`));
  const selected = await ask("請輸入編號：");
  const index = Number(selected) - 1;
  if (!Number.isInteger(index) || !jsonFiles[index]) fail("選擇無效，已停止");
  options.input = join(candidate, jsonFiles[index]);
};
const maskSecret = (value) => {
  if (!value) return "（未提供）";
  if (value.length <= 12) return `${value.slice(0, 3)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};
const confirmInteractiveOptions = async () => {
  console.log("\n請核對以下輸入資料：");
  console.log(`救援檔：${options.input}`);
  if (options.validateOnly) return;
  console.log(`Supabase URL：${options.url}`);
  console.log(`Publishable／anon key：${options.key}`);
  console.log(`Access token：${maskSecret(options.accessToken)}`);
  const answer = await ask("以上資料是否正確？輸入 Y 繼續，輸入 N 離開：");
  if (!/^y$/i.test(answer)) fail("使用者取消，未連線且未寫入任何資料");
};
const readRescue = () => {
  if (!options.input) fail("請指定 --input 救援 JSON 路徑");
  const path = resolve(options.input);
  if (!existsSync(path)) fail(`找不到救援 JSON：${path}`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("救援 JSON 無法解析"); }
};
const assertRescue = (document) => {
  if (document?.format !== "travel-companion-full-local-rescue" || document.formatVersion !== 2) {
    fail("只接受 Travel Companion 完整救援格式 v2");
  }
  const record = document.trip?.record;
  const tripId = document.trip?.tripId;
  if (!tripId || record?.meta?.id !== tripId || record?.detail?.id !== tripId) fail("救援檔 Trip 識別資料不一致");
  if (!record.detail?.content || !record.meta?.currencyConfig) fail("救援檔缺少可復原的 Trip 內容");
  if (document.data?.otherInfoItems?.value && !Array.isArray(document.data.otherInfoItems.value)) fail("其他資訊資料格式不正確");
};
const normalized = (value) => {
  const sortKeys = (item) => {
    if (Array.isArray(item)) return item.map(sortKeys);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sortKeys(item[key])]));
  };
  return JSON.stringify(sortKeys(value));
};
const shortDiff = (before, after) => {
  if (normalized(before) === normalized(after)) return null;
  return { before, after };
};
const buildTripPayload = (record) => ({
  id: record.meta.id,
  title: record.meta.title,
  departure_date: record.meta.departureDate,
  participants: record.meta.participants ?? [],
  currency_config: record.meta.currencyConfig,
  sidebar_config: record.detail.sidebarConfig ?? [],
  content: record.detail.content,
});
const toOtherInfoRow = (tripId, item) => ({
  trip_id: tripId,
  client_item_id: item.id,
  folder_id: item.folderId ?? "",
  title: item.title ?? "",
  content: item.content ?? "",
  allowed_roles: item.allowedRoles?.length ? item.allowedRoles : null,
  sort_order: Number.isFinite(item.order) ? item.order : 0,
  deleted_at: null,
});
const fetchCurrent = async (supabase, tripId) => {
  const { data: authData, error: authError } = await supabase.auth.getUser(options.accessToken);
  if (authError) throw new Error(`驗證 access token 失敗：${formatError(authError)}`);
  const [{ data: trip, error: tripError }, { data: items, error: itemsError }, { data: exchange, error: exchangeError }, { data: checklists, error: checklistError }, { data: expenses, error: expenseError }] = await Promise.all([
    supabase.from("trips").select(TRIP_SELECT).eq("id", tripId).maybeSingle(),
    supabase.from("other_info_items").select("id, client_item_id, trip_id, folder_id, title, content, allowed_roles, sort_order, created_at, updated_at, deleted_at").eq("trip_id", tripId),
    supabase.from("exchange_purchases").select("client_item_id, trip_id, foreign_currency, purchase_date, twd_amount, foreign_amount, created_at, updated_at").eq("trip_id", tripId),
    supabase.from("checklists").select("id, scope, owner_user_id, updated_at").eq("trip_id", tripId),
    supabase.from("expenses").select("id, trip_id, client_item_id, title, amount, payer, currency, expense_date, created_at, updated_at, deleted_at, owner_user_id, recorded_by_email").eq("trip_id", tripId),
  ]);
  if (tripError) throw new Error(`讀取 trips 失敗：${formatError(tripError)}`);
  if (itemsError) throw new Error(`讀取 other_info_items 失敗：${formatError(itemsError)}`);
  if (exchangeError) throw new Error(`讀取 exchange_purchases 失敗：${formatError(exchangeError)}`);
  if (checklistError) throw new Error(`讀取 checklists 失敗：${formatError(checklistError)}`);
  if (expenseError) throw new Error(`讀取 expenses 失敗：${formatError(expenseError)}`);
  if (!trip) fail(`找不到雲端 Trip：${tripId}`);
  return { trip, otherInfoItems: items ?? [], exchangePurchases: exchange ?? [], checklists: checklists ?? [], expenses: expenses ?? [], user: authData.user };
};
const makePlan = (document, current) => {
  const tripId = document.trip.tripId;
  const targetTrip = buildTripPayload(document.trip.record);
  const targetItems = (document.data.otherInfoItems?.value ?? [])
    .filter((item) => item?.tripId === tripId && !item.isDeleted)
    .map((item) => toOtherInfoRow(tripId, item));
  const currentByClientId = new Map(current.otherInfoItems.filter((item) => item.client_item_id).map((item) => [item.client_item_id, item]));
  const targetIds = new Set(targetItems.map((item) => item.client_item_id));
  const changedItems = targetItems.filter((item) => {
    const existing = currentByClientId.get(item.client_item_id);
    return !existing || ["folder_id", "title", "content", "allowed_roles", "sort_order", "deleted_at"].some((key) => JSON.stringify(existing[key] ?? null) !== JSON.stringify(item[key] ?? null));
  });
  const missingFromRescue = current.otherInfoItems.filter((item) => item.client_item_id && !targetIds.has(item.client_item_id) && !item.deleted_at);
  const exchangeSource = document.data.exchangePurchases?.cloud?.value ?? document.data.exchangePurchases?.local?.value ?? [];
  const exchangePurchases = Array.isArray(exchangeSource) ? exchangeSource.filter((item) => item?.tripId === tripId).map((item) => ({ trip_id: tripId, client_item_id: item.id, foreign_currency: item.foreignCurrency, purchase_date: item.purchaseDate, twd_amount: item.twdAmount, foreign_amount: item.foreignAmount })) : [];
  const privateSources = (document.data.privateChecklists ?? []).map((entry) => entry.value).filter((value) => value?.tripId === tripId && value.userEmail?.toLowerCase() === current.user?.email?.toLowerCase());
  const privateItems = privateSources.flatMap((value) => (value.items ?? []).map((item, sortOrder) => ({ client_item_id: item.id, label: item.label, is_checked: Boolean(item.isChecked), sort_order: sortOrder, deleted_at: null })));
  const sharedCheckedIds = document.data.sharedChecklistProgress?.value?.checkedItemIds;
  const expenseValues = [
    ...(document.data.expenseCache?.books ?? []).flatMap((entry) => Array.isArray(entry.value) ? entry.value : []),
    ...(Array.isArray(document.data.expenseCache?.offlineQueueForTrip?.value) ? document.data.expenseCache.offlineQueueForTrip.value : []),
  ];
  const expenseRows = expenseValues.filter((item) => item?.trip_id === tripId).map((item) => ({
    trip_id: tripId,
    client_item_id: item.client_item_id || String(item.id),
    title: item.title ?? "",
    amount: Number(item.amount) || 0,
    payer: item.payer ?? "",
    currency: item.currency ?? "JPY",
    expense_date: item.expense_date ?? null,
    created_at: item.created_at ?? undefined,
    updated_at: item.updated_at ?? undefined,
    deleted_at: item.deleted_at ?? null,
    recorded_by_email: item.recorded_by_email ?? current.user?.email ?? null,
  }));
  return {
    tripId,
    expectedUpdatedAt: current.trip.updated_at,
    trip: { changed: shortDiff(current.trip, targetTrip), target: targetTrip },
    otherInfo: { currentCount: current.otherInfoItems.length, targetCount: targetItems.length, changedItems, missingFromRescue },
    exchangePurchases: { currentCount: current.exchangePurchases.length, targetCount: exchangePurchases.length, rows: exchangePurchases },
    privateChecklist: { currentUserEmail: current.user?.email ?? null, currentChecklistCount: current.checklists.filter((item) => item.scope === "private" && item.owner_user_id === current.user?.id).length, targetItemCount: privateItems.length, items: privateItems },
    sharedChecklist: { checkedItemIds: Array.isArray(sharedCheckedIds) ? sharedCheckedIds : [], available: current.checklists.some((item) => item.scope === "shared") },
    expenses: { currentCount: current.expenses.length, targetCount: expenseRows.length, rows: expenseRows },
    unsupportedDomains: ["admin_users 權限表、Storage 附件與 IndexedDB 附件（不以本機快取冒充遠端權限或二進位檔）"],
  };
};
const writePreRestore = (outputDir, document, current, plan) => {
  const folder = resolve(outputDir ?? `pre_restore_${new Date().toISOString().replace(/[-:.]/g, "")}`);
  mkdirSync(folder, { recursive: true });
  const snapshot = { format: "travel-companion-pre-restore", formatVersion: 1, createdAt: new Date().toISOString(), tripId: plan.tripId, sourceRescueSha256: sha256(JSON.stringify(document)), current, plan };
  const path = `${folder}/pre-restore-${plan.tripId}.json`;
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return path;
};
const applyPlan = async (supabase, plan, document, currentUserId) => {
  const { data: trip, error: tripError } = await supabase.from("trips").update(plan.trip.target).eq("id", plan.tripId).eq("updated_at", plan.expectedUpdatedAt).select(TRIP_SELECT).maybeSingle();
  if (tripError) throw tripError;
  if (!trip) fail("Trip 已在預覽後被其他人修改，樂觀鎖定停止復原；請重新預覽");
  const targetItems = (document.data.otherInfoItems?.value ?? []).filter((item) => item?.tripId === plan.tripId && !item.isDeleted).map((item) => toOtherInfoRow(plan.tripId, item));
  for (const row of targetItems) {
    const { data: updated, error: updateError } = await supabase.from("other_info_items").update(row).eq("trip_id", row.trip_id).eq("client_item_id", row.client_item_id).select("id");
    if (updateError) throw updateError;
    if ((updated ?? []).length === 0) {
      const { error: insertError } = await supabase.from("other_info_items").insert(row);
      if (insertError) throw insertError;
    }
  }
  if (options.replaceOtherInfo) {
    const targetIds = new Set(targetItems.map((item) => item.client_item_id));
    const idsToDelete = plan.otherInfo.missingFromRescue.filter((item) => item.client_item_id && !targetIds.has(item.client_item_id)).map((item) => item.client_item_id);
    if (idsToDelete.length > 0) {
      const { error } = await supabase.from("other_info_items").update({ deleted_at: new Date().toISOString() }).eq("trip_id", plan.tripId).in("client_item_id", idsToDelete);
      if (error) throw error;
    }
  }
  if (plan.exchangePurchases.rows.length > 0) {
    const { error } = await supabase.from("exchange_purchases").upsert(plan.exchangePurchases.rows, { onConflict: "trip_id,client_item_id" });
    if (error) throw error;
  }
  if (plan.privateChecklist.items.length > 0 && plan.privateChecklist.currentUserEmail) {
    const { data: checklist, error: checklistError } = await supabase.from("checklists").select("id").eq("trip_id", plan.tripId).eq("scope", "private").eq("owner_user_id", currentUserId).maybeSingle();
    if (checklistError) throw checklistError;
    let checklistId = checklist?.id;
    if (!checklistId) {
      const { data: created, error } = await supabase.from("checklists").insert({ trip_id: plan.tripId, scope: "private", owner_user_id: currentUserId, created_by: currentUserId, title: "私人清單" }).select("id").single();
      if (error) throw error;
      checklistId = created.id;
    }
    const { data: existing, error: existingError } = await supabase.from("checklist_items").select("id, client_item_id").eq("checklist_id", checklistId);
    if (existingError) throw existingError;
    const existingByClientId = new Map((existing ?? []).filter((row) => row.client_item_id).map((row) => [row.client_item_id, row.id]));
    for (const item of plan.privateChecklist.items) {
      const payload = { label: item.label, is_checked: item.is_checked, sort_order: item.sort_order, deleted_at: null };
      if (existingByClientId.has(item.client_item_id)) {
        const { error } = await supabase.from("checklist_items").update(payload).eq("id", existingByClientId.get(item.client_item_id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from("checklist_items").insert({ checklist_id: checklistId, client_item_id: item.client_item_id, created_by: currentUserId, ...payload });
        if (error) throw error;
      }
    }
  }
  if (plan.sharedChecklist.checkedItemIds.length > 0) {
    const { data: shared, error: sharedError } = await supabase.from("checklists").select("id").eq("trip_id", plan.tripId).eq("scope", "shared").maybeSingle();
    if (sharedError) throw sharedError;
    if (shared) {
      const { data: rows, error } = await supabase.from("checklist_items").select("id, client_item_id").eq("checklist_id", shared.id);
      if (error) throw error;
      for (const row of rows ?? []) {
        if (!row.client_item_id) continue;
        const { error: updateError } = await supabase.from("checklist_items").update({ is_checked: plan.sharedChecklist.checkedItemIds.includes(row.client_item_id) }).eq("id", row.id);
        if (updateError) throw updateError;
      }
    }
  }
  if (plan.expenses.rows.length > 0) {
    const { error } = await supabase.from("expenses").upsert(plan.expenses.rows, { onConflict: "trip_id,client_item_id" });
    if (error) throw error;
  }
};

const main = async () => {
  await collectInteractiveOptions();
  await resolveInputPath();
  await confirmInteractiveOptions();
  const document = readRescue();
  assertRescue(document);
  if (options.validateOnly) {
    console.log(JSON.stringify({ valid: true, format: document.format, formatVersion: document.formatVersion, toolVersion: TOOL_VERSION, tripId: document.trip.tripId, domains: Object.keys(document.data ?? {}) }, null, 2));
    return;
  }
  if (!options.url || !options.key || !options.accessToken) fail("預覽／復原都需要 --url、--publishable-key、--access-token，且不接受 service_role key");
  const supabase = createClient(options.url, options.key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${options.accessToken}` } } });
  const current = await fetchCurrent(supabase, document.trip.tripId);
  const plan = makePlan(document, current);
  console.log(JSON.stringify({ toolVersion: TOOL_VERSION, mode: options.apply ? "APPLY" : "PREVIEW", ...plan, replaceOtherInfo: options.replaceOtherInfo }, null, 2));
  let shouldApply = options.apply;
  if (!shouldApply) {
    const applyAnswer = await ask("\n是否執行復原？輸入 Y 執行，輸入 N 離開：");
    shouldApply = /^y$/i.test(applyAnswer);
  }
  if (!shouldApply) { console.log("\n已選擇不復原，未寫入任何資料。\n"); return; }
  const answer = await ask(`\n這會覆寫 Trip ${plan.tripId} 與救援包內可復原資料，請輸入 ${CONFIRMATION}：`);
  if (answer.trim() !== CONFIRMATION) fail("未取得精確確認，已停止且未寫入資料");
  const preRestorePath = writePreRestore(options.output, document, current, plan);
  await applyPlan(supabase, plan, document, current.user?.id);
  console.log(`復原完成。pre_restore 快照：${preRestorePath}`);
};

await main().catch((error) => { console.error(`\n受控復原工具停止：${formatError(error)}`); process.exitCode = 1; }).finally(closePrompt);
