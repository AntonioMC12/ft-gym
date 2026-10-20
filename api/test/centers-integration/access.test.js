import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {decideAccess} from '../../centers/domain/access.js';

const hours=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[['00:00','24:00']]]));
async function fixture(t){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='ac_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','other','alice','bob','trainer','technical'].map(role=>[role,p+'_'+role]));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:Object.entries(ids).map(([role,id])=>({id,name:id,...(role==='technical'?{admin:true}:{})}))});
  const req=async(route,uid,body,extraHeaders={},method=body?'POST':'GET')=>{const r=await fetch(h.base+route,{method,headers:{...h.headers(uid),...extraHeaders},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',ids.root,{name:p,managerUid:ids.manager,openingHours:hours,timezone:'UTC',requestId:p+'_center'})).body.center.id;
  const elsewhere=(await req('/api/platform/centers/create',ids.root,{name:p+'_elsewhere',managerUid:ids.other,openingHours:hours,timezone:'UTC',requestId:p+'_elsewhere'})).body.center.id;
  assert.equal((await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer})).status,200);
  const linked=async(uid,label)=>{
    const m=(await req('/api/centers/members/create',ids.manager,{centerId:center,name:'Fictional '+label,requestId:p+'_'+label})).body.member;
    const invitation=(await req('/api/centers/invitations/create',ids.manager,{centerId:center,kind:'member',memberId:m.id,accountUid:uid,requestId:p+'_'+label+'_invite'})).body;
    assert.equal((await req('/api/centers/invitations/accept',uid,{token:invitation.token})).status,200);
    await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.members SET state='active',joined_on='2020-01-01',version=version+1 WHERE center_id=$1 AND id=$2",[center,m.id]),center);
    return (await req(`/api/centers/member?centerId=${center}&id=${m.id}`,ids.manager)).body.member;
  };
  const alice=await linked(ids.alice,'alice'),bob=await linked(ids.bob,'bob'),dual=await linked(ids.manager,'dual');
  const policy={enabled:true,requireSubscription:false,denyOverdue:false,graceDays:15};
  const configure=async(next=policy,version=0,suffix='policy')=>req('/api/centers/access/policy',ids.manager,{centerId:center,version,policy:next,requestId:p+'_'+suffix});
  const issue=async(suffix='token',uid=ids.alice)=>req('/api/centers/own/access/token',uid,{centerId:center,requestId:p+'_'+suffix});
  const create=async(suffix='device')=>req('/api/centers/access/devices/create',ids.manager,{centerId:center,name:'Fictional reception',requestId:p+'_'+suffix});
  const scan=async(device,token,suffix='scan',uid=ids.manager,cid=center)=>req('/api/centers/access/consume',uid,{centerId:cid,deviceId:device.device.id,token,requestId:p+'_'+suffix},{'X-Center-Device-Key':device.credential});
  return {app,db,migrator,h,req,p,ids,center,elsewhere,alice,bob,dual,policy,configure,issue,create,scan};
}

