import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {isolatedDatabase,startHttp} from './helpers.mjs';
import {createCentersDatabase} from '../../centers/db.js';
import {stripeProfiles,STRIPE_API_VERSION} from '../../centers/stripe-config.js';
import {prepareStripeAttempt,receiveStripeWebhook} from '../../centers/services/stripe-foundation.js';

test('Stripe sandbox foundation reserves receipts, bounds each center and persists signed events without settling the ledger',async t=>{
  const {app,migrator}=await isolatedDatabase(),database=createCentersDatabase({enabled:true,databaseUrl:app});t.after(async()=>{await database.close();await migrator.end()});
  const p='st_'+randomBytes(5).toString('hex'),root=p+'_root',manager=p+'_manager',other=p+'_other';
  const h=await startHttp(t,{app,superadminUids:[root],users:[root,manager,other].map(id=>({id,name:id}))});
  const req=async(path,uid,body)=>{const response=await fetch(h.base+path,{headers:h.headers(uid),...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const center=(await req('/api/platform/centers/create',root,{name:p,managerUid:manager,requestId:p+'_center'})).body.center.id;
  const centerB=(await req('/api/platform/centers/create',root,{name:p+' other',managerUid:other,requestId:p+'_center_b'})).body.center.id;
  const plan=(await req('/api/centers/plans/create',manager,{centerId:center,name:'Fictional Stripe fee',priceMinor:'1000',currency:'EUR',intervalMonths:1,priceIncludesTax:true,taxBasisPoints:0,proration:'none',requestId:p+'_plan'})).body.plan;
  const bill=async suffix=>{
    const member=(await req('/api/centers/members/create',manager,{centerId:center,name:'Fictional '+suffix,requestId:p+'_member_'+suffix})).body.member;
    const info=(await req(`/api/centers/member?centerId=${center}&id=${member.id}`,manager)).body;
    const contract=(await req('/api/centers/subscriptions/create',manager,{centerId:center,memberId:member.id,memberVersion:member.version,priceVersionId:plan.priceVersionId,effectiveOn:info.today,requestId:p+'_contract_'+suffix})).body.subscriptions[0];
    const receipt=(await req('/api/centers/receipts/generate',manager,{centerId:center,memberId:member.id,subscriptionId:contract.id,periodStart:contract.anchorOn,dueOn:info.today,requestId:p+'_receipt_'+suffix})).body.receipt;return {member,receipt,today:info.today};
  };
  const a=await bill('a'),b=await bill('b'),secret='whsec_fictional_signature_test_secret';
  const config={enabled:true,stripeProfiles:stripeProfiles({CENTERS_STRIPE_PROFILES_JSON:JSON.stringify([{id:p,mode:'test',accountId:'acct_fictionaltest1234',apiKey:'sk_test_fictional_test_key_never_sent',webhookSecrets:[secret],centerIds:[center],maxAmountMinor:'1000',dailyLimitMinor:'1500',returnOrigin:'http://localhost:5178'}])})};
  const context={database,config,user:{id:manager},checkSession:()=>{}},input={centerId:center,memberId:a.member.id,receiptId:a.receipt.id,requestId:p+'_prepare_a'};
  const race=await Promise.allSettled([prepareStripeAttempt(context,input),prepareStripeAttempt(context,{...input,requestId:p+'_prepare_b'})]);assert.equal(race.filter(row=>row.status==='fulfilled').length,1);assert.equal(race.find(row=>row.status==='rejected').reason.code,'checkout-pending');
  const winner=race.findIndex(row=>row.status==='fulfilled'),winningInput={...input,requestId:p+(winner===0?'_prepare_a':'_prepare_b')},attemptId=race[winner].value.attemptId;
  assert.equal((await prepareStripeAttempt(context,winningInput)).attemptId,attemptId);
  await assert.rejects(prepareStripeAttempt(context,{...input,memberId:b.member.id,receiptId:b.receipt.id,requestId:p+'_daily_limit'}),{code:'stripe-limit'});
  await assert.rejects(prepareStripeAttempt({...context,user:{id:other}},input),{status:404});
  assert.equal((await database.transaction({uid:other,centerId:centerB},client=>client.query('SELECT id FROM centers.stripe_attempts WHERE center_id=$1',[center]))).rows.length,0);
  assert.equal((await database.transaction({uid:manager,centerId:center},client=>client.query("UPDATE centers.stripe_attempts SET state='expired' WHERE id=$1",[attemptId]))).rowCount,0);
  await assert.rejects(database.platformTransaction(root,client=>client.query('UPDATE centers.stripe_attempts SET amount_minor=1 WHERE id=$1',[attemptId]),center),{code:'42501'});
  await assert.rejects(database.transaction({uid:manager,centerId:center},client=>client.query(`INSERT INTO centers.stripe_attempts(id,center_id,member_id,receipt_id,profile_id,actor_uid,amount_minor,currency,reserved_payment_id,expires_at)
    SELECT $2,center_id,member_id,receipt_id,profile_id,actor_uid,amount_minor,currency,$3,expires_at FROM centers.stripe_attempts WHERE id=$1`,[attemptId,p+'_duplicate',p+'_reservation'])),{code:'23505'});
  const payment={centerId:center,memberId:a.member.id,amountMinor:'1000',currency:'EUR',paidOn:a.today,method:'cash',allocations:[{receiptId:a.receipt.id,amountMinor:'1000'}],requestId:p+'_manual'};
  assert.equal((await req('/api/centers/payments/record',manager,payment)).body.code,'checkout-pending');
  await assert.rejects(database.transaction({uid:manager,centerId:center},async client=>{
    await client.query("INSERT INTO centers.payments(id,center_id,member_id,amount_minor,currency,paid_on,method,actor_uid) VALUES($1,$2,$3,1000,'EUR',$4,'cash',$5)",[p+'_bypass',center,a.member.id,a.today,manager]);
    await client.query('INSERT INTO centers.payment_allocations(center_id,member_id,payment_id,receipt_id,amount_minor,actor_uid) VALUES($1,$2,$3,$4,1000,$5)',[center,a.member.id,p+'_bypass',a.receipt.id,manager]);
  }),{code:'23514'});
  const now=Math.floor(Date.now()/1000),event={id:'evt_'+p,api_version:STRIPE_API_VERSION,type:'checkout.session.completed',livemode:false,created:now,data:{object:{id:'cs_test_'+p,object:'checkout.session',mode:'payment',livemode:false,amount_total:1000,currency:'eur',payment_status:'paid',status:'complete',payment_intent:'pi_'+p,metadata:{attempt_id:attemptId,center_id:center,receipt_id:a.receipt.id},customer_details:{email:'not-stored@example.invalid'}}}};
  const send=async value=>{const raw=Buffer.from(JSON.stringify(value)),header='t='+now+',v1='+createHmac('sha256',secret).update(String(now)+'.').update(raw).digest('hex');return receiveStripeWebhook({database,config},p,raw,header)};
  const received=await Promise.all([send(event),send(event)]);assert.ok(received.some(row=>row.duplicate));
  assert.equal((await send({...event,extra:'ignored nonfinancial change'})).duplicate,true);
  await assert.rejects(send({...event,data:{object:{...event.data.object,amount_total:1001}}}),{code:'stripe-event-conflict'});
  await assert.rejects(send({...event,livemode:true}),{code:'stripe-signature-invalid'});
  const result=await database.platformTransaction(root,async client=>({inbox:(await client.query('SELECT projection,state FROM centers.stripe_inbox WHERE center_id=$1',[center])).rows,payments:(await client.query('SELECT id FROM centers.payments WHERE center_id=$1',[center])).rows}),center);
  assert.equal(result.inbox.length,1);assert.equal(result.inbox[0].state,'pending');assert.equal(result.payments.length,0,'a signed success alone never settles before the reconciliation processor');assert.ok(!JSON.stringify(result).includes('not-stored@'));
  await database.platformTransaction(root,client=>client.query("UPDATE centers.stripe_attempts SET state='expired' WHERE id=$1",[attemptId]),center);
  assert.equal((await req('/api/centers/payments/record',manager,payment)).status,200,'manual payment resumes only after the reservation is released');
});
