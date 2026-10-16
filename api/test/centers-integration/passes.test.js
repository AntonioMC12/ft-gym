import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,shift} from './class-fixture.mjs';
import {consumeAccessToken} from '../../centers/services/access.js';
import {buyPass} from '../../centers/services/passes.js';
const fields={name:'Fictional three visits',kind:'paid',credits:3,validDays:30,priceMinor:'1000',priceIncludesTax:true,taxBasisPoints:2100};
async function product(f,extra={},suffix='product'){const r=await f.req('/api/centers/passes/products/create',f.ids.manager,{centerId:f.center,fields:{...fields,...extra},requestId:f.p+'_'+suffix});assert.equal(r.status,200,JSON.stringify(r));return r.body.product}
async function order(f,p,memberId=f.members.alice,suffix='order',startsOn=f.today){const input={centerId:f.center,memberId,productId:p.id,startsOn},r=await f.req('/api/centers/passes/preview',f.ids.manager,input);assert.equal(r.status,200,JSON.stringify(r));return {...input,quoteHash:r.body.quoteHash,requestId:f.p+'_'+suffix}}
const own=f=>f.req('/api/centers/own/passes?centerId='+f.center,f.ids.alice);
async function reception(f){
  await f.db.platformTransaction(f.ids.root,client=>client.query('UPDATE centers.centers SET opening_hours=$2,version=version+1 WHERE id=$1',[f.center,Object.fromEntries(Array.from({length:7},(_,i)=>[i,[['00:00','24:00']]]))]),f.center);
  const result=await f.req('/api/centers/access/policy',f.ids.manager,{centerId:f.center,version:0,policy:{enabled:true,requireSubscription:true,denyOverdue:false,graceDays:0,allowPasses:true},requestId:f.p+'_policy'});assert.equal(result.status,200,JSON.stringify(result));
  const device=(await f.req('/api/centers/access/devices/create',f.ids.manager,{centerId:f.center,name:'Fictional pass reception',requestId:f.p+'_device'})).body;
  const issue=(id,key='token',uid=f.ids.alice)=>f.req('/api/centers/own/access/token',uid,{centerId:f.center,passId:id,requestId:f.p+'_'+key});
  const scan=async(token,key)=>{const r=await fetch(f.h.base+'/api/centers/access/consume',{method:'POST',headers:{...f.h.headers(f.ids.manager),'X-Center-Device-Key':device.credential},body:JSON.stringify({centerId:f.center,deviceId:device.device.id,token,requestId:f.p+'_'+key})});return {status:r.status,body:await r.json()}};
  return {issue,scan,device};
}
test('pass purchases reuse exact receipt/payment/refund ledger, explicit quotes, own isolation and immutable terms',async t=>{
  const f=await fixture(t),p=await product(f),cmd=await order(f,p),created=await f.req('/api/centers/passes/purchase',f.ids.manager,cmd);assert.equal(created.status,200,JSON.stringify(created));const pass=created.body.pass;
  const access=await reception(f);assert.equal((await access.issue(pass.id,'unpaid')).body.code,'access-unavailable');
  assert.equal(pass.totalMinor,'1000');assert.equal(pass.available,false);assert.equal(pass.remaining,3);assert.equal(pass.endsOn,shift(f.today,30));assert.equal((await f.req('/api/centers/passes/purchase',f.ids.manager,cmd)).body.pass.id,pass.id);
  const receipt=(await f.req('/api/centers/own/receipts?centerId='+f.center,f.ids.alice)).body.receipts.find(r=>r.id===pass.receiptId);assert.equal(receipt.concept,'pass');assert.equal(receipt.subscriptionId,null);assert.equal(receipt.netMinor,'826');assert.equal(receipt.taxMinor,'174');
  const payment=await f.req('/api/centers/payments/record',f.ids.manager,{centerId:f.center,memberId:f.members.alice,amountMinor:'1000',currency:'EUR',paidOn:f.today,method:'cash',reference:null,allocations:[{receiptId:pass.receiptId,amountMinor:'1000'}],requestId:f.p+'_pay'});assert.equal(payment.status,200,JSON.stringify(payment));assert.equal((await own(f)).body.passes[0].available,true);
  const funded=await access.issue(pass.id,'paid');assert.equal(funded.status,200,JSON.stringify(funded));
  const refund=await f.req('/api/centers/payments/refund',f.ids.root,{centerId:f.center,memberId:f.members.alice,paymentId:payment.body.payment.id,receiptId:pass.receiptId,amountMinor:'1',refundedOn:f.today,reason:'Fictional refund',requestId:f.p+'_refund'});assert.equal(refund.status,200,JSON.stringify(refund));assert.equal((await own(f)).body.passes[0].available,false);assert.equal((await access.scan(funded.body.token,'after_refund')).body.admitted,false);assert.equal((await own(f)).body.passes[0].remaining,3);
  assert.deepEqual((await f.req('/api/centers/own/passes?centerId='+f.center,f.ids.bob)).body.passes,[]);assert.equal((await f.req('/api/centers/own/passes?centerId='+f.center+'&memberId='+f.members.alice,f.ids.bob)).status,400);
  assert.equal((await f.req('/api/centers/passes?centerId='+f.other+'&memberId='+f.members.alice,f.ids.manager)).status,404);
  assert.ok([403,404].includes((await f.req('/api/centers/passes/products?centerId='+f.center,f.ids.trainer)).status));
  await assert.rejects(f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query("UPDATE centers.pass_products SET credits=1000 WHERE id=$1",[p.id])),{code:'42501'});
  assert.equal((await f.req('/api/centers/passes/products/archive',f.ids.manager,{centerId:f.center,id:p.id,version:p.version,requestId:f.p+'_archive'})).status,200);assert.equal((await f.req('/api/centers/passes/purchase',f.ids.manager,cmd)).body.pass.id,pass.id);
  assert.equal((await f.req('/api/centers/passes/preview',f.ids.manager,{centerId:f.center,memberId:f.members.alice,productId:p.id,startsOn:f.today})).body.code,'pass-unavailable');
});
test('one final pass credit is consumed atomically with admission; QR replay, inactive dates and holds cannot bypass it',async t=>{
  const f=await fixture(t),p=await product(f,{kind:'promotion',priceMinor:'0',credits:1}),cmd=await order(f,p),pass=(await f.req('/api/centers/passes/purchase',f.ids.manager,cmd)).body.pass,r=await reception(f);
  const token=await r.issue(pass.id);assert.equal(token.status,200,JSON.stringify(token));assert.equal((await own(f)).body.passes[0].remaining,1,'showing a QR does not spend');
  const scans=await Promise.all([r.scan(token.body.token,'scan_one'),r.scan(token.body.token,'scan_two')]);assert.equal(scans.filter(s=>s.body.admitted).length,1,JSON.stringify(scans));assert.equal((await own(f)).body.passes[0].remaining,0);
  assert.equal((await r.scan(token.body.token,'scan_one')).body.admitted,false);assert.equal((await r.issue(pass.id,'exhausted')).body.code,'access-unavailable');
  const futureCmd=await order(f,p,f.members.alice,'future',shift(f.today,1)),future=(await f.req('/api/centers/passes/purchase',f.ids.manager,futureCmd)).body.pass;assert.equal((await r.issue(future.id,'future_token')).body.code,'access-unavailable');
  const cmd2=await order(f,p,f.members.alice,'second'),pass2=(await f.req('/api/centers/passes/purchase',f.ids.manager,cmd2)).body.pass;
  const hold=await f.req('/api/centers/access/holds/create',f.ids.manager,{centerId:f.center,memberId:f.members.alice,memberVersion:(await f.detail('alice')).body.member.version,reason:'Fictional review',requestId:f.p+'_hold'});assert.equal(hold.status,200,JSON.stringify(hold));assert.equal((await r.issue(pass2.id,'held')).body.code,'access-unavailable');
  assert.equal((await f.req('/api/centers/passes/revoke',f.ids.manager,{centerId:f.center,id:pass2.id,reason:'Fictional revoke',requestId:f.p+'_revoke'})).body.pass.revoked,true);
  const count=await f.db.transaction({uid:f.ids.manager,centerId:f.center},client=>client.query('SELECT count(*)::integer AS n FROM centers.pass_consumptions WHERE center_id=$1',[f.center]));assert.equal(count.rows[0].n,1);
});
test('pass purchase audit failure rolls back the receipt, purchase and retry key',async t=>{
  const f=await fixture(t),p=await product(f),cmd=await order(f,p),database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit'))throw new Error('fictional pass audit failure');return client.query(sql,args)}}))};
  await assert.rejects(buyPass({database,user:{id:f.ids.manager},checkSession(){}},cmd),/fictional pass audit failure/);assert.deepEqual((await own(f)).body.passes,[]);assert.equal((await f.req('/api/centers/own/receipts?centerId='+f.center,f.ids.alice)).body.receipts.length,0);
  assert.equal((await f.req('/api/centers/passes/purchase',f.ids.manager,cmd)).status,200);
});

