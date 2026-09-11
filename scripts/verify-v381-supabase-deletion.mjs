import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.V381_SUPABASE_URL;
const anonKey = process.env.V381_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.V381_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Missing isolated V3.8.1 Supabase credentials");
}

const suffix = randomUUID().slice(0, 8);
const password = `V381-${randomUUID()}-Aa1!`;
const tripId = `trip-${randomUUID()}`;
const emails = {
  superAdmin: `v381-super-${suffix}@example.com`,
  editor: `v381-editor-${suffix}@example.com`,
  ordinary: `v381-user-${suffix}@example.com`,
};
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
};
const admin = createClient(url, serviceRoleKey, clientOptions);
const guest = createClient(url, anonKey, clientOptions);
const createdUserIds = [];
const signedInClients = [];
const channels = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const createUser = async (email) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${email}`);
  createdUserIds.push(data.user.id);
  return data.user;
};
const signIn = async (email) => {
  const client = createClient(url, anonKey, clientOptions);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`Unable to sign in ${email}`);
  client.realtime.setAuth(data.session.access_token);
  signedInClients.push(client);
  return client;
};
const subscribe = (client, userId, events) => new Promise((resolve, reject) => {
  const channel = client
    .channel(`travel-companion:data-revision:${userId}`, { config: { private: true } })
    .on("broadcast", { event: "revision_changed" }, ({ payload }) => events.push(payload));
  const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 10_000);
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      clearTimeout(timer);
      channels.push([client, channel]);
      resolve(channel);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      clearTimeout(timer);
      reject(error ?? new Error(`Realtime subscription ${status}`));
    }
  });
});
const waitForEvent = async (events, previousCount, label) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (events.length > previousCount) return events.at(-1);
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const expectError = async (request, label) => {
  const { error } = await request;
  assert(error, `${label} unexpectedly succeeded`);
};

try {
  const superUser = await createUser(emails.superAdmin);
  const editorUser = await createUser(emails.editor);
  await createUser(emails.ordinary);

  let response = await admin.from("admin_users").insert([
    { email: emails.superAdmin, role: "super_admin", trip_id: "" },
    { email: emails.editor, role: "trip_editor", trip_id: tripId },
  ]);
  if (response.error) throw response.error;
  response = await admin.from("trips").insert({
    id: tripId,
    title: "V3.8.1 API deletion fixture",
    departure_date: "2099-12-31",
    content: { days: [1] },
  });
  if (response.error) throw response.error;
  response = await admin.from("checklists").insert([
    { trip_id: tripId, scope: "shared", title: "shared fixture" },
    { trip_id: tripId, scope: "private", owner_user_id: superUser.id, title: "private fixture" },
  ]);
  if (response.error) throw response.error;
  response = await admin.from("other_info_items").insert({ trip_id: tripId });
  if (response.error) throw response.error;
  response = await admin.from("exchange_purchases").insert({
    trip_id: tripId,
    client_item_id: `v381-${suffix}`,
  });
  if (response.error) throw response.error;
  response = await admin.from("expenses").insert({ trip_id: tripId });
  if (response.error) throw response.error;

  const superClient = await signIn(emails.superAdmin);
  const editorClient = await signIn(emails.editor);
  const ordinaryClient = await signIn(emails.ordinary);
  const superEvents = [];
  const editorEvents = [];
  await subscribe(superClient, superUser.id, superEvents);
  await subscribe(editorClient, editorUser.id, editorEvents);

  await expectError(guest.rpc("tc_delete_trip", { target_trip_id: tripId }), "Guest RPC deletion");
  await expectError(ordinaryClient.rpc("tc_delete_trip", { target_trip_id: tripId }), "User RPC deletion");
  await expectError(editorClient.rpc("tc_delete_trip", { target_trip_id: tripId }), "trip_editor RPC deletion");
  await expectError(superClient.from("trips").delete().eq("id", tripId), "Direct authenticated DELETE");
  await expectError(
    ordinaryClient.from("trip_deletion_tombstones").insert({ trip_id: "forbidden", deletion_revision: 1 }),
    "Direct tombstone INSERT",
  );

  const superBefore = superEvents.length;
  const editorBefore = editorEvents.length;
  const { data: deletionRows, error: deletionError } = await superClient.rpc("tc_delete_trip", {
    target_trip_id: tripId,
  });
  if (deletionError) throw deletionError;
  assert(Array.isArray(deletionRows) && deletionRows.length === 1, "Deletion RPC returned no row");
  assert(deletionRows[0].deleted_trip_id === tripId, "Deletion RPC returned the wrong Trip ID");
  await waitForEvent(superEvents, superBefore, "super_admin deletion Broadcast");
  await waitForEvent(editorEvents, editorBefore, "removed trip_editor deletion Broadcast");

  for (const [label, client] of [
    ["Guest", guest],
    ["User", ordinaryClient],
    ["trip_editor", editorClient],
    ["super_admin", superClient],
  ]) {
    const { data, error } = await client
      .from("trip_deletion_tombstones")
      .select("trip_id,deleted_at,deletion_revision")
      .eq("trip_id", tripId)
      .single();
    if (error) throw error;
    assert(data.trip_id === tripId, `${label} could not read the minimal tombstone`);
  }

  const { data: privateRows, error: privateError } = await admin
    .from("checklists")
    .select("scope")
    .eq("trip_id", tripId);
  if (privateError) throw privateError;
  assert(privateRows.length === 1 && privateRows[0].scope === "private", "Private checklist retention failed");

  await expectError(
    admin.from("trips").insert({
      id: tripId,
      title: "resurrection attempt",
      departure_date: "2099-12-31",
    }),
    "Tombstoned Trip resurrection",
  );
  await expectError(
    superClient.rpc("tc_delete_trip", { target_trip_id: "free-travel-2026-01" }),
    "Protected seed RPC deletion",
  );
  await expectError(
    admin.from("trips").delete().eq("id", "group-tour-2026-10"),
    "Protected seed privileged DELETE",
  );

  console.log("V3.8.1 isolated API roles, RPC, tombstone, Broadcast and seed protection passed");
} finally {
  await Promise.allSettled(channels.map(([client, channel]) => client.removeChannel(channel)));
  await Promise.allSettled(signedInClients.map((client) => client.removeAllChannels()));
  await Promise.allSettled(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
}

process.exit(0);
