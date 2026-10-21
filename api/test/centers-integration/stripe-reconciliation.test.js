import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripeFixture} from './stripe-fixture.mjs';
import {runClaimedStripeAttempt,stripeTick} from '../../centers/services/stripe-worker.js';
import {CentersError} from '../../centers/errors.js';

test('Stripe reconciliation fences workers, recovers a lost creation response and appends one immutable payment',async t=>{
  const f=await stripeFixture(t),bill=await f.bill(),{attemptId:id}=await f.prepare(bill);
  const initial=await f.claim(id);assert.ok(initial);assert.equal(await f.claim(id),null,'another worker cannot take a live lease');
  const carrier=f.clientFactory(),lost={...carrier,async create(value){await carrier.create(value);throw new CentersError(503,'stripe-unavailable','fictional timeout')}};
  assert.equal((await runClaimedStripeAttempt(f.database,f.config,initial,{clientFactory:()=>lost})).retry,true);
  assert.equal((await f.attempt(id)).session_id,null);await f.ready(id);
  assert.equal((await f.run(id)).state,'open');assert.equal(f.created.size,1,'repeated creation uses the same stable attempt key');
  const opened=await f.attempt(id),session=f.paid(opened.session_id);await Promise.all([f.event(session.id,{eventId:'evt_'+f.prefix+'_same'}),f.event(session.id,{eventId:'evt_'+f.prefix+'_same'})]);
  const race=await Promise.all([f.claim(id),f.claim(id)]);assert.equal(race.filter(Boolean).length,1);
  assert.equal((await runClaimedStripeAttempt(f.database,f.config,race.find(Boolean),{clientFactory:f.clientFactory})).state,'paid');
  const paid=await f.attempt(id);assert.equal(paid.received_minor,'1000');assert.equal(paid.payment_id,paid.reserved_payment_id);
  const ledger=await f.sql(async client=>({payments:(await client.query('SELECT id,amount_minor,reference FROM centers.payments WHERE center_id=$1',[f.center])).rows,allocations:(await client.query('SELECT amount_minor FROM centers.payment_allocations WHERE center_id=$1',[f.center])).rows,inbox:(await client.query('SELECT state FROM centers.stripe_inbox WHERE center_id=$1',[f.center])).rows}));
  assert.equal(ledger.payments.length,1);assert.equal(ledger.allocations.length,1);assert.equal(ledger.inbox[0].state,'done');
  const privateRecords=await f.sql(client=>client.query('SELECT evidence FROM centers.stripe_attempts WHERE center_id=$1',[f.center]));assert.ok(!JSON.stringify(privateRecords.rows).includes('never-store'));assert.ok(!JSON.stringify(privateRecords.rows).includes('not-recorded@'));
  const before=f.calls.length;await f.event(session.id,{type:'checkout.session.expired',session:{status:'expired',payment_status:'unpaid'}});await f.run(id);
  assert.equal(f.calls.length,before,'old terminal events do not start a new provider request');assert.equal((await f.attempt(id)).state,'paid');
  await assert.rejects(f.sql(client=>client.query("UPDATE centers.stripe_attempts SET state='expired',payment_id=NULL WHERE id=$1",[id])),{code:'23514'});
  await assert.rejects(f.sql(client=>client.query('UPDATE centers.stripe_attempts SET return_origin=$2 WHERE id=$1',[id,'https://other.example'])),{code:'42501'});
});

test('late success preserves received funds for review when another checkout or manual payment occupies the receipt',async t=>{
  const f=await stripeFixture(t),bill=await f.bill(),{attemptId:old}=await f.prepare(bill);await f.run(old);const original=await f.attempt(old);
  f.sessions.get(original.session_id).status='expired';await f.ready(old);assert.equal((await f.run(old)).state,'expired');
  const {attemptId:newer}=await f.prepare(bill);await f.run(newer);f.paid(original.session_id);await f.event(original.session_id);
  assert.equal((await f.run(old)).state,'review');const reviewed=await f.attempt(old);assert.equal(reviewed.received_minor,'1000');assert.equal(reviewed.error_code,'stripe-reservation-conflict');assert.equal(reviewed.payment_id,null);assert.ok(reviewed.evidence.paymentIntentId);
  const payment={centerId:f.center,memberId:bill.member.id,amountMinor:'1000',currency:'EUR',paidOn:bill.today,method:'cash',allocations:[{receiptId:bill.receipt.id,amountMinor:'1000'}],requestId:f.prefix+'_manual'};
  assert.equal((await f.req('/api/centers/payments/record',f.manager,payment)).body.code,'checkout-pending');
  await assert.rejects(f.prepare(bill),{code:'checkout-pending'});
  const current=await f.attempt(newer);f.sessions.get(current.session_id).status='expired';await f.ready(newer);await f.run(newer);
  await f.event(original.session_id);assert.equal((await f.run(old)).state,'paid','a new signed event can reconcile once the competing reservation expires');
  assert.equal((await f.sql(client=>client.query('SELECT id FROM centers.payments WHERE center_id=$1',[f.center]))).rowCount,1);
  const second=await f.bill(),{attemptId:late}=await f.prepare(second);await f.run(late);const snapshot=await f.attempt(late);f.sessions.get(snapshot.session_id).status='expired';await f.ready(late);await f.run(late);
  assert.equal((await f.req('/api/centers/payments/record',f.manager,{...payment,memberId:second.member.id,allocations:[{receiptId:second.receipt.id,amountMinor:'1000'}],requestId:f.prefix+'_manual_second'})).status,200);
  f.paid(snapshot.session_id);await f.event(snapshot.session_id);assert.equal((await f.run(late)).state,'review');assert.equal((await f.attempt(late)).error_code,'stripe-balance-changed');
});

