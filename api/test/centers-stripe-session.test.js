import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripeSessionEvidence} from '../centers/domain/stripe-session.js';
import {createStripeTestClient} from '../centers/services/stripe-client.js';

const attempt={id:'attempt_1',center_id:'center_1',receipt_id:'receipt_1',amount_minor:'1000',session_id:'cs_test_1',expires_at_seconds:1800003600,created_at_seconds:1800000000};
const metadata={attempt_id:attempt.id,center_id:attempt.center_id,receipt_id:attempt.receipt_id};
function session(){return {id:'cs_test_1',object:'checkout.session',mode:'payment',livemode:false,client_reference_id:attempt.id,amount_subtotal:1000,amount_total:1000,currency:'eur',metadata,expires_at:1800003600,automatic_tax:{enabled:false},adaptive_pricing:{enabled:false},payment_method_types:['card'],total_details:{amount_discount:0,amount_tax:0,amount_shipping:0},status:'complete',payment_status:'paid',customer_details:{email:'do-not-persist@example.invalid'},payment_intent:{id:'pi_1',object:'payment_intent',amount:1000,amount_received:1000,currency:'eur',livemode:false,status:'succeeded',capture_method:'automatic',metadata,client_secret:'do-not-persist',latest_charge:{id:'ch_1',object:'charge',payment_intent:'pi_1',amount:1000,amount_captured:1000,amount_refunded:0,currency:'eur',livemode:false,paid:true,captured:true,status:'succeeded',disputed:false,refunded:false,balance_transaction:{id:'txn_1',object:'balance_transaction',source:'ch_1',type:'charge',amount:1000,currency:'eur',created:1800000060}}}}}
const project=value=>stripeSessionEvidence(value,attempt,{now:1800000100});
test('authoritative capture projection contains only ledger evidence and uses the balance transaction timestamp',()=>{
  assert.deepEqual(project(session()),{sessionId:'cs_test_1',status:'complete',paymentStatus:'paid',paymentIntentId:'pi_1',receivedMinor:'1000',settledAtSeconds:1800000060});
  const pending=session();Object.assign(pending,{status:'open',payment_status:'unpaid',payment_intent:null});assert.equal(project(pending).receivedMinor,null);
  const disabled=session();disabled.adaptive_pricing=null;assert.equal(project(disabled).receivedMinor,'1000');
  const missing=session();missing.payment_intent.latest_charge.balance_transaction=null;assert.throws(()=>project(missing),{code:'stripe-evidence-pending'});
});
test('every money, currency, identity, tax, capture, dispute and mode mismatch refuses automatic allocation',()=>{
  const mutations=[s=>s.amount_total++,s=>s.amount_subtotal--,s=>s.currency='usd',s=>s.id='cs_test_other',s=>s.livemode=true,s=>s.client_reference_id='other',s=>s.metadata={...metadata,center_id:'other'},s=>s.expires_at++,s=>s.automatic_tax.enabled=true,s=>s.adaptive_pricing.enabled=true,s=>s.total_details.amount_discount=1,s=>s.payment_method_types.push('sepa_debit'),s=>s.payment_intent.livemode=true,s=>s.payment_intent.amount_received=999,s=>s.payment_intent.metadata={...metadata,receipt_id:'other'},s=>s.payment_intent.capture_method='manual',s=>s.payment_intent.latest_charge.amount_captured=999,s=>s.payment_intent.latest_charge.disputed=true,s=>s.payment_intent.latest_charge.amount_refunded=1,s=>s.payment_intent.latest_charge.payment_intent='pi_other',s=>s.payment_intent.latest_charge.balance_transaction.currency='usd',s=>s.payment_intent.latest_charge.balance_transaction.amount=999,s=>s.payment_intent.latest_charge.balance_transaction.source='ch_other',s=>s.payment_intent.latest_charge.balance_transaction.created=1800000500,s=>s.payment_intent.latest_charge.balance_transaction.created=1];
  for(const mutate of mutations){const copy=structuredClone(session());mutate(copy);assert.throws(()=>project(copy),{code:'stripe-evidence-invalid'})}
  const regressed=session();regressed.payment_status='unpaid';assert.throws(()=>project(regressed),{code:'stripe-evidence-invalid'});
});
test('provider account binding and response byte limits fail without returning response bodies or credentials',async()=>{
  const profile={mode:'test',apiKey:'sk_test_fictional_key',accountId:'acct_expected'};
  const client=createStripeTestClient(profile,{fetchImpl:async()=>new Response(JSON.stringify({object:'account',id:'acct_other',email:'private@example.invalid'}))});
  await assert.rejects(client.verifyAccount(),error=>error.code==='stripe-account-mismatch'&&!error.message.includes('private'));
  const tooLarge=createStripeTestClient(profile,{fetchImpl:async()=>new Response('a'.repeat(65537))});await assert.rejects(tooLarge.verifyAccount(),{code:'stripe-unavailable'});
  const notFound=createStripeTestClient(profile,{fetchImpl:async()=>new Response('sensitive-provider-error',{status:401})});await assert.rejects(notFound.retrieve('cs_test_1'),error=>error.code==='stripe-unavailable'&&!error.message.includes('sensitive'));
});
