import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
test('member portal resolves session-owned affiliations and financial history with real RLS, including ended/inactive membership',async t=>{
  const {app,migrator}=await isolatedDatabase(),db=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await db.close();await migrator.end()});
  const p='own_'+randomBytes(5).toString('hex'),root=p+'_root',manager=p+'_manager',manager2=p+'_manager2',alice=p+'_alice',bob=p+'_bob';
  const h=await startHttp(t,{app,superadminUids:[root],users:[root,manager,manager2,alice,bob].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const r=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const center=(await req('/api/platform/centers/create',root,{name:p,managerUid:manager,requestId:p+'_center'})).body.center.id;
  const other=(await req('/api/platform/centers/create',root,{name:p+'_other',managerUid:manager2,requestId:p+'_othercenter'})).body.center.id;
  const createLinked=async(c,uid,account,label)=>{
    const member=(await req('/api/centers/members/create',uid,{centerId:c,name:label,requestId:p+'_'+label})).body.member;
    const invitation=(await req('/api/centers/invitations/create',uid,{centerId:c,kind:'member',memberId:member.id,accountUid:account,requestId:p+'_'+label+'_invite'})).body;
    assert.equal((await req('/api/centers/invitations/accept',account,{token:invitation.token})).status,200);return (await req(`/api/centers/member?centerId=${c}&id=${member.id}`,uid)).body.member;
  };
  const a=await createLinked(center,manager,alice,'Alice'),b=await createLinked(center,manager,bob,'Bob'),dual=await createLinked(center,manager,manager,'Manager'),elseA=await createLinked(other,manager2,alice,'AliceOther');
  const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Own fee',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const receipts=[];
  for(const member of [a,b,dual]){
    const today=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body.today;
    const subscription=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:member.version,priceVersionId:plan.priceVersionId,effectiveOn:today,discountBasisPoints:1000,discountReason:'PRIVATE_STAFF_DISCOUNT',requestId:p+'_'+member.id+'_contract'})).body.subscriptions[0];
    const receipt=(await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:subscription.id,periodStart:subscription.anchorOn,dueOn:today,requestId:p+'_'+member.id+'_receipt'})).body.receipt;receipts.push({receipt,today,subscription});
  }
  const {receipt,today,subscription}=receipts[0],base='/api/centers/own/';
  const membership=await req(base+'membership?centerId='+center,alice);assert.equal(membership.status,200,JSON.stringify(membership));assert.equal(membership.body.member.id,a.id);assert.equal(membership.body.subscriptions[0].priceMinor,'1000');assert.equal(membership.body.summary.outstandingMinor,'900');assert.ok(!JSON.stringify(membership.body).includes('PRIVATE_STAFF_DISCOUNT'));
  assert.equal((await req(base+'membership?centerId='+other,alice)).body.member.id,elseA.id);assert.equal((await req(base+'membership?centerId='+other,bob)).status,404);assert.equal((await req(base+'membership?centerId='+center,root)).status,404);
  assert.equal((await req(base+'membership?centerId='+center+'&memberId='+b.id,alice)).status,400);assert.equal((await req(base+'receipts?centerId='+center+'&id='+receipts[1].receipt.id,alice)).status,400);
  assert.equal((await req(base+'receipts?centerId='+center,alice)).body.receipts.length,1);assert.equal((await req(base+'receipts?centerId='+center,manager)).body.receipts[0].memberId,dual.id,'own scope remains strict even when caller can administrate others');
  const sqlOwn=await db.transaction({uid:alice,centerId:center},async client=>({receipts:(await client.query('SELECT id FROM centers.receipts WHERE center_id=$1',[center])).rows,terms:(await client.query('SELECT id FROM centers.membership_plan_versions WHERE center_id=$1',[center])).rows}));assert.deepEqual(sqlOwn.receipts.map(r=>r.id),[receipt.id]);assert.equal(sqlOwn.terms.length,1);
  assert.equal((await db.transaction({uid:alice,centerId:other},client=>client.query('SELECT id FROM centers.receipts WHERE center_id=$1',[center]))).rows.length,0);
  const payment=(await req('/api/centers/payments/record',manager,{centerId:center,memberId:a.id,amountMinor:'300',currency:'EUR',paidOn:today,method:'cash',reference:'PRIVATE_STAFF_REFERENCE',allocations:[{receiptId:receipt.id,amountMinor:'300'}],requestId:p+'_payment'})).body.payment;
  await req('/api/centers/payments/refund',root,{centerId:center,memberId:a.id,paymentId:payment.id,receiptId:receipt.id,amountMinor:'100',refundedOn:today,reason:'PRIVATE_STAFF_REASON',requestId:p+'_refund'});
  const history=(await req(base+'payments?centerId='+center,alice)).body;assert.equal(history.payments[0].amountMinor,'300');assert.equal(history.payments[0].refunds[0].amountMinor,'100');assert.ok(!JSON.stringify(history).includes('PRIVATE_STAFF'));assert.equal((await req(base+'membership?centerId='+center,alice)).body.summary.outstandingMinor,'700');
  assert.equal((await req('/api/centers/payments?centerId='+center+'&memberId='+a.id,alice)).status,403);assert.equal((await req('/api/centers/billing/debts?centerId='+center,alice)).status,403);assert.equal((await req('/api/centers/payments/record',alice,{centerId:center,memberId:a.id,amountMinor:'1',currency:'EUR',paidOn:today,method:'cash',allocations:[{receiptId:receipt.id,amountMinor:'1'}],requestId:p+'_forbidden'})).status,403);
  await assert.rejects(db.transaction({uid:alice,centerId:center},client=>client.query('UPDATE centers.receipts SET total_minor=1 WHERE id=$1',[receipt.id])),{code:'42501'});
  await db.platformTransaction(root,client=>client.query(`INSERT INTO centers.receipts(id,center_id,member_id,subscription_id,period_start,period_end,due_on,currency,net_minor,tax_minor,total_minor,snapshot,actor_uid)
    SELECT $2,center_id,member_id,subscription_id,period_start+1,period_end,due_on+1,currency,net_minor,tax_minor,total_minor,snapshot,$3 FROM centers.receipts WHERE id=$1`,[receipt.id,p+'_page2',root]),center);
  const page=(await req(base+'receipts?centerId='+center+'&limit=1',alice)).body;assert.ok(page.nextCursor);assert.equal((await req(base+'receipts?centerId='+center+'&cursor='+encodeURIComponent(page.nextCursor),alice)).body.receipts.length,1);assert.equal((await req(base+'receipts?centerId='+center+'&cursor='+encodeURIComponent(page.nextCursor),bob)).status,400);
  const current=(await req(`/api/centers/member?centerId=${center}&id=${a.id}`,manager)).body.member;
  assert.equal((await req('/api/centers/members/transition',manager,{centerId:center,id:a.id,version:current.version,action:'end',effectiveOn:today,reason:'PRIVATE_END_REASON',requestId:p+'_end'})).status,200);
  const centerInfo=(await req('/api/centers/detail?centerId='+center,root)).body.center;
  assert.equal((await req('/api/platform/centers/update',root,{centerId:center,version:centerInfo.version,name:p,timezone:'Europe/Madrid',state:'inactive'})).status,200);
  const ended=await req(base+'membership?centerId='+center,alice);assert.equal(ended.status,200);assert.equal(ended.body.member.state,'ended');assert.equal(ended.body.center.state,'inactive');assert.equal((await req(base+'receipts?centerId='+center,alice)).status,200);assert.equal((await req(base+'payments?centerId='+center,alice)).status,200);assert.ok(!JSON.stringify(ended.body).includes('PRIVATE_END_REASON'));
  assert.equal((await req('/api/centers/me',alice)).body.centers.length,2,'historical affiliations do not remove personal account access');
});
