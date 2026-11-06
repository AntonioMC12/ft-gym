import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './class-fixture.mjs';
import {paySubscription} from '../../centers/services/subscriptions.js';

test('select fee, preview without persistence, confirm one receipt and cash payment; rollback and retry',async t=>{
 const f=await fixture(t);
 const member=(await f.req('/api/centers/members/create',f.ids.manager,{centerId:f.center,name:'Fictional single payment',requestId:f.p+'_newpay'})).body.member;
 const body={centerId:f.center,memberId:member.id,memberVersion:member.version,priceVersionId:f.plan.priceVersionId,effectiveOn:f.today,discountBasisPoints:1000,discountReason:'Fictional discount',requestId:f.p+'_pay'};
 const list=async kind=>(await f.req('/api/centers/'+kind+'?'+new URLSearchParams({centerId:f.center,memberId:member.id}),f.ids.manager)).body;
 const q=await f.req('/api/centers/subscriptions/pay-preview',f.ids.manager,body);assert.equal(q.status,200,JSON.stringify(q));assert.equal(q.body.amountMinor,'900');
 assert.equal((await list('subscriptions')).subscriptions.length,0);assert.equal((await list('receipts')).receipts.length,0);assert.equal((await list('payments')).payments.length,0);
 assert.ok([403,404].includes((await f.req('/api/centers/subscriptions/pay-preview',f.ids.trainer,body)).status));
 const command={...body,quoteHash:q.body.quoteHash};
 assert.equal((await f.req('/api/centers/subscriptions/pay',f.ids.manager,{...command,quoteHash:'stale'})).body.code,'quote-changed');assert.equal((await list('subscriptions')).subscriptions.length,0);
 const database={transaction:(context,work)=>f.db.transaction(context,client=>work({query:(sql,args)=>{if(sql.startsWith('INSERT INTO centers.business_audit')&&args[2]==='payment.recorded')throw Error('fictional payment failure');return client.query(sql,args)}}))};
 await assert.rejects(paySubscription({database,user:{id:f.ids.manager},checkSession(){}},command),/fictional payment failure/);
 assert.equal((await list('subscriptions')).subscriptions.length,0);assert.equal((await list('receipts')).receipts.length,0);
 const paid=await f.req('/api/centers/subscriptions/pay',f.ids.manager,command);assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.body.paymentRecorded,true);
 assert.equal((await f.req('/api/centers/subscriptions/pay',f.ids.manager,command)).status,200);
 const receipts=(await list('receipts')).receipts;assert.equal(receipts.length,1);assert.equal(receipts[0].settlement.balanceMinor,'0');
 const payments=(await list('payments')).payments;assert.equal(payments.length,1);assert.equal(payments[0].amountMinor,'900');assert.equal(payments[0].method,'cash');
 assert.equal((await list('subscriptions')).subscriptions.length,1);
 assert.equal((await f.req('/api/centers/subscriptions/pay-preview',f.ids.manager,body)).body.alreadyCovered,true);
});

test('changing an unpaid fee preserves history and concurrent confirmations cannot duplicate payment',async t=>{
 const f=await fixture(t);
 const detail=(await f.req('/api/centers/subscriptions?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body;
 const plan=(await f.req('/api/centers/plans/create',f.ids.manager,{centerId:f.center,name:'Fictional replacement',priceMinor:'2500',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:f.p+'_replacement'})).body.plan;
 const body={centerId:f.center,memberId:f.members.alice,memberVersion:detail.member.version,id:detail.subscriptions[0].id,priceVersionId:plan.priceVersionId,effectiveOn:f.today,requestId:f.p+'_replacepay'};
 const q=await f.req('/api/centers/subscriptions/pay-preview',f.ids.manager,body);assert.equal(q.status,200,JSON.stringify(q));assert.equal(q.body.amountMinor,'2500');
 const results=await Promise.all([f.req('/api/centers/subscriptions/pay',f.ids.manager,{...body,quoteHash:q.body.quoteHash}),f.req('/api/centers/subscriptions/pay',f.ids.manager,{...body,quoteHash:q.body.quoteHash})]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));
 const updated=(await f.req('/api/centers/subscriptions?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body;assert.equal(updated.subscriptions.length,2);assert.equal(updated.subscriptions.find(s=>s.id===body.id).endsOn,f.today);
 const payments=(await f.req('/api/centers/payments?'+new URLSearchParams({centerId:f.center,memberId:f.members.alice}),f.ids.manager)).body.payments;assert.equal(payments.length,1);assert.equal(payments[0].amountMinor,'2500');
});
