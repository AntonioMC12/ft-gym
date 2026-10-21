import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {fixture,shift} from './class-fixture.mjs';
import {reviewRetention} from '../../centers/services/retention.js';
const list=(f,options={},uid=f.ids.manager)=>f.req('/api/centers/retention?'+new URLSearchParams({centerId:f.center,...options}),uid);
const configure=(f,version=0,fields={enabled:true,daysWithoutVisit:7,includeNeverVisited:true},suffix='config')=>f.req('/api/centers/retention/policy',f.ids.manager,{centerId:f.center,version,fields,requestId:f.p+'_'+suffix});
async function seedMembers(f,count=1,{frozen=false,linked=false}={}){
  const rows=[];await f.db.platformTransaction(f.ids.root,async client=>{for(let n=0;n<count;n++){const id=f.p+'_ret_'+n+(frozen?'_frozen':'');await client.query("INSERT INTO centers.members(id,center_id,member_number,name,state,joined_on,account_uid) VALUES($1,$2,$3,$4,$5,$6::date-20,$7)",[id,f.center,'R-'+id,'Fictional retention '+n,frozen?'frozen':'active',f.today,linked?f.ids.technical:null]);rows.push(id)}},f.center);return rows;
}
const command=(f,alert,version,suffix='review')=>({centerId:f.center,memberId:alert.memberId,alertId:alert.id,policyVersion:version,outcome:'reviewed',note:'Fictional internal review',requestId:f.p+'_'+suffix});
test('inactivity policy is explicit, private and deduplicates concurrent human reviews across policy edits',async t=>{
  const f=await fixture(t);await seedMembers(f,2);await seedMembers(f,1,{frozen:true});const initial=(await list(f)).body;assert.equal(initial.policy.enabled,false);assert.deepEqual(initial.items,[]);
  assert.equal((await configure(f,0,{enabled:true,daysWithoutVisit:7,includeNeverVisited:false})).status,200);assert.equal((await list(f)).body.items.length,0);
  assert.equal((await configure(f,1,undefined,'never')).status,200);const page=(await list(f)).body;assert.equal(page.items.length,2);assert.ok(page.items.every(row=>row.neverVisited&&row.daysWithoutVisit===20));
  for(const uid of [f.ids.trainer,f.ids.alice,f.ids.technical])assert.ok([403,404].includes((await list(f,{},uid)).status));
  const foreign=await f.req('/api/centers/retention?centerId='+f.other,f.ids.manager);assert.equal(foreign.status,404);
  const alert=page.items[0],body=command(f,alert,page.policy.version),responses=await Promise.all([f.req('/api/centers/retention/review',f.ids.manager,body),f.req('/api/centers/retention/review',f.ids.root,body)]);assert.equal(responses.filter(row=>row.status===200).length,1,JSON.stringify(responses));assert.equal(responses.find(row=>row.status!==200).body.code,'retention-already-reviewed');
  const winner=responses[0].status===200?f.ids.manager:f.ids.root;assert.equal((await f.req('/api/centers/retention/review',winner,body)).body.action.id,alert.id);assert.equal((await list(f)).body.items.length,1);
  assert.equal((await configure(f,2,{enabled:true,daysWithoutVisit:8,includeNeverVisited:true},'different_days')).status,200);const changed=(await list(f)).body;assert.equal(changed.items.length,1,'changing only the threshold does not duplicate a handled episode');
  const history=(await list(f,{view:'history'})).body;assert.equal(history.items.length,1);assert.equal(history.items[0].note,body.note);assert.ok(!JSON.stringify(history).includes('account_uid'));
  assert.equal((await f.db.transaction({uid:f.ids.trainer,centerId:f.center},client=>client.query('SELECT * FROM centers.retention_actions WHERE center_id=$1',[f.center]))).rows.length,0);
  await assert.rejects(f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query("UPDATE centers.retention_actions SET note='changed' WHERE id=$1",[alert.id])),{code:'42501'});
  assert.equal((await f.req('/api/centers/retention/review',f.ids.manager,{...command(f,changed.items[0],3,'dismiss'),outcome:'dismissed',note:''})).status,400);
});
test('a new validated admission resolves the old inactivity episode and makes a queued old review stale',async t=>{
  const f=await fixture(t),[memberId]=await seedMembers(f,1,{linked:true});
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.centers SET opening_hours=$2,version=version+1 WHERE id=$1',[f.center,Object.fromEntries(Array.from({length:7},(_,i)=>[i,[['00:00','24:00']]]))]),f.center);
  assert.equal((await f.req('/api/centers/access/policy',f.ids.manager,{centerId:f.center,version:0,policy:{enabled:true,requireSubscription:false,denyOverdue:false,graceDays:0},requestId:f.p+'_access'})).status,200);
  const reception=(await f.req('/api/centers/access/devices/create',f.ids.manager,{centerId:f.center,name:'Fictional retention reception',requestId:f.p+'_device'})).body;
  const url=new URL(f.app);assert.equal(url.hostname,'centers-ci-db');assert.equal(url.pathname,'/ft_gym_ci_centers_test');url.username='centers_bootstrap';url.password='fictional-bootstrap-test-only';const seed=new pg.Client({connectionString:url.href});await seed.connect();t.after(()=>seed.end());assert.equal((await seed.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0].kind,'test');
  const key=randomBytes(16).toString('hex'),token='at_'+key,instant=shift(f.today,-10)+'T12:00:00Z';await seed.query('BEGIN');try{await seed.query("SET LOCAL session_replication_role='replica'");
    await seed.query("INSERT INTO centers.access_tokens(id,center_id,member_id,account_uid,token_hash,issued_at,expires_at,consumed_at,consumed_device_id) VALUES($1,$2,$3,$4,$5,$6::timestamptz-interval '1 second',$6::timestamptz+interval '44 seconds',$6,$7)",[token,f.center,memberId,f.ids.technical,randomBytes(32).toString('hex'),instant,reception.device.id]);
    await seed.query('INSERT INTO centers.access_visits(id,center_id,member_id,account_uid,token_id,device_id,operator_uid,visited_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',['av_'+key,f.center,memberId,f.ids.technical,token,reception.device.id,f.ids.manager,instant]);await seed.query('COMMIT');
  }catch(e){await seed.query('ROLLBACK');throw e}
  assert.equal((await configure(f,0,{enabled:true,daysWithoutVisit:7,includeNeverVisited:false})).status,200);const page=(await list(f)).body;assert.equal(page.items.length,1);assert.equal(page.items[0].daysWithoutVisit,10);assert.equal(page.items[0].neverVisited,false);
  const fresh=(await f.req('/api/centers/own/access/token',f.ids.technical,{centerId:f.center,requestId:f.p+'_fresh'})).body;
  const scanned=await fetch(f.h.base+'/api/centers/access/consume',{method:'POST',headers:{...f.h.headers(f.ids.manager),'X-Center-Device-Key':reception.credential},body:JSON.stringify({centerId:f.center,deviceId:reception.device.id,token:fresh.token,requestId:f.p+'_scan'})}).then(async r=>({status:r.status,body:await r.json()}));assert.equal(scanned.body.admitted,true,JSON.stringify(scanned));
  assert.equal((await list(f)).body.items.length,0);assert.equal((await f.req('/api/centers/retention/review',f.ids.manager,command(f,page.items[0],page.policy.version))).body.code,'retention-alert-changed');
});
test('retention lists page actual episodes and review audit failure rolls back the handling and retry key',async t=>{
  const f=await fixture(t);await seedMembers(f,31);assert.equal((await configure(f)).status,200);const first=(await list(f)).body;assert.equal(first.items.length,30);assert.ok(first.nextCursor);const last=(await list(f,{cursor:first.nextCursor})).body;assert.equal(last.items.length,1);assert.equal(new Set([...first.items,...last.items].map(row=>row.id)).size,31);
  assert.equal((await list(f,{cursor:first.nextCursor},f.ids.root)).status,400);
  const body=command(f,first.items[0],first.policy.version),database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit'))throw new Error('fictional retention audit failure');return client.query(sql,args)}}))};
  await assert.rejects(reviewRetention({database,user:{id:f.ids.manager},checkSession(){}},body),/fictional retention audit failure/);assert.equal((await list(f,{view:'history'})).body.items.length,0);
  assert.equal((await f.req('/api/centers/retention/review',f.ids.manager,body)).status,200);
  assert.equal((await configure(f,1,{enabled:true,daysWithoutVisit:9,includeNeverVisited:true},'new_policy')).status,200);assert.equal((await list(f,{cursor:first.nextCursor})).status,400);assert.equal((await f.req('/api/centers/retention/review',f.ids.manager,command(f,first.items[1],1,'stale_policy'))).body.code,'version-conflict');
});