test('failed admission audit rolls back both token consumption and the final credit, allowing the same scan retry',async t=>{
  const f=await fixture(t),p=await product(f,{kind:'promotion',priceMinor:'0',credits:1}),cmd=await order(f,p),pass=(await f.req('/api/centers/passes/purchase',f.ids.manager,cmd)).body.pass,r=await reception(f),token=(await r.issue(pass.id)).body.token;
  const database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit'))throw new Error('fictional admission audit failure');return client.query(sql,args)}}))},body={centerId:f.center,deviceId:r.device.device.id,token,requestId:f.p+'_rollback_scan'};
  await assert.rejects(consumeAccessToken({database,user:{id:f.ids.manager},checkSession(){},deviceKey:r.device.credential,mintAccessCredential:()=>token},body),/fictional admission audit failure/);
  assert.equal((await own(f)).body.passes[0].remaining,1);assert.equal((await r.scan(token,'rollback_scan')).body.admitted,true);assert.equal((await own(f)).body.passes[0].remaining,0);
});
test('pass selection substitutes only the subscription check and expiry uses the center day at validation',async t=>{
  const f=await fixture(t);let early;
  const memberId=f.p+'_unsubscribed';await f.db.platformTransaction(f.ids.root,async client=>{
    await client.query("UPDATE centers.centers SET timezone='Etc/GMT+12',version=version+1 WHERE id=$1",[f.center]);
    early=(await client.query("SELECT (statement_timestamp() AT TIME ZONE 'Etc/GMT+12')::date::text AS day")).rows[0].day;
    await client.query("INSERT INTO centers.members(id,center_id,member_number,name,state,joined_on,account_uid) VALUES($1,$2,$3,'Fictional pass only','active',$4,$5)",[memberId,f.center,'P-'+memberId,early,f.ids.technical]);
  },f.center);
  const p=await product(f,{kind:'promotion',priceMinor:'0',credits:2,validDays:1}),cmd=await order(f,p,memberId,'unsubscribed',early),pass=(await f.req('/api/centers/passes/purchase',f.ids.manager,cmd)).body.pass,r=await reception(f);
  assert.equal((await f.req('/api/centers/own/access/token',f.ids.technical,{centerId:f.center,requestId:f.p+'_no_pass'})).body.code,'access-unavailable');
  const first=await r.issue(pass.id,'first_pass',f.ids.technical);assert.equal(first.status,200,JSON.stringify(first));assert.equal((await r.scan(first.body.token,'valid_pass_without_subscription')).body.admitted,true);const token=await r.issue(pass.id,'only_pass',f.ids.technical);assert.equal(token.status,200,JSON.stringify(token));
  assert.equal((await r.issue(pass.id,'wrong_owner',f.ids.bob)).body.code,'access-unavailable');
  await f.db.platformTransaction(f.ids.root,client=>client.query("UPDATE centers.centers SET timezone='Etc/GMT-14',version=version+1 WHERE id=$1",[f.center]),f.center);
  assert.equal((await r.scan(token.body.token,'expired_local_day')).body.admitted,false);
  assert.equal((await r.issue(pass.id,'expired_again',f.ids.technical)).body.code,'access-unavailable');
  assert.equal((await f.req('/api/centers/own/passes?centerId='+f.center,f.ids.technical)).body.passes[0].remaining,1);
});
test('revising a pass product atomically replaces the catalogue but preserves purchases and replay',async t=>{
 const f=await fixture(t),p=await product(f),purchase=(await f.req('/api/centers/passes/purchase',f.ids.manager,await order(f,p))).body.pass;
 const body={centerId:f.center,id:p.id,version:p.version,fields:{...fields,name:'Fictional revised',credits:8,priceMinor:'1500'},requestId:f.p+'_revise'};
 const revised=await f.req('/api/centers/passes/products/revise',f.ids.manager,body);assert.equal(revised.status,200,JSON.stringify(revised));assert.notEqual(revised.body.product.id,p.id);assert.equal(revised.body.product.credits,8);
 const replay=await f.req('/api/centers/passes/products/revise',f.ids.manager,body);assert.equal(replay.body.product.id,revised.body.product.id);
 const previous=(await own(f)).body.passes.find(row=>row.id===purchase.id);assert.equal(previous.credits,3);assert.equal(previous.totalMinor,'1000');assert.equal(previous.name,p.name);
 const old=(await f.req('/api/centers/passes/products?'+new URLSearchParams({centerId:f.center,archived:'all'}),f.ids.manager)).body.products.find(row=>row.id===p.id);assert.equal(old.archived,true);
 assert.equal((await f.req('/api/centers/passes/products/revise',f.ids.manager,{...body,requestId:f.p+'_stale'})).status,409);
 assert.equal((await f.req('/api/centers/passes/products/revise',f.ids.manager,{...body,centerId:f.other,requestId:f.p+'_foreign'})).status,404);
 assert.ok([403,404].includes((await f.req('/api/centers/passes/products/revise',f.ids.trainer,{...body,requestId:f.p+'_denied'})).status));
});
test('manual consumption targets the selected member pass and preserves one daily use across passes',async t=>{
 const f=await fixture(t),first=await product(f,{kind:'promotion',priceMinor:'0',validDays:10},'first'),later=await product(f,{kind:'promotion',priceMinor:'0',validDays:60},'later');
 const a=(await f.req('/api/centers/passes/purchase',f.ids.manager,await order(f,first,f.members.alice,'first'))).body.pass,b=(await f.req('/api/centers/passes/purchase',f.ids.manager,await order(f,later,f.members.alice,'later'))).body.pass;
 const raw={centerId:f.center,memberId:f.members.alice,passId:b.id,requestId:f.p+'_target'};
 assert.equal((await f.req('/api/centers/passes/day',f.ids.manager,{...raw,memberId:f.members.bob,requestId:f.p+'_wrong_member'})).status,409);
 const used=await f.req('/api/centers/passes/day',f.ids.manager,raw);assert.equal(used.status,200,JSON.stringify(used));assert.equal(used.body.passId,b.id);
 const list=(await own(f)).body;assert.equal(list.usedToday,true);assert.equal(list.passes.find(p=>p.id===a.id).remaining,3);assert.equal(list.passes.find(p=>p.id===b.id).remaining,2);
 const twice=await f.req('/api/centers/passes/day',f.ids.root,{...raw,passId:a.id,requestId:f.p+'_again'});assert.equal(twice.body.alreadyUsed,true);assert.equal((await own(f)).body.passes.find(p=>p.id===a.id).remaining,3);
 const found=await f.req('/api/centers/passes/history?'+new URLSearchParams({centerId:f.center,query:(await f.detail('alice')).body.member.number}),f.ids.manager);assert.equal(found.status,200,JSON.stringify(found));assert.equal(found.body.passes.length,2);
});
