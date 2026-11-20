import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const baseUrl = "http://127.0.0.1:54321";
const suffix = randomUUID();
const tripId = `adr001-sr10-${suffix}`;
const email = `adr001-sr10-${suffix}@example.invalid`;
const password = `SR10-${randomUUID()}-Aa9!`;
const clientId = randomUUID();
const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const cli = `${root}\\node_modules\\supabase\\dist\\supabase.js`;
function statusEnv() {
  const out = execFileSync(process.execPath, [cli, "status", "-o", "env"], { cwd: root, encoding: "utf8" });
  const values = {};
  for (const line of out.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)="([^"]*)"$/); if (m) values[m[1]]=m[2]; }
  assert.equal(values.API_URL ?? values.SUPABASE_URL, baseUrl, "Safety stop: non-loopback Supabase.");
  return values;
}
function sql(sqlText) {
  const out = execFileSync(process.execPath, [cli, "db", "query", "--local", "--output-format", "json", sqlText], {
    cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024*1024,
  });
  const first=out.indexOf("["); const last=out.lastIndexOf("]");
  if(first<0 || last<first) return [];
  return JSON.parse(out.slice(first,last+1));
}
const status=statusEnv();
const admin=createClient(baseUrl,status.SERVICE_ROLE_KEY,options);
const client=createClient(baseUrl,status.ANON_KEY,options);
let userId=null;
let fixtureCreated=false;
let statusLabel="BLOCKED";
try {
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error||!created.data.user) throw created.error ?? new Error("Auth fixture creation failed");
  userId=created.data.user.id;
  const grant=await admin.from("admin_users").insert({email,role:"trip_editor",trip_id:tripId});
  if(grant.error) throw grant.error;
  const seeded=await admin.from("trips").insert({
    id:tripId,title:"ADR-001 SR-10 isolated validation",departure_date:"2099-12-31",participants:[],
    currency_config:{code:"JPY",symbol:"¥"},sidebar_config:[],
    content:{days:["2099-12-31","2100-01-01"],daysData:{"1":[],"2":[]}},is_public:false,
  });
  if(seeded.error) throw seeded.error;
  fixtureCreated=true;
  const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session) throw signed.error ?? new Error("No authenticated session");
  const claim=await client.rpc("tc_claim_itinerary_trip_edit_lease",{p_trip_id:tripId,p_client_id:clientId});
  if(claim.error||!claim.data?.[0]?.acquired) throw claim.error ?? new Error("Lease claim failed");
  const initial=sql(`select version from public.itinerary_trip_versions where trip_id='${tripId}'`);
  assert.equal(Number(initial[0].version),1);

  // Invoke the Save RPC with JSONB literal null while auth.uid() reads an isolated authenticated claim context.
  const literalNullSql=`do $$ declare v_message text; begin
  perform set_config('request.jwt.claim.sub','${userId}',true);
  perform set_config('request.jwt.claims','{"sub":"${userId}","role":"authenticated"}',true);
  begin
    perform * from public.tc_save_itinerary_days('${tripId}','${clientId}',1,'null'::jsonb,'${randomUUID()}');
    raise exception 'SR10_UNEXPECTED_ACCEPT';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'ADR001_INVALID_SAVE_INPUT' then raise; end if;
  end;
end $$;`;
  sql(literalNullSql);

  // Save day-keyed object payloads representing a grow then shrink normalization.
  const grow={"1":[{id:"sr10-grow-1"}],"2":[{id:"sr10-grow-2"}],"3":[{id:"sr10-grow-3"}]};
  const saveGrow=await client.rpc("tc_save_itinerary_days",{p_trip_id:tripId,p_client_id:clientId,p_expected_version:1,p_days_data:grow,p_operation_id:randomUUID()});
  if(saveGrow.error) throw saveGrow.error;
  assert.equal(saveGrow.data?.[0]?.saved,true); assert.equal(Number(saveGrow.data?.[0]?.current_version),2);
  const readGrow=sql(`select content, version from public.trips t join public.itinerary_trip_versions v on v.trip_id=t.id where t.id='${tripId}'`);
  assert.deepEqual(readGrow[0].content.daysData,grow); assert.equal(Number(readGrow[0].version),2);

  const shrink={"1":[{id:"sr10-shrink-1"}]};
  const saveShrink=await client.rpc("tc_save_itinerary_days",{p_trip_id:tripId,p_client_id:clientId,p_expected_version:2,p_days_data:shrink,p_operation_id:randomUUID()});
  if(saveShrink.error) throw saveShrink.error;
  assert.equal(saveShrink.data?.[0]?.saved,true); assert.equal(Number(saveShrink.data?.[0]?.current_version),3);
  const readShrink=sql(`select content, version from public.trips t join public.itinerary_trip_versions v on v.trip_id=t.id where t.id='${tripId}'`);
  assert.deepEqual(readShrink[0].content.daysData,shrink); assert.equal(Number(readShrink[0].version),3);
  const history=sql(`select day, previous_items from private.itinerary_day_history where trip_id='${tripId}' order by id`);
  assert.equal(history.length,3,"Grow/shrink should capture history for changed prior day card rows.");
  statusLabel="PASS";
  console.log(JSON.stringify({status:statusLabel,tripId,jsonbLiteralNullRejected:true,grow:{version:2,daysData:grow},shrink:{version:3,daysData:shrink},historyCount:history.length},null,2));
} finally {
  if(fixtureCreated) {
    const trip=await admin.from("trips").delete().eq("id",tripId);
    if(trip.error) console.error("Trip cleanup:",trip.error.message);
    const grant=await admin.from("admin_users").delete().eq("trip_id",tripId);
    if(grant.error) console.error("Editor cleanup:",grant.error.message);
  }
  if(userId) { const del=await admin.auth.admin.deleteUser(userId); if(del.error) console.error("Auth cleanup:",del.error.message); }
}
