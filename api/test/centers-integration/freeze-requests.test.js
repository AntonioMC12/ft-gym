import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

const config={enabled:true,minDays:1,maxDays:30,noticeDays:0,maxDaysPerYear:30,billingEffect:'contract-proration'};
const shift=(date,days)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
async function fixture(t){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='fr_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','alice','bob','trainer','technical'].map(key=>[key,p+'_'+key]));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:Object.entries(ids).map(([key,id])=>({id,name:id,...(key==='technical'?{admin:true}:{})}))});
  const req=async(path,uid,body)=>{const r=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',ids.root,{name:p,managerUid:ids.manager,requestId:p+'_center'})).body.center.id;
  const other=(await req('/api/platform/centers/create',ids.root,{name:p+'other',managerUid:ids.root,requestId:p+'_other'})).body.center.id;
  await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer});
  const member=(await req('/api/centers/members/create',ids.manager,{centerId:center,name:'Fictional Alice',requestId:p+'_member'})).body.member;
  const invitation=(await req('/api/centers/invitations/create',ids.manager,{centerId:center,kind:'member',memberId:member.id,accountUid:ids.alice,requestId:p+'_invite'})).body;
  assert.equal((await req('/api/centers/invitations/accept',ids.alice,{token:invitation.token})).status,200);
  const detail=()=>req('/api/centers/member?'+new URLSearchParams({centerId:center,id:member.id}),ids.manager);
  const today=(await detail()).body.today;
  const plan=(await req('/api/centers/plans/create',ids.manager,{centerId:center,name:'Fictional monthly fee',priceMinor:'3100',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'actual-days',requestId:p+'_plan'})).body.plan;
  const current=(await detail()).body.member;
  const subscribed=await req('/api/centers/subscriptions/create',ids.manager,{centerId:center,memberId:member.id,memberVersion:current.version,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_sub'});assert.equal(subscribed.status,200,JSON.stringify(subscribed));
  const policy=(version=0,settings=config)=>req('/api/centers/freezes/policy',ids.manager,{centerId:center,config:settings,version,requestId:p+'_policy_'+version});
  const request=(suffix='one',dates={effectiveOn:today,resumeOn:shift(today,2)})=>req('/api/centers/own/freezes/request',ids.alice,{centerId:center,...dates,reason:'Fictional travel',requestId:p+'_'+suffix});
  const own=(uid=ids.alice,extra={})=>req('/api/centers/own/freezes?'+new URLSearchParams({centerId:center,...extra}),uid);
  const decide=async(row,action='approved',suffix='decision')=>req('/api/centers/freezes/decide',ids.manager,{centerId:center,id:row.id,version:row.version,action,reason:action==='rejected'?'Cannot approve':null,...(action==='approved'?{memberVersion:(await detail()).body.member.version}:{}),requestId:p+'_'+suffix});
  return {db,h,ids,p,req,center,other,member,detail,today,policy,request,own,decide,subscription:subscribed.body.subscriptions[0]};
}
test('self-service is opt-in; requests do not change membership or debt, approval applies one audited lifecycle pair',async t=>{
  const f=await fixture(t),{ids,req,center,p,member,today,subscription}=f;
  const receipt=(await req('/api/centers/receipts/generate',ids.manager,{centerId:center,memberId:member.id,subscriptionId:subscription.id,periodStart:subscription.anchorOn,dueOn:today,requestId:p+'_receipt'})).body.receipt;
  const before=(await req('/api/centers/own/membership?centerId='+center,ids.alice)).body;
  const quoteBody={centerId:center,memberId:member.id,id:subscription.id,periodStart:subscription.anchorOn};
  const beforeQuote=(await req('/api/centers/billing/preview',ids.manager,quoteBody)).body.quote;
  assert.equal((await f.request()).body.code,'freeze-disabled');assert.equal((await f.policy()).status,200);
  const asked=await f.request();assert.equal(asked.status,200,JSON.stringify(asked));const row=asked.body.request;
  assert.deepEqual((await f.request()).body.request,row);assert.equal((await f.detail()).body.member.state,'active');
  const after=(await req('/api/centers/own/membership?centerId='+center,ids.alice)).body;assert.deepEqual(after.summary,before.summary);
  const memberVersion=(await f.detail()).body.member.version;
  const body={centerId:center,id:row.id,version:row.version,action:'approved',memberVersion,requestId:p+'_approve'};
  const results=await Promise.all([req('/api/centers/freezes/decide',ids.manager,body),req('/api/centers/freezes/decide',ids.manager,body)]);
  assert.equal(results[0].status,200,JSON.stringify(results[0]));assert.deepEqual(results[0].body,results[1].body);
  assert.equal(results[0].body.lifecycle.member.state,'frozen');assert.equal(results[0].body.request.state,'approved');
  const changes=(await f.detail()).body.changes;assert.equal(changes.filter(c=>c.action==='freeze').length,1);assert.equal(changes.filter(c=>c.automatic).length,1);
  const ledger=await f.db.transaction({uid:ids.manager,centerId:center},async client=>(await client.query('SELECT total_minor::text,snapshot FROM centers.receipts WHERE id=$1',[receipt.id])).rows[0]);
  assert.equal(ledger.total_minor,receipt.totalMinor);assert.deepEqual(ledger.snapshot,receipt.snapshot);
  assert.deepEqual((await req('/api/centers/own/membership?centerId='+center,ids.alice)).body.summary,before.summary);
  const afterQuote=(await req('/api/centers/billing/preview',ids.manager,quoteBody)).body.quote;
  const overlap=Math.max(0,Math.min(Date.parse(shift(today,2)),Date.parse(beforeQuote.periodEnd))-Math.max(Date.parse(today),Date.parse(beforeQuote.periodStart)))/86400000;
  assert.equal(afterQuote.activeDays,beforeQuote.activeDays-overlap);assert.ok(BigInt(afterQuote.totalMinor)<BigInt(beforeQuote.totalMinor));
  assert.equal((await f.own()).body.requests[0].state,'approved');
});
test('owners can withdraw, managers reject, stale policy and civil-date limits cannot be bypassed',async t=>{
  const f=await fixture(t);await f.policy();const row=(await f.request()).body.request;
  assert.equal((await f.request('another')).body.code,'freeze-pending');
  await f.policy(1,{...config,maxDays:20});assert.equal((await f.decide(row)).body.code,'freeze-policy-changed');
  const withdrawn=await f.req('/api/centers/own/freezes/withdraw',f.ids.alice,{centerId:f.center,id:row.id,version:row.version,action:'withdrawn',requestId:f.p+'_withdraw'});
  assert.equal(withdrawn.status,200,JSON.stringify(withdrawn));assert.equal(withdrawn.body.request.state,'withdrawn');
  const second=(await f.request('second')).body.request;assert.equal((await f.decide(second,'rejected')).body.request.state,'rejected');
  assert.equal((await f.decide(second,'approved','later')).body.code,'version-conflict');
  assert.equal((await f.request('too_long',{effectiveOn:f.today,resumeOn:shift(f.today,31)})).body.code,'freeze-limits');
  assert.equal((await f.detail()).body.member.state,'active');
});
test('role, center, own identity, SQL privileges and cookie CSRF isolate freeze requests',async t=>{
  const f=await fixture(t);await f.policy();const row=(await f.request()).body.request;
  for(const uid of [f.ids.bob,f.ids.root,f.ids.technical,f.ids.trainer])assert.ok([403,404].includes((await f.own(uid)).status));
  assert.equal((await f.own(f.ids.alice,{memberId:f.member.id})).status,400);
  assert.equal((await f.req('/api/centers/own/freezes?centerId='+f.other,f.ids.alice)).status,404);
  for(const uid of [f.ids.bob,f.ids.alice,f.ids.trainer,f.ids.technical]){
    const response=await f.req('/api/centers/freezes/decide',uid,{centerId:f.center,id:row.id,version:1,action:'rejected',reason:'Forbidden',requestId:f.p+'_forbidden'});assert.ok([403,404].includes(response.status));
  }
  const hidden=await f.db.transaction({uid:f.ids.bob,centerId:f.center},client=>client.query('SELECT id FROM centers.freeze_requests'));assert.equal(hidden.rows.length,0);
  await assert.rejects(f.db.transaction({uid:f.ids.alice,centerId:f.center},client=>client.query("UPDATE centers.freeze_requests SET state='approved',version=version+1,decided_by=$2 WHERE id=$1",[row.id,f.ids.alice])),e=>['42501','23514'].includes(e.code));
  await assert.rejects(f.db.transaction({uid:f.ids.alice,centerId:f.center},client=>client.query('UPDATE centers.freeze_requests SET effective_on=effective_on+1 WHERE id=$1',[row.id])),{code:'42501'});
  const token=f.h.headers(f.ids.alice).Authorization.slice(7);
  const response=await fetch(f.h.base+'/api/centers/own/freezes/request',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'gymsid='+token+'; __Host-gymsid='+token,Origin:'https://foreign.example'},body:JSON.stringify({centerId:f.center})});assert.equal(response.status,403);
});

