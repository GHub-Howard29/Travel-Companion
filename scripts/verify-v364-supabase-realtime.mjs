import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.V364_SUPABASE_URL;
const anonKey = process.env.V364_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.V364_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Missing local Supabase CI credentials");
}

const runId = randomUUID();
const suffix = runId.slice(0, 8);
const password = `V364-${runId}-Aa1!`;
const sourceClientId = randomUUID();
const tripId = `v364-realtime-${suffix}`;
const emails = {
  superAdmin: `v364-super-${suffix}@example.com`,
  editor: `v364-editor-${suffix}@example.com`,
  ordinary: `v364-user-${suffix}@example.com`,
};

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
};
const admin = createClient(url, serviceRoleKey, clientOptions);
const writer = createClient(url, serviceRoleKey, {
  ...clientOptions,
  global: { headers: { "x-travel-companion-client-id": sourceClientId } },
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = (promise, milliseconds, label) => Promise.race([
  promise,
  delay(milliseconds).then(() => {
    throw new Error(`${label} timed out after ${milliseconds}ms`);
  }),
]);

const createUser = async (email) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${email}`);
  return data.user;
};

const signIn = async (email) => {
  const client = createClient(url, anonKey, clientOptions);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`Unable to sign in ${email}`);
  client.realtime.setAuth(data.session.access_token);
  return client;
};

const subscribe = (client, topic, events) => new Promise((resolve, reject) => {
  const channel = client
    .channel(topic, { config: { private: true, broadcast: { ack: true } } })
    .on("broadcast", { event: "revision_changed" }, ({ payload }) => events.push(payload));
  const timer = setTimeout(() => reject(new Error(`Timed out subscribing to ${topic}`)), 10_000);
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      clearTimeout(timer);
      resolve(channel);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      clearTimeout(timer);
      reject(error ?? new Error(`${topic} subscription ${status}`));
    }
  });
});

const expectRejectedSubscription = (client, topic) => new Promise((resolve, reject) => {
  const channel = client.channel(topic, { config: { private: true } });
  const timer = setTimeout(() => reject(new Error(`Unauthorized topic did not reject: ${topic}`)), 10_000);
  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      clearTimeout(timer);
      void client.removeChannel(channel);
      resolve();
    } else if (status === "SUBSCRIBED") {
      clearTimeout(timer);
      void client.removeChannel(channel);
      reject(new Error(`Unauthorized topic subscribed: ${topic}`));
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

const userIds = [];
const channels = [];
const signedInClients = [];

try {
  const superUser = await createUser(emails.superAdmin);
  const editorUser = await createUser(emails.editor);
  const ordinaryUser = await createUser(emails.ordinary);
  // Keep the no-role user for the transaction-safe SQL validation that runs
  // next. The ephemeral database volume is erased by the workflow teardown.
  userIds.push(superUser.id, editorUser.id);

  const { error: roleError } = await admin.from("admin_users").insert([
    { email: emails.superAdmin, role: "super_admin", trip_id: "" },
    { email: emails.editor, role: "trip_editor", trip_id: tripId },
  ]);
  if (roleError) throw roleError;

  const superClient = await signIn(emails.superAdmin);
  const editorClient = await signIn(emails.editor);
  const ordinaryClient = await signIn(emails.ordinary);
  signedInClients.push(superClient, editorClient, ordinaryClient);
  const superEvents = [];
  const editorEvents = [];

  const superChannel = await subscribe(
    superClient,
    `travel-companion:data-revision:${superUser.id}`,
    superEvents,
  );
  const editorChannel = await subscribe(
    editorClient,
    `travel-companion:data-revision:${editorUser.id}`,
    editorEvents,
  );
  channels.push([superClient, superChannel], [editorClient, editorChannel]);

  await expectRejectedSubscription(
    editorClient,
    `travel-companion:data-revision:${superUser.id}`,
  );
  await expectRejectedSubscription(
    ordinaryClient,
    `travel-companion:data-revision:${ordinaryUser.id}`,
  );
  console.log("Realtime topic authorization checks passed");

  const editorBeforeInsert = editorEvents.length;
  const superBeforeInsert = superEvents.length;
  const { data: insertedTrip, error: insertError } = await writer
    .from("trips")
    .insert({
      id: tripId,
      title: "V3.6.4 Realtime fixture",
      departure_date: "2099-12-31",
      content: { days: [] },
    })
    .select("id,updated_at")
    .single();
  if (insertError) throw insertError;

  const editorInsertEvent = await waitForEvent(editorEvents, editorBeforeInsert, "editor Trip insert event");
  await waitForEvent(superEvents, superBeforeInsert, "super admin Trip insert event");
  assert(editorInsertEvent.source_client_id === sourceClientId, "Broadcast source_client_id mismatch");
  assert(
    Object.keys(editorInsertEvent).sort().join(",") === "id,revision,source_client_id,updated_at",
    `Broadcast payload exposed unexpected fields: ${Object.keys(editorInsertEvent).sort().join(",")}`,
  );
  console.log("Realtime payload and source checks passed");

  const editorBeforeUpdate = editorEvents.length;
  const { error: updateError } = await writer
    .from("trips")
    .update({ title: "V3.6.4 Realtime updated" })
    .eq("id", tripId);
  if (updateError) throw updateError;
  await waitForEvent(editorEvents, editorBeforeUpdate, "editor Trip update event");

  const { data: staleRows, error: staleError } = await editorClient
    .from("trips")
    .update({ title: "stale concurrent write" })
    .eq("id", tripId)
    .eq("updated_at", insertedTrip.updated_at)
    .select("id");
  if (staleError) throw staleError;
  assert(staleRows.length === 0, "Stale updated_at write unexpectedly succeeded");
  console.log("Concurrent updated_at check passed");

  const sendChannel = await subscribe(
    editorClient,
    `travel-companion:data-revision:${editorUser.id}:send-check`,
    [],
  ).catch(() => null);
  assert(sendChannel === null, "Unexpectedly subscribed to an unapproved derived topic");

  const sendResult = await withTimeout(
    editorChannel.send({
      type: "broadcast",
      event: "revision_changed",
      payload: { revision: 999999 },
    }),
    10_000,
    "private Broadcast send acknowledgement",
  );
  assert(sendResult !== "ok", "Browser client was able to publish a private Broadcast");
  console.log("Browser Broadcast send rejection passed");

  const editorBeforeRevoke = editorEvents.length;
  const { error: revokeError } = await writer
    .from("admin_users")
    .delete()
    .eq("email", emails.editor)
    .eq("role", "trip_editor")
    .eq("trip_id", tripId);
  if (revokeError) throw revokeError;
  await waitForEvent(editorEvents, editorBeforeRevoke, "last revocation event");
  console.log("Last revocation event check passed");

  const editorAfterRevoke = editorEvents.length;
  const superBeforePostRevoke = superEvents.length;
  const { error: postRevokeError } = await writer
    .from("trips")
    .update({ title: "post-revocation update" })
    .eq("id", tripId);
  if (postRevokeError) throw postRevokeError;
  await waitForEvent(superEvents, superBeforePostRevoke, "post-revocation super admin event");
  await delay(1_200);
  assert(editorEvents.length === editorAfterRevoke, "Revoked editor received a later Broadcast");

  const { data: hiddenRevision, error: hiddenRevisionError } = await editorClient
    .from("app_data_revision")
    .select("revision");
  if (hiddenRevisionError) throw hiddenRevisionError;
  assert(hiddenRevision.length === 0, "Revoked editor can still read app_data_revision");
  console.log("Post-revocation access and delivery checks passed");

  const superBeforeDelete = superEvents.length;
  const { error: deleteError } = await writer.from("trips").delete().eq("id", tripId);
  if (deleteError) throw deleteError;
  await waitForEvent(superEvents, superBeforeDelete, "Trip delete event");

  console.log("V3.6.4 local Supabase Realtime validation passed");
} finally {
  await Promise.allSettled(channels.map(([client, channel]) => client.removeChannel(channel)));
  await Promise.allSettled(signedInClients.map((client) => client.removeAllChannels()));
  await Promise.allSettled(userIds.map((id) => admin.auth.admin.deleteUser(id)));
}

process.exit(0);
