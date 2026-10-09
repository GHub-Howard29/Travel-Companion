import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const status = JSON.parse(process.env.TC_LOCAL_SUPABASE_STATUS ?? execFileSync("supabase", ["status","--output","json"],{encoding:"utf8"}));
const origin=status.API_URL, key=status.ANON_KEY, service=status.SERVICE_ROLE_KEY;
const suffix=Date.now().toString(36), trip="v3926-api-"+suffix;
const departureDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const editor="v3926-editor-"+suffix+"@example.invalid";
const outsider="v3926-outsider-"+suffix+"@example.invalid";
const ordinaryUser="v3926-user-"+suffix+"@example.invalid";
const admin="v3926-admin-"+suffix+"@example.invalid";
const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
function jwt(email,role="authenticated") {
  const h=encode({alg:"HS256",typ:"JWT"}), p=encode({iss:"supabase",aud:"authenticated",role,sub:randomUUID(),email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
  return h+"."+p+"."+createHmac("sha256",status.JWT_SECRET).update(h+"."+p).digest("base64url");
}
async function req(path,token=key,method="GET",body) {
 const r=await fetch(origin+path,{method,headers:{apikey:key,Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json","Prefer":"return=representation"}:{})},body:body?JSON.stringify(body):undefined});
 const t=await r.text();let data;try{data=JSON.parse(t)}catch{data=t}
 return {status:r.status,data};
}
async function must(path,token,method,body) {const r=await req(path,token,method,body);if(r.status>=400)throw new Error(method+" "+path+" HTTP "+r.status+": "+JSON.stringify(r.data).slice(0,350));return r.data;}
try {
 await must("/rest/v1/admin_users",service,"POST",{email:admin,role:"super_admin",trip_id:trip});
 await must("/rest/v1/trips",jwt(admin),"POST",{id:trip,title:"API private fixture",departure_date:departureDate,created_by:null,content:{days:[1],daysData:{"1":[]},participantEmailMap:{Tester:"private@example.invalid"}}});
 const initial=await req("/rest/v1/trips?id=eq."+trip+"&select=is_public",service);
 assert.equal(initial.data[0].is_public,false,"New Trip must default to private");
 console.log("PASS newly created Trip defaults to private");
 await must("/rest/v1/admin_users",service,"POST",[{email:editor,role:"trip_editor",trip_id:trip},{email:outsider,role:"trip_editor",trip_id:"different-"+trip}]);
 const guest=await req("/rest/v1/trips?id=eq."+trip+"&select=id");
 assert.equal(guest.status,200);assert.deepEqual(guest.data,[]); console.log("PASS guest cannot read private Trip");
 const userToken=jwt(ordinaryUser);
 const privateUser=await req("/rest/v1/trips?id=eq."+trip+"&select=id",userToken);
 assert.equal(privateUser.status,200);assert.deepEqual(privateUser.data,[]);console.log("PASS ordinary authenticated user cannot read private Trip");
 const editorToken=jwt(editor),outToken=jwt(outsider);
 const good=await req("/rest/v1/trips?id=eq."+trip+"&select=id,title,is_public,content",editorToken);
 assert.equal(good.status,200);assert.equal(good.data.length,1); assert.equal(good.data[0].content.participantEmailMap,undefined);
 console.log("PASS invited editor reads private Trip without embedded email");
 const denied=await req("/rest/v1/trips?id=eq."+trip+"&select=id",outToken);
 assert.equal(denied.status,200);assert.deepEqual(denied.data,[]);console.log("PASS uninvited editor cannot read private Trip");
 const allowed=await req("/rest/v1/trips?id=eq."+trip,editorToken,"PATCH",{title:"Authorized edit"});
 assert.equal(allowed.status,200);assert.equal(allowed.data[0]?.title,"Authorized edit"); console.log("PASS invited editor updates title");
 const original=good.data[0].content;
 const changed={...original,days:[1],daysData:{"1":[{id:"v3926-check",title:"Authorized itinerary card",type:"sightseeing"}]}};
 const editContent=await req("/rest/v1/trips?id=eq."+trip,editorToken,"PATCH",{content:changed});
 assert.equal(editContent.status,200,"Editor cannot edit itinerary");
 const readBack=await req("/rest/v1/trips?id=eq."+trip+"&select=content",editorToken);
 assert.equal(readBack.data[0].content.daysData["1"][0].title,"Authorized itinerary card");
 console.log("PASS invited editor edits itinerary content, and cloud readback persists it");
 const deleteCard=await req("/rest/v1/trips?id=eq."+trip,editorToken,"PATCH",{content:{...changed,daysData:{"1":[]}}});
 assert.equal(deleteCard.status,200,"Invited editor cannot delete itinerary card");
 const deletionReadBack=await req("/rest/v1/trips?id=eq."+trip+"&select=content",editorToken);
 assert.deepEqual(deletionReadBack.data[0].content.daysData["1"],[],"Deleted card remained after cloud readback");
 console.log("PASS invited editor deletes itinerary card and cloud readback confirms removal");
 const forbidden=await req("/rest/v1/trips?id=eq."+trip,editorToken,"PATCH",{is_public:true});
 assert.ok(forbidden.status>=400);console.log("PASS editor cannot publish Trip (HTTP "+forbidden.status+")");
 const rpc=await req("/rest/v1/rpc/tc_read_trip_participant_email_map",editorToken,"POST",{target_trip_id:trip});
 assert.equal(rpc.status,200);assert.equal(rpc.data.Tester,"private@example.invalid");console.log("PASS invited editor can read protected email");
 const guestRpc=await req("/rest/v1/rpc/tc_read_trip_participant_email_map",key,"POST",{target_trip_id:trip});
 assert.ok(guestRpc.status>=400);console.log("PASS guest cannot execute private-email RPC");
 const scope=x=>"s_"+Buffer.from(x).toString("hex");
 const photoPath=scope(trip)+"/"+scope("test-card")+"/"+randomUUID()+".webp";
 const img=Buffer.from("UklGRgIAAABXRUJQ", "base64"); // Test-only WebP header bytes.
 const upload=await fetch(origin+"/storage/v1/object/itinerary-covers/"+photoPath,{
  method:"POST",headers:{apikey:key,Authorization:"Bearer "+service,"Content-Type":"image/webp","x-upsert":"false"},body:img
 });
 assert.ok(upload.ok,"Fixture upload failed "+upload.status+" "+(await upload.text()));
 try {
  const privateGuest=await req("/storage/v1/object/sign/itinerary-covers/"+photoPath,key,"POST",{expiresIn:120});
  assert.ok(privateGuest.status>=400,"Guest signed private cover");console.log("PASS guest cannot sign private cover");
  const privateOutsider=await req("/storage/v1/object/sign/itinerary-covers/"+photoPath,outToken,"POST",{expiresIn:120});
  assert.ok(privateOutsider.status>=400,"Outsider signed private cover");console.log("PASS uninvited editor cannot sign private cover");
  const privateEditor=await req("/storage/v1/object/sign/itinerary-covers/"+photoPath,editorToken,"POST",{expiresIn:120});
  assert.equal(privateEditor.status,200,"Invited editor cannot sign cover: "+JSON.stringify(privateEditor.data));
  console.log("PASS invited editor can sign private cover");
  const direct=await req("/storage/v1/object/public/itinerary-covers/"+photoPath,key);
  assert.ok(direct.status>=400,"Permanent public URL still works");console.log("PASS old public cover URL denied");
  const adminToken=jwt(admin);
  const publish=await req("/rest/v1/trips?id=eq."+trip,adminToken,"PATCH",{is_public:true});
  assert.equal(publish.status,200,"Admin cannot publish Trip");
  const publicGuestTrip=await req("/rest/v1/trips?id=eq."+trip+"&select=id",key);
  assert.equal(publicGuestTrip.status,200);assert.equal(publicGuestTrip.data.length,1,"Guest cannot read public Trip");
  const publicUserTrip=await req("/rest/v1/trips?id=eq."+trip+"&select=id",userToken);
  assert.equal(publicUserTrip.status,200);assert.equal(publicUserTrip.data.length,1,"Ordinary user cannot read public Trip");
  console.log("PASS guest and ordinary authenticated user can read public Trip");
  const publicGuest=await req("/storage/v1/object/sign/itinerary-covers/"+photoPath,key,"POST",{expiresIn:120});
  assert.equal(publicGuest.status,200,"Guest cannot sign public cover: "+JSON.stringify(publicGuest.data));
  console.log("PASS admin publication enables guest signed cover");
  const unpublish=await req("/rest/v1/trips?id=eq."+trip,adminToken,"PATCH",{is_public:false});
  assert.equal(unpublish.status,200,"Admin cannot unpublish Trip");
  const afterPrivate=await req("/rest/v1/trips?id=eq."+trip+"&select=id",key);
  assert.deepEqual(afterPrivate.data,[],"Guest can still read unpublished Trip");
  const afterPrivateSign=await req("/storage/v1/object/sign/itinerary-covers/"+photoPath,key,"POST",{expiresIn:120});
  assert.ok(afterPrivateSign.status>=400,"Guest can still sign unpublished cover");
  console.log("PASS public to private revokes guest Trip read and new cover signatures");
  await must("/rest/v1/admin_users?email=eq."+encodeURIComponent(editor),service,"DELETE");
  const revoked=await req("/rest/v1/trips?id=eq."+trip+"&select=id",editorToken);
  assert.deepEqual(revoked.data,[],"Removed editor still reads private Trip");
  const revokedSign=await req("/storage/v1/object/sign/itinerary-covers/"+photoPath,editorToken,"POST",{expiresIn:120});
  assert.ok(revokedSign.status>=400,"Removed editor can still sign private cover");
  console.log("PASS editor revocation blocks Trip read and new cover signatures");
  for (const [kind,signed] of [["previous editor",privateEditor],["previous guest",publicGuest]]) {
   const url=new URL("/storage/v1"+signed.data.signedURL,origin);
   const old=await fetch(url);
   console.log("OBSERVE signed URL after revocation:",kind,"HTTP",old.status,"path",url.pathname,"body",(await old.text()).slice(0,180));
  }
 } finally {
  await fetch(origin+"/storage/v1/object/itinerary-covers/"+photoPath,{method:"DELETE",headers:{apikey:key,Authorization:"Bearer "+service}});
 }
}finally {
 await req("/rest/v1/admin_users?email=eq."+encodeURIComponent(admin),service,"DELETE");
 await req("/rest/v1/admin_users?email=eq."+encodeURIComponent(editor),service,"DELETE");
 await req("/rest/v1/admin_users?email=eq."+encodeURIComponent(outsider),service,"DELETE");
 await req("/rest/v1/trips?id=eq."+trip,service,"DELETE");
 console.log("Local API fixture cleanup requested:",trip);
}
