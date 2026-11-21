import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';

const container='supabase_db_travel-companion';
const uidA='add36e1f-285d-4c0f-b3ac-16bafd89d083', emailA='v391-admin@example.invalid';
const uidB='e512dcb0-cc1c-47a5-84de-b1cc498abc41', emailB='weather-rc-test-1@example.invalid';
const trip='adr001-sr05-rpc-'+randomUUID(), clientA=randomUUID(),clientB=randomUUID();
const fn='private.tc_adr001_slow_'+randomUUID().replaceAll('-',''), trg='tc_adr001_slow_'+randomUUID().replaceAll('-','');
const psqlArgs=['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-t','-A','-v','ON_ERROR_STOP=1'];
function run(sql){return new Promise((resolve,reject)=>{const p=spawn('docker',psqlArgs,{stdio:['pipe','pipe','pipe']});let o='',e='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>e+=d);p.on('error',reject);p.on('close',c=>c===0?resolve(o.trim()):reject(new Error(e||o||'psql failure')));p.stdin.end(sql);});}
function concurrent(sql){const p=spawn('docker',psqlArgs,{stdio:['pipe','pipe','pipe']});let o='',e='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>e+=d);const done=new Promise((resolve,reject)=>p.on('close',c=>c===0?resolve(o.trim()):reject(new Error(e||o||'psql failure'))));p.stdin.end(sql);return done;}
const claims=(uid,email)=>`set role authenticated;set request.jwt.claims='${JSON.stringify({sub:uid,email,role:'authenticated'})}';`;
const startedAt=new Date().toISOString();let rec={test:'ADR001 SR-05 true concurrent Save RPC vs Claim RPC',startedAt,localOnly:true,pass:false};
const q=s=>s.replaceAll("'","''");
try{
 await run(`insert into public.trips(id,title,departure_date,participants,currency_config,sidebar_config,content,created_by,is_public) values('${q(trip)}','ADR001 concurrency fixture',current_date,'[]'::jsonb,'{"code":"JPY","symbol":"Y"}'::jsonb,'[]'::jsonb,'{"daysData":{"1":[]}}'::jsonb,'${uidA}',false);`);
 const claimA=await run(`${claims(uidA,emailA)}select * from public.tc_claim_trip_itinerary_edit_lease('${q(trip)}','${clientA}');reset role;`);
 await run(`create function ${fn}() returns trigger language plpgsql as $$ begin if old.id='${q(trip)}' and old.content->'daysData' is distinct from new.content->'daysData' then perform pg_sleep(6);end if;return new;end $$;create trigger ${trg} before update on public.trips for each row execute function ${fn}();`);
 const saveSql=`${claims(uidA,emailA)}select * from public.tc_save_trip_itinerary('${q(trip)}','${clientA}',0,'{"1":[{"id":"rpc-save-A"}]}');reset role;`;
 const save=concurrent(saveSql);
 await new Promise(r=>setTimeout(r,900));
 const claimBStartedAt=new Date().toISOString();
 const claimSql=`${claims(uidB,emailB)}select * from public.tc_claim_trip_itinerary_edit_lease('${q(trip)}','${clientB}');reset role;`;
 const claim=concurrent(claimSql);
 const [saveOut,claimOut]=await Promise.all([save,claim]);
 const final=await run(`select v.version::text||'|'||(t.content->'daysData')::text from public.trip_itinerary_versions v join public.trips t on t.id=v.trip_id where t.id='${q(trip)}';select owner_user_id::text||'|'||owner_client_id::text from public.trip_itinerary_edit_leases where trip_id='${q(trip)}';`);
 const pass=saveOut.includes('1')&&claimOut.includes('f')&&final.includes('rpc-save-A')&&final.includes(uidA)&&final.includes(clientA);
 rec={...rec,pass,claimA,saveCompleted:true,claimBStartedAt,saveOut,claimOut,finalState:final,noDeadlock:true,cleanedUp:false,finishedAt:new Date().toISOString()};
}catch(e){rec.error=e.message;rec.finishedAt=new Date().toISOString();}
finally{
 try{await run(`drop trigger if exists ${trg} on public.trips;drop function if exists ${fn}();delete from public.trips where id='${q(trip)}';`);rec.cleanedUp=true;}catch(e){rec.cleanupError=e.message;}
 rec.finishedAt??=new Date().toISOString();await mkdir('docs/test-results',{recursive:true});await writeFile('docs/test-results/adr001-stage1-sr05-rpc-latest.json',JSON.stringify(rec,null,2)+'\n','utf8');
}
console.log(JSON.stringify(rec,null,2));if(!rec.pass||!rec.cleanedUp)process.exitCode=1;
