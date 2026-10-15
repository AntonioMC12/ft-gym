import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';

async function fixture(t){
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='mt_'+randomBytes(5).toString('hex'),ids=Object.fromEntries(['root','manager','other','alice','trainer','technical'].map(role=>[role,p+'_'+role]));
  const h=await startHttp(t,{app,superadminUids:[ids.root],users:Object.entries(ids).map(([role,id])=>({id,name:id,...(role==='technical'?{admin:true}:{})}))});
  const req=async(route,uid,body)=>{const r=await fetch(h.base+route,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',ids.root,{name:p,managerUid:ids.manager,timezone:'UTC',requestId:p+'_center'})).body.center.id,other=(await req('/api/platform/centers/create',ids.root,{name:p+'_other',managerUid:ids.other,timezone:'UTC',requestId:p+'_other'})).body.center.id;
  assert.equal((await req('/api/centers/staff/assign',ids.manager,{centerId:center,version:1,accountUid:ids.trainer})).status,200);
  const today=new Date().toISOString().slice(0,10),yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
  const plan=(await req('/api/centers/plans/create',ids.manager,{centerId:center,name:'Fictional metric fee',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const member=async(label,contract=true,linked=false)=>{
    let m=(await req('/api/centers/members/create',ids.manager,{centerId:center,name:'PRIVATE_'+label,requestId:p+'_'+label})).body.member;
    if(linked){const invite=(await req('/api/centers/invitations/create',ids.manager,{centerId:center,kind:'member',memberId:m.id,accountUid:ids.alice,requestId:p+'_invite'})).body;assert.equal((await req('/api/centers/invitations/accept',ids.alice,{token:invite.token})).status,200);m=(await req(`/api/centers/member?centerId=${center}&id=${m.id}`,ids.manager)).body.member}
    if(!contract)return {member:m};
    const result=await req('/api/centers/subscriptions/create',ids.manager,{centerId:center,memberId:m.id,memberVersion:m.version,priceVersionId:plan.priceVersionId,effectiveOn:today,requestId:p+'_'+label+'_subscription'});assert.equal(result.status,200,JSON.stringify(result));const sub=result.body.subscriptions[0];
    const receipt=await req('/api/centers/receipts/generate',ids.manager,{centerId:center,memberId:m.id,subscriptionId:sub.id,periodStart:sub.anchorOn,dueOn:today,requestId:p+'_'+label+'_receipt'});assert.equal(receipt.status,200);
    return {member:(await req(`/api/centers/member?centerId=${center}&id=${m.id}`,ids.manager)).body.member,receipt:receipt.body.receipt};
  };
  const a=await member('alice',true,true),b=await member('second'),pending=await member('pending',false);
  const pay=async(amount,suffix)=>{const r=await req('/api/centers/payments/record',ids.manager,{centerId:center,memberId:a.member.id,amountMinor:amount,currency:'EUR',paidOn:today,method:'cash',allocations:[{receiptId:a.receipt.id,amountMinor:amount}],requestId:p+'_'+suffix});assert.equal(r.status,200);return r.body.payment};
  const first=await pay('300','payment1'),second=await pay('200','payment2');
  for(const [payment,amount,suffix] of [[first,'100','refund1'],[second,'50','refund2']])assert.equal((await req('/api/centers/payments/refund',ids.root,{centerId:center,memberId:a.member.id,paymentId:payment.id,receiptId:a.receipt.id,amountMinor:amount,refundedOn:today,reason:'Fictional metric refund',requestId:p+'_'+suffix})).status,200);
  assert.equal((await req('/api/centers/members/transition',ids.manager,{centerId:center,id:b.member.id,version:b.member.version,action:'freeze',effectiveOn:today,reason:'Fictional current freeze',requestId:p+'_freeze'})).status,200);
  return {app,db,migrator,h,ids,p,req,center,other,today,yesterday,a,b,pending};
}

test('center metrics separate current stock from bounded flows and never multiply money through ledger joins',async t=>{
  const {req,ids,center,other,today,yesterday,a}=await fixture(t),route=`/api/centers/metrics?centerId=${center}&from=${today}&to=${today}`;
  const response=await req(route,ids.manager);assert.equal(response.status,200,JSON.stringify(response));const report=response.body;
  assert.equal(report.definitionVersion,1);assert.equal(report.centerCount,'1');assert.deepEqual(report.current,{members:'3',active:'1',frozen:'1',ended:'0',preactive:'1',subscriptions:'2',outstandingMinor:'1650',overdueMinor:'0',overduePolicyComplete:true});
  assert.deepEqual(report.period,{from:today,to:today,registeredMembers:'3',activations:'2',terminations:'0',receiptsIssued:'2',receiptTotalMinor:'2000',collectionsMinor:'500',refundsMinor:'150',netCollectionsMinor:'350'});
  assert.ok(!JSON.stringify(report).includes('PRIVATE_'));assert.ok(!JSON.stringify(report).includes(a.member.id));assert.ok(!('visits' in report));assert.ok(!('occupancy' in report));
  const past=(await req(`/api/centers/metrics?centerId=${center}&from=${yesterday}&to=${yesterday}`,ids.manager)).body;assert.equal(past.period.collectionsMinor,'0');assert.equal(past.period.refundsMinor,'0');assert.equal(past.period.receiptsIssued,'0');assert.equal(past.current.outstandingMinor,'1650','current receivables must not be filtered to the selected cash period');
  assert.equal((await req(`/api/centers/metrics?centerId=${other}`,ids.manager)).status,404);
  for(const uid of [ids.alice,ids.trainer,ids.technical])assert.ok([403,404].includes((await req(route,uid)).status));
  assert.equal((await req(route,ids.root)).body.period.netCollectionsMinor,'350');
  const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);assert.equal((await req(`/api/centers/metrics?centerId=${center}&from=${today}&to=${tomorrow}`,ids.manager)).status,400);
  assert.equal((await req(route+'&memberId=foreign',ids.manager)).status,400);
});

test('global metrics require explicit platform, audit all included centers and aggregate beyond a100center list',async t=>{
  const {db,req,ids,center,p}=await fixture(t),route='/api/platform/centers/metrics';
  for(const uid of [ids.manager,ids.other,ids.technical,ids.trainer,ids.alice])assert.equal((await req(route,uid)).status,403);
  const before=await req(route,ids.root);assert.equal(before.status,200,JSON.stringify(before));
  await db.platformTransaction(ids.root,client=>client.query(`INSERT INTO centers.centers(id,name,state,timezone,policy)
    SELECT $1||'_bulk_'||n,$1||' bulk '||n,'draft','UTC',(SELECT policy FROM centers.centers WHERE id=$2) FROM generate_series(1,105)n`,[p,center]));
  const after=await req(route,ids.root);assert.equal(after.status,200,JSON.stringify(after));assert.equal(BigInt(after.body.centerCount)-BigInt(before.body.centerCount),105n);assert.equal(after.body.current.outstandingMinor,before.body.current.outstandingMinor);assert.equal(after.body.period.collectionsMinor,before.body.period.collectionsMinor);
  const logged=await db.platformTransaction(ids.root,client=>client.query("SELECT count(DISTINCT center_id)::text AS n FROM centers.business_audit WHERE actor_uid=$1 AND action='metrics.global.read' AND center_id LIKE $2",[ids.root,p+'_bulk_%']));assert.equal(logged.rows[0].n,'105');
  assert.equal((await req(route+'?centerId='+center,ids.root)).status,400);
  assert.ok(!JSON.stringify(after.body).includes(center));assert.ok(!JSON.stringify(after.body).includes(ids.alice));
});

test('metric membership dates are effective, canceled future ends do not count, and missing debt policy remains unknown',async t=>{
  const {db,req,ids,center,today,p,a}=await fixture(t),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10),route='/api/centers/metrics?centerId='+center;
  const planned=await req('/api/centers/members/transition',ids.manager,{centerId:center,id:a.member.id,version:a.member.version,action:'end',effectiveOn:tomorrow,reason:'Fictional planned end',requestId:p+'_end_future'});assert.equal(planned.status,200);
  assert.equal((await req(route,ids.manager)).body.period.terminations,'0');const change=planned.body.changes.find(row=>row.action==='end'&&!row.canceled);
  const canceled=await req('/api/centers/members/transition/cancel',ids.manager,{centerId:center,id:a.member.id,version:planned.body.member.version,changeId:change.id,requestId:p+'_cancel_end'});assert.equal(canceled.status,200);
  assert.equal((await req('/api/centers/members/transition',ids.manager,{centerId:center,id:a.member.id,version:canceled.body.member.version,action:'end',effectiveOn:today,reason:'Fictional effective end',requestId:p+'_end_now'})).status,200);
  const ended=(await req(route,ids.manager)).body;assert.equal(ended.current.active,'0');assert.equal(ended.current.frozen,'1');assert.equal(ended.current.ended,'1');assert.equal(ended.current.subscriptions,'1');assert.equal(ended.period.terminations,'1');assert.equal(ended.current.outstandingMinor,'1650');
  const original=(await db.platformTransaction(ids.root,client=>client.query('SELECT policy FROM centers.centers WHERE id=$1',[center]),center)).rows[0].policy;
  try{
    await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET policy=jsonb_set(policy,'{graceDays}','15.0'::jsonb) WHERE id=$1",[center]),center);
    const integral=await req(route,ids.manager);assert.equal(integral.status,200);assert.equal(integral.body.current.overduePolicyComplete,true,'an integral JSON number with a decimal spelling remains a valid policy');
    await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET policy=jsonb_set(policy,'{graceDays}','\"unknown\"') WHERE id=$1",[center]),center);
    const partial=await req(route,ids.manager);assert.equal(partial.status,200);assert.equal(partial.body.current.outstandingMinor,'1650');assert.equal(partial.body.current.overdueMinor,null);assert.equal(partial.body.current.overduePolicyComplete,false);
  }finally{await db.platformTransaction(ids.root,client=>client.query('UPDATE centers.centers SET policy=$2 WHERE id=$1',[center,JSON.stringify(original)]),center)}
});

test('metric periods and receipt dates follow the center calendar across opposite time zones',async t=>{
  const {db,req,ids,center}=await fixture(t),route='/api/centers/metrics?centerId='+center;
  try{
    const localDays=[];
    for(const timezone of ['Pacific/Honolulu','Pacific/Kiritimati']){
      const local=await db.platformTransaction(ids.root,async client=>{
        await client.query('UPDATE centers.centers SET timezone=$2 WHERE id=$1',[center,timezone]);
        return (await client.query('SELECT (statement_timestamp() AT TIME ZONE $1)::date::text AS today',[timezone])).rows[0].today;
      },center);
      localDays.push(local);
      const response=await req(route,ids.manager);assert.equal(response.status,200,JSON.stringify(response));
      assert.equal(response.body.period.to,local);assert.equal(response.body.period.from,local.slice(0,7)+'-01');
      const daily=await req(route+'&from='+local+'&to='+local,ids.manager);assert.equal(daily.status,200);
      assert.equal(daily.body.period.receiptsIssued,'2','receipt creation instants must be converted to the selected center calendar');
      assert.equal(daily.body.current.outstandingMinor,'1650','changing the reporting calendar must not change the ledger balance');
      const tomorrow=new Date(Date.parse(local+'T12:00:00Z')+86400000).toISOString().slice(0,10);
      assert.equal((await req(route+'&from='+local+'&to='+tomorrow,ids.manager)).status,400);
    }
    assert.ok(localDays[0]<localDays[1],'the test covers different business days, rather than two names for the same date');
  }finally{await db.platformTransaction(ids.root,client=>client.query("UPDATE centers.centers SET timezone='UTC' WHERE id=$1",[center]),center)}
});