test('expired leases are fenced and signed success cannot override authoritative unpaid or invalid gateway evidence',async t=>{
  const f=await stripeFixture(t),bill=await f.bill(),{attemptId:id}=await f.prepare(bill),old=await f.claim(id);
  await f.sql(client=>client.query("UPDATE centers.stripe_attempts SET lease_until=now()-interval '1 second' WHERE id=$1",[id]));
  const fresh=await f.claim(id);assert.ok(fresh);assert.equal((await runClaimedStripeAttempt(f.database,f.config,old,{clientFactory:f.clientFactory})).stale,true);
  assert.equal((await runClaimedStripeAttempt(f.database,f.config,fresh,{clientFactory:f.clientFactory})).state,'open');
  const attempt=await f.attempt(id);await f.event(attempt.session_id,{session:{payment_status:'paid',status:'complete',payment_intent:'pi_fictional_not_yet_confirmed'}});
  assert.equal((await f.run(id)).state,'open');assert.equal((await f.attempt(id)).payment_id,null,'signed notification is a wakeup, not proof of capture');
  f.paid(attempt.session_id).payment_intent.latest_charge.amount_captured=999;await f.ready(id);assert.equal((await f.run(id)).state,'review');assert.equal((await f.attempt(id)).error_code,'stripe-evidence-invalid');
  assert.equal((await f.sql(client=>client.query('SELECT id FROM centers.payments WHERE center_id=$1',[f.center]))).rowCount,0);
  assert.equal((await stripeTick(f.database,{enabled:false})).processed,0);
});

test('creation beyond the idempotency recovery window and changed provider profiles require review without a new session',async t=>{
  const f=await stripeFixture(t),a=await f.bill(),{attemptId:first}=await f.prepare(a),claim=await f.claim(first);
  const result=await runClaimedStripeAttempt(f.database,f.config,{...claim,created_at_seconds:String(Date.now()/1000-24*3600)},{clientFactory:f.clientFactory});
  assert.equal(result.state,'review');assert.equal((await f.attempt(first)).error_code,'stripe-creation-uncertain');assert.equal(f.created.size,0);
  const b=await f.bill(),{attemptId:second}=await f.prepare(b),next=await f.claim(second),before=f.calls.length;
  const changed={...f.config,stripeProfiles:f.config.stripeProfiles.map(profile=>({...profile,accountId:'acct_otherfictional'}))};
  assert.equal((await runClaimedStripeAttempt(f.database,changed,next,{clientFactory:f.clientFactory})).state,'review');assert.equal(f.calls.length,before);assert.equal((await f.attempt(second)).error_code,'stripe-profile-changed');
});

test('bounded transient retries retain the reservation and a missing balance transaction never invents a payment date',async t=>{
  const f=await stripeFixture(t),bill=await f.bill(),{attemptId:id}=await f.prepare(bill);await f.run(id);const record=await f.attempt(id),session=f.paid(record.session_id);session.payment_intent.latest_charge.balance_transaction=null;
  await f.ready(id);assert.equal((await f.run(id)).retry,true);assert.equal((await f.attempt(id)).payment_id,null);
  const invalid={...f.clientFactory(),async retrieve(){throw new CentersError(503,'stripe-unavailable','fictional service failure')}};
  for(let index=0;index<7;index++){await f.ready(id);await f.run(id,{clientFactory:()=>invalid})}
  const reviewed=await f.attempt(id);assert.equal(reviewed.state,'review');assert.equal(reviewed.payment_id,null);
  await assert.rejects(f.prepare(bill),{code:'checkout-pending'});
});

test('a completed card checkout without captured money requires review instead of advertising an unusable open checkout',async t=>{
  const f=await stripeFixture(t),bill=await f.bill(),{attemptId:id}=await f.prepare(bill);await f.run(id);const record=await f.attempt(id);f.sessions.get(record.session_id).status='complete';await f.ready(id);
  assert.equal((await f.run(id)).state,'review');const reviewed=await f.attempt(id);assert.equal(reviewed.error_code,'stripe-payment-unconfirmed');assert.equal(reviewed.payment_id,null);assert.equal(reviewed.checkout_url,null);
});
