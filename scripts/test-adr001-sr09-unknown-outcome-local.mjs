import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const root=process.cwd(), base="http://127.0.0.1:54321", suffix=randomUUID();
const tripId="adr001-sr09-"+suffix, email="adr001-sr09-"+suffix+"@example.invalid", password="SR09-"+randomUUID()+"-Aa9!";
const clientId=randomUUID(), operationId=randomUUID(), options={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
const cli=root+"\\node_modules\\supabase\\dist\\supabase.js";
const envOut=execFileSync(process.execPath,[cli,"status","-o","env"],{cwd:root,encoding:"utf8"});
const env={};for(const line of envOut.split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)="([^"]*)"$/);if(m)env[m[1]]=m[2];}
assert.equal(env.API_URL??env.SUPABASE_URL,base,"Loopback-only guard");
const admin=createClient(base,env.SERVICE_ROLE_KEY,options);
let userId=null,cleaned=false,pass=false,simulatedLostResponse=false,saveReturnedError=false,readback=null;
try{
 const {data:created,error:createErr}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(createErr)throw createErr;userId=created.user.id;
 const {error:roleErr}=await admin.from("admin_users").insert({email,role:"trip_editor",trip_id:tripId});if(roleErr)throw roleErr;
 const {error:tripErr}=await admin.from("trips").insert({id:tripId,title:"ADR001 SR-09 unknown outcome fixture",departure_date:"2099-12-31",participants:[],currency_config:{code:"JPY",symbol:"¥"},sidebar_config:[],content:{days:["2099-12-31"],daysData:{"1":[]}},is_public:false,created_by:userId});if(tripErr)throw tripErr;
 const {data:authData,error:signErr}=await createClient(base,env.ANON_KEY,options).auth.signInWithPassword({email,password});if(signErr)throw signErr;
 const userClient=createClient(base,env.ANON_KEY,{...options,global:{fetch:async(input,init)=>{const url=typeof input==="string"?input:input.url;const response=await fetch(input,init);if(url.includes("/rpc/tc_save_itinerary_days")&&init?.method==="POST"){await response.clone().text();simulatedLostResponse=true;throw new TypeError("SR09 simulated response loss after backend response received");}return response;}}});
 const {error:sessionErr}=await userClient.auth.setSession({access_token:authData.session.access_token,refresh_token:authData.session.refresh_token});if(sessionErr)throw sessionErr;
 const claim=await userClient.rpc("tc_claim_itinerary_trip_edit_lease",{p_trip_id:tripId,p_client_id:clientId});assert.equal(claim.error,null);assert.equal(claim.data[0]?.acquired,true);
 const payload={"1":[{id:"sr09-commit-once",title:"backend committed but response lost"}]};
 const save=await userClient.rpc("tc_save_itinerary_days",{p_trip_id:tripId,p_client_id:clientId,p_expected_version:1,p_days_data:payload,p_operation_id:operationId});
 saveReturnedError=!!save.error;assert(save.error,"Expected client-visible error from simulated lost response");assert(simulatedLostResponse,"Proxy did not simulate response loss");
 const {data:cloud,error:readErr}=await admin.from("trips").select("content").eq("id",tripId).single();if(readErr)throw readErr;
 const sqlOut=execFileSync(process.execPath,[cli,"db","query","--local","--output-format","json",`select version from public.itinerary_trip_versions where trip_id='${tripId}'`],{cwd:root,encoding:"utf8"});
 const first=sqlOut.indexOf("[");const last=sqlOut.lastIndexOf("]");assert(first>=0&&last>=first,"Version query JSON parse failed");const versionRows=JSON.parse(sqlOut.slice(first,last+1));
 readback={daysData:cloud.content.daysData,version:versionRows[0]?.version};
 assert.deepEqual(readback.daysData,payload,"Independent readback must show the committed payload");
 assert.equal(Number(readback.version),2,"Unknown-outcome readback must show exactly one version advance");
 pass=true;
 console.log(JSON.stringify({test:"ADR001 SR-09 commit-then-response-loss; no retry; independent readback",localOnly:true,pass,simulatedLostResponse,saveReturnedError,operationId,readback,decision:"resolved as committed by readback; no duplicate Save request"},null,2));
}catch(e){console.error("SR-09 FAILED:",e.stack??e);process.exitCode=1;}
finally{
 try{await admin.from("itinerary_trip_edit_leases").delete().eq("trip_id",tripId);await admin.from("itinerary_trip_versions").delete().eq("trip_id",tripId);await admin.from("trips").delete().eq("id",tripId);await admin.from("admin_users").delete().eq("trip_id",tripId);if(userId)await admin.auth.admin.deleteUser(userId);cleaned=true;}catch(e){console.error("cleanup failed:",e.message);process.exitCode=1;}
 console.log(JSON.stringify({cleanup:cleaned}));
 if(!pass||!cleaned)process.exitCode=1;
}