test('approval rechecks linked owner and role; inactive centers permit withdrawal without approving',async t=>{
  const f=await fixture(t);await f.policy();const row=(await f.request()).body.request;
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.members SET account_uid=$2,version=version+1 WHERE id=$1',[f.member.id,f.ids.bob]),f.center);
  assert.equal((await f.decide(row)).body.code,'freeze-owner-changed');
  const inactiveVersion=(await f.detail()).body.member.version+1;
  await f.db.platformTransaction(f.ids.root,async client=>{
    await client.query('UPDATE centers.members SET account_uid=$2,version=version+1 WHERE id=$1',[f.member.id,f.ids.alice]);
    await client.query("UPDATE centers.centers SET state='inactive',version=version+1 WHERE id=$1",[f.center]);
  },f.center);
  assert.equal((await f.req('/api/centers/freezes/decide',f.ids.manager,{centerId:f.center,id:row.id,version:1,memberVersion:inactiveVersion,action:'approved',requestId:f.p+'_inactive_approve'})).body.code,'center-inactive');
  assert.equal((await f.req('/api/centers/own/freezes/withdraw',f.ids.alice,{centerId:f.center,id:row.id,version:1,action:'withdrawn',requestId:f.p+'_inactive_withdraw'})).status,200);
  await f.db.platformTransaction(f.ids.root,async client=>{
    await client.query("INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,'manager')",[f.p+'_replacement',f.center,f.ids.root]);
    await client.query("UPDATE centers.role_assignments SET revoked_at=clock_timestamp(),version=version+1 WHERE center_id=$1 AND account_uid=$2 AND role='manager' AND revoked_at IS NULL",[f.center,f.ids.manager]);
  },f.center);
  assert.ok([403,404].includes((await f.decide(row,'rejected','revoked')).status));
});