test('access QR is opt-in, opaque, center/recipient scoped, atomically single-use and retry does not readmit',async t=>{
  const f=await fixture(t),{db,ids,center,elsewhere,req,p,configure,issue,create,scan}=f;
  assert.equal((await req('/api/centers/own/access?centerId='+center,ids.alice)).body.enabled,false);
  assert.equal((await issue()).body.code,'access-unavailable');assert.equal((await configure()).status,200);
  const device=(await create()).body,created=await issue();assert.equal(created.status,200,JSON.stringify(created));const token=created.body.token;assert.match(token,/^gqr1_[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(created.body.expiresAt)-Date.parse(created.body.issuedAt),45000);const retry=(await issue()).body;assert.equal(retry.token,token);assert.equal(retry.expiresAt,created.body.expiresAt,'lost issuance response has the same token and expiry');assert.ok(retry.remainingMs<=created.body.remainingMs&&retry.remainingMs>0);
  const race=await Promise.all([scan(device,token,'first'),scan(device,token,'second')]);assert.ok(race.every(row=>row.status===200));assert.equal(race.filter(row=>row.body.admitted).length,1);const winner=race.findIndex(row=>row.body.admitted),visit=race[winner].body.visitId;
  const replay=await scan(device,token,winner===0?'first':'second');assert.equal(replay.body.admitted,false);assert.equal(replay.body.replayed,true);assert.equal(replay.body.visitId,visit);
  assert.equal((await db.platformTransaction(ids.root,client=>client.query('SELECT count(*)::int AS n FROM centers.access_visits WHERE center_id=$1',[center]),center)).rows[0].n,1);
  assert.equal((await issue()).body.code,'access-token-expired');
  const own=(await req(`/api/centers/own/access/visits?centerId=${center}`,ids.alice)).body;assert.equal(own.visits.length,1);for(const field of ['memberId','operatorUid','deviceId'])assert.ok(!(field in own.visits[0]));
  assert.equal((await req(`/api/centers/own/access/visits?centerId=${center}`,ids.bob)).body.visits.length,0);
  assert.equal((await req(`/api/centers/own/access?centerId=${center}&memberId=${f.alice.id}`,ids.bob)).status,400);
  assert.equal((await req('/api/centers/own/access/token',ids.alice,{centerId:center,memberId:f.bob.id,requestId:p+'_foreign'})).status,400);
  assert.equal((await scan(device,token,'foreign',ids.other,elsewhere)).status,404);
  assert.ok(!JSON.stringify(race).includes('totalMinor'));assert.ok(!JSON.stringify(race).includes('reason'));assert.ok(!JSON.stringify(race).includes('account_uid'));
});

test('access requires current manager/platform and device key; rotation, revocation and RLS remain independent',async t=>{
  const {db,ids,center,elsewhere,h,req,p,configure,issue,create,scan}=await fixture(t);await configure();const d=(await create()).body,token=(await issue()).body.token;
  assert.equal((await fetch(h.base+'/api/centers/access/consume',{method:'POST',headers:{'Content-Type':'application/json','X-Center-Device-Key':d.credential},body:JSON.stringify({centerId:center,deviceId:d.device.id,token,requestId:p+'_no_session'})})).status,401);
  for(const uid of [ids.alice,ids.bob,ids.trainer,ids.technical])assert.ok([403,404].includes((await scan(d,token,'role_'+uid,uid)).status));
  assert.equal((await scan({...d,credential:'gdev1_'+'x'.repeat(43)},token,'wrong')).status,401);
  assert.equal((await req('/api/centers/access/consume',ids.manager,{centerId:center,deviceId:d.device.id,token,requestId:p+'_missing'})).status,401);
  const rotation={centerId:center,id:d.device.id,version:d.device.version,requestId:p+'_rotate'},rotated=await req('/api/centers/access/devices/rotate',ids.manager,rotation);assert.equal(rotated.status,200,JSON.stringify(rotated));assert.notEqual(rotated.body.credential,d.credential);assert.deepEqual((await req('/api/centers/access/devices/rotate',ids.manager,rotation)).body,rotated.body);
  assert.equal((await scan(d,token,'old_key')).status,401);assert.equal((await scan(rotated.body,token,'new_key')).body.admitted,true);
  assert.equal((await create()).body.code,'access-device-changed','old creation request cannot reproduce a superseded key');
  const devices=(await req('/api/centers/access?centerId='+center,ids.manager)).body;assert.equal(devices.devices.length,1);assert.ok(!JSON.stringify(devices).includes('key_hash'));assert.ok(!JSON.stringify(devices).includes('gdev1_'));
  assert.equal((await db.transaction({uid:ids.alice,centerId:center},client=>client.query('SELECT id FROM centers.access_devices WHERE center_id=$1',[center]))).rows.length,0);
  assert.equal((await db.transaction({uid:ids.other,centerId:elsewhere},client=>client.query('SELECT id FROM centers.access_visits WHERE center_id=$1',[center]))).rows.length,0);
  await assert.rejects(db.transaction({uid:ids.manager,centerId:center},client=>client.query("UPDATE centers.access_visits SET operator_uid='forged' WHERE center_id=$1",[center])),{code:'42501'});
  await assert.rejects(db.platformTransaction(ids.root,client=>client.query('DELETE FROM centers.access_tokens WHERE center_id=$1',[center]),center),{code:'42501'});
  const revoked=await req('/api/centers/access/devices/revoke',ids.manager,{centerId:center,id:d.device.id,version:rotated.body.device.version,requestId:p+'_revoke'});assert.equal(revoked.status,200);assert.equal(revoked.body.credential,null);
  const fresh=(await issue('fresh')).body.token;assert.equal((await scan(rotated.body,fresh,'revoked')).status,401);
});

test('access rechecks manual holds, recipient links and policy after issuance and requires explicit manual release',async t=>{
  const {db,ids,center,req,p,alice,policy,configure,issue,create,scan}=await fixture(t);await configure();const d=(await create()).body,token=(await issue()).body.token;
  const hold=await req('/api/centers/access/holds/create',ids.manager,{centerId:center,memberId:alice.id,memberVersion:alice.version,reason:'Fictional independent manual hold',requestId:p+'_hold'});assert.equal(hold.status,200,JSON.stringify(hold));
  assert.equal((await scan(d,token,'held')).body.admitted,false);assert.equal((await issue('while_held')).body.code,'access-unavailable');
  const status=(await req(`/api/centers/access/member?centerId=${center}&memberId=${alice.id}`,ids.manager)).body;assert.equal(status.hold.id,hold.body.hold.id);
  const release={centerId:center,memberId:alice.id,id:hold.body.hold.id,version:hold.body.hold.version,requestId:p+'_release'};assert.equal((await req('/api/centers/access/holds/release',ids.manager,release)).status,200);assert.equal((await scan(d,token,'released')).body.admitted,true);
  const next=(await issue('policy_change')).body.token;assert.equal((await configure({...policy,enabled:false},1,'disable')).status,200);assert.equal((await scan(d,next,'policy_disabled')).body.admitted,false);
  await configure(policy,2,'enable');const linked=(await issue('link_change')).body.token;
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.members SET account_uid=NULL,version=version+1 WHERE center_id=$1 AND id=$2',[center,alice.id]),center);
  assert.equal((await scan(d,linked,'unlinked')).body.admitted,false);
  assert.equal((await req('/api/centers/own/access?centerId='+center,ids.alice)).body.code,'account-activation-required');
});

test('SQL access decision agrees with pure local-time rules through DST and malformed opening hours',async t=>{
  const {db,ids,center,alice,policy,configure}=await fixture(t);await configure();
  const sampleHours={0:[['02:00','03:00']]};await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET timezone='Europe/Madrid',opening_hours=$2 WHERE id=$1",[center,JSON.stringify(sampleHours)]),center);
  for(const iso of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z','2026-03-29T00:59:00Z','2026-03-29T01:00:00Z']){
    const now=Date.parse(iso),expected=decideAccess({policy,center:{state:'active',timezone:'Europe/Madrid',openingHours:sampleHours},member:{state:'active',joinedOn:'2020-01-01',endsOn:null},hasSubscription:false,hasOverdue:false,now});
    const actual=(await db.transaction({uid:ids.alice,centerId:center},client=>client.query('SELECT centers.access_decision($1,$2,$3) AS result',[center,alice.id,iso]))).rows[0].result;assert.equal(actual,expected.allowed?'allowed':expected.reason,iso);
  }
  for(const bad of [{0:'open'},{0:[['xx','03:00']]},{0:[[1,2]]},{0:[['02:00','03:00'],['02:30','04:00']]}]){
    await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.centers SET opening_hours=$2 WHERE id=$1',[center,JSON.stringify(bad)]),center);
    assert.equal((await db.transaction({uid:ids.alice,centerId:center},client=>client.query("SELECT centers.access_decision($1,$2,'2026-10-25T00:30:00Z') AS result",[center,alice.id]))).rows[0].result,'closed');
  }
});

test('access QR replacement invalidates a captured older token and bounded issuance is shared by concurrent requests',async t=>{
  const {ids,center,p,configure,issue,create,scan,req}=await fixture(t);await configure();const d=(await create()).body,a=(await issue('a')).body,b=(await issue('b')).body;
  assert.notEqual(a.token,b.token);assert.equal((await scan(d,a.token,'old_capture')).body.admitted,false);assert.equal((await scan(d,b.token,'latest')).body.admitted,true);
  const attempts=await Promise.all(Array.from({length:8},(_,i)=>issue('rate_'+i)));assert.equal(attempts.filter(row=>row.status===200).length,4);assert.equal(attempts.filter(row=>row.status===429).length,4);
  assert.equal((await req('/api/centers/own/access/token',ids.alice,{centerId:center,requestId:p+'_clock',now:0})).status,400);
});

test('access rejects a genuinely expired QR using the database clock without rewriting historical timestamps',async t=>{
  const {db,ids,center,configure,issue,create,scan}=await fixture(t);await configure();const d=(await create()).body,a=await issue();assert.equal(a.status,200);
  await new Promise(resolve=>setTimeout(resolve,46000));
  const result=await scan(d,a.body.token,'expired');assert.equal(result.status,200);assert.equal(result.body.admitted,false);
  const stored=await db.platformTransaction(ids.root,async client=>({tokens:(await client.query('SELECT consumed_at FROM centers.access_tokens WHERE center_id=$1',[center])).rows,visits:(await client.query('SELECT id FROM centers.access_visits WHERE center_id=$1',[center])).rows,scans:(await client.query('SELECT result FROM centers.access_scans WHERE center_id=$1',[center])).rows}),center);
  assert.equal(stored.tokens[0].consumed_at,null);assert.equal(stored.visits.length,0);assert.equal(stored.scans[0].result,'expired');
});

test('access financial denial follows the real ledger while paying cannot release a separate manual hold',async t=>{
  const {db,ids,center,p,alice,req,policy,configure,issue,create,scan}=await fixture(t);
  const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const plan=(await req('/api/centers/plans/create',ids.manager,{centerId:center,name:'Fictional access fee',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_fee'})).body.plan;
  const subscribed=await req('/api/centers/subscriptions/create',ids.manager,{centerId:center,memberId:alice.id,memberVersion:alice.version,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_contract'});assert.equal(subscribed.status,200,JSON.stringify(subscribed));const subscription=subscribed.body.subscriptions[0],subscriptionId=subscription.id;
  const member=(await req(`/api/centers/member?centerId=${center}&id=${alice.id}`,ids.manager)).body.member;
  const receipt=await req('/api/centers/receipts/generate',ids.manager,{centerId:center,memberId:alice.id,subscriptionId,periodStart:subscription.anchorOn,dueOn:today,requestId:p+'_overdue'});assert.equal(receipt.status,200,JSON.stringify(receipt));assert.equal(receipt.body.receipt.totalMinor,'1000');
  const financial={...policy,requireSubscription:true,graceDays:0};await configure(financial);const d=(await create()).body,token=(await issue()).body.token;
  await configure({...financial,denyOverdue:true},1,'deny_overdue');
  const nextDayDecision=()=>db.platformTransaction(ids.root,async client=>(await client.query('SELECT centers.access_decision($1,$2,$3) AS result',[center,alice.id,tomorrow+'T12:00:00Z'])).rows[0].result,center);
  assert.equal(await nextDayDecision(),'account-review','real unpaid ledger becomes overdue after its actual due date');
  const hold=(await req('/api/centers/access/holds/create',ids.manager,{centerId:center,memberId:alice.id,memberVersion:member.version,reason:'Fictional manual safety hold',requestId:p+'_independent_hold'})).body.hold;
  const denied=await scan(d,token,'held');assert.equal(denied.body.admitted,false);assert.ok(!JSON.stringify(denied.body).includes('1000'));assert.ok(!JSON.stringify(denied.body).includes('account-review'));
  const payment={centerId:center,memberId:alice.id,amountMinor:'1000',currency:'EUR',paidOn:today,method:'cash',allocations:[{receiptId:receipt.body.receipt.id,amountMinor:'1000'}],requestId:p+'_settle'};
  assert.equal((await req('/api/centers/payments/record',ids.manager,payment)).status,200);
  assert.equal(await nextDayDecision(),'manual-hold');
  const state=(await req(`/api/centers/access/member?centerId=${center}&memberId=${alice.id}`,ids.manager)).body;assert.equal(state.allowed,false);assert.equal(state.hold.id,hold.id,'ledger settlement does not remove the manual hold');
  assert.equal((await issue('paid_still_held')).body.code,'access-unavailable');
  assert.equal((await req('/api/centers/access/holds/release',ids.manager,{centerId:center,memberId:alice.id,id:hold.id,version:hold.version,requestId:p+'_release_paid'})).status,200);
  assert.equal(await nextDayDecision(),'allowed','the real payment settles debt; only explicit hold release restores this independent condition');
  assert.equal((await scan(d,token,'paid_released')).body.admitted,true);
  assert.equal((await req('/api/centers/payments/record',ids.manager,payment)).status,200);
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.subscriptions SET ends_on=$3,version=version+1 WHERE center_id=$1 AND id=$2',[center,subscriptionId,today]),center);
  assert.equal((await req('/api/centers/own/access?centerId='+center,ids.alice)).body.allowed,false,'an active profile without a current required contract is insufficient');
});

test('access revalidates manager role, local opening hours and dated membership after QR issuance',async t=>{
  const {db,ids,center,p,alice,req,configure,issue,create,scan}=await fixture(t);await configure();const d=(await create()).body,token=(await issue()).body.token;
  await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET opening_hours='{}' WHERE id=$1",[center]),center);assert.equal((await scan(d,token,'closed')).body.admitted,false);
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.centers SET opening_hours=$2 WHERE id=$1',[center,JSON.stringify(hours)]),center);
  const info=(await req('/api/centers/detail?centerId='+center,ids.root)).body.center;assert.equal((await req('/api/platform/centers/assign-manager',ids.root,{centerId:center,version:info.version,accountUid:ids.other})).status,200);
  await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.role_assignments SET revoked_at=clock_timestamp() WHERE center_id=$1 AND account_uid=$2 AND revoked_at IS NULL',[center,ids.manager]),center);
  assert.equal((await scan(d,token,'role_revoked')).status,403,'own membership of the old manager is not reception authority');
  const member=(await req(`/api/centers/member?centerId=${center}&id=${alice.id}`,ids.other)).body.member,today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  assert.equal((await req('/api/centers/members/transition',ids.other,{centerId:center,id:alice.id,version:member.version,action:'end',effectiveOn:tomorrow,reason:'Fictional future end',requestId:p+'_tomorrow'})).status,200);
  const decisions=await db.platformTransaction(ids.root,async client=>({today:(await client.query('SELECT centers.access_decision($1,$2,$3) AS result',[center,alice.id,today+'T23:59:59Z'])).rows[0].result,tomorrow:(await client.query('SELECT centers.access_decision($1,$2,$3) AS result',[center,alice.id,tomorrow+'T00:00:00Z'])).rows[0].result}),center);
  assert.equal(decisions.today,'allowed');assert.equal(decisions.tomorrow,'membership-inactive','effective membership is resolved at validation instant, including across local midnight');
});

test('API restart expires an otherwise live capture while the restored session secret and device credential remain unchanged',async t=>{
  const {app,db,h,ids,center,p,configure,issue,create}=await fixture(t);await configure();const d=(await create()).body,issued=(await issue()).body;
  const restartDir=fs.mkdtempSync(path.join(os.tmpdir(),'gym-centers-recovery-qr-restart-'));await h.stop();fs.cpSync(h.dir,restartDir,{recursive:true});fs.writeFileSync(path.join(restartDir,'recovery-fixture'),'fictional-disposable-only');
  const restarted=await startHttp(t,{app,savedData:restartDir,superadminUids:[ids.root]});t.after(async()=>{await restarted.stop();fs.rmSync(restartDir,{recursive:true,force:true})});
  assert.equal(fs.readFileSync(path.join(restartDir,'secret'),'utf8'),fs.readFileSync(path.join(h.dir,'secret'),'utf8'));
  assert.ok(Date.now()<Date.parse(issued.expiresAt),'the capture is still inside its SQL45second lifetime after the bounded restart');
  const request=async(route,uid,body,extra={})=>{const r=await fetch(restarted.base+route,{method:'POST',headers:{...restarted.headers(uid),...extra},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
  const old=await request('/api/centers/access/consume',ids.manager,{centerId:center,deviceId:d.device.id,token:issued.token,requestId:p+'_before_boot_capture'},{'X-Center-Device-Key':d.credential});assert.equal(old.status,200);assert.equal(old.body.admitted,false);
  const retry=await request('/api/centers/own/access/token',ids.alice,{centerId:center,requestId:p+'_token'});assert.equal(retry.body.code,'access-token-expired');
  const fresh=await request('/api/centers/own/access/token',ids.alice,{centerId:center,requestId:p+'_new_boot_token'});assert.equal(fresh.status,200);
  const valid=await request('/api/centers/access/consume',ids.manager,{centerId:center,deviceId:d.device.id,token:fresh.body.token,requestId:p+'_new_boot_scan'},{'X-Center-Device-Key':d.credential});assert.equal(valid.status,200);assert.equal(valid.body.admitted,true);
  const visits=await db.platformTransaction(ids.root,client=>client.query('SELECT id FROM centers.access_visits WHERE center_id=$1',[center]),center);assert.equal(visits.rows.length,1,'only the freshly issued QR grants one new admission');
});
