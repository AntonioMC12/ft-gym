import {CentersError} from '../errors.js';
const mismatch=()=>{throw new CentersError(409,'stripe-evidence-invalid','gateway evidence requires review')};
const identifier=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'[a-zA-Z0-9_]{1,240}$').test(value);
const metadataMatches=(value,attempt)=>value?.attempt_id===attempt.id&&value?.center_id===attempt.center_id&&value?.receipt_id===attempt.receipt_id;
// Pure allowlist projection. Expanded Stripe responses can contain private payer
// information; callers persist/return only this projection, never the raw object.
export function stripeSessionEvidence(session,attempt,{now=Math.floor(Date.now()/1000)}={}) {
  const amount=Number(attempt.amount_minor),expires=Number(attempt.expires_at_seconds);
  if(!session||session.object!=='checkout.session'||!identifier(session.id,'cs_test_')||attempt.session_id&&session.id!==attempt.session_id||session.livemode!==false||session.mode!=='payment'||session.client_reference_id!==attempt.id||!metadataMatches(session.metadata,attempt)||session.currency!=='eur'||session.amount_total!==amount||session.amount_subtotal!==amount||session.expires_at!==expires||!['open','complete','expired'].includes(session.status)||!['paid','unpaid'].includes(session.payment_status))mismatch();
  if(session.automatic_tax?.enabled!==false||session.adaptive_pricing?.enabled!==false||!Array.isArray(session.payment_method_types)||session.payment_method_types.length!==1||session.payment_method_types[0]!=='card'||!session.total_details||['amount_discount','amount_tax','amount_shipping'].some(key=>session.total_details[key]!==0))mismatch();
  const intent=session.payment_intent;
  if(intent!=null&&(typeof intent!=='object'||intent.object!=='payment_intent'||!identifier(intent.id,'pi_')||intent.livemode!==false||intent.currency!=='eur'||intent.amount!==amount||intent.capture_method!=='automatic'||!metadataMatches(intent.metadata,attempt)||attempt.payment_intent_id&&intent.id!==attempt.payment_intent_id))mismatch();
  if(session.payment_status!=='paid'){
    if(intent?.status==='succeeded'||intent?.amount_received>0)mismatch();
    return {sessionId:session.id,status:session.status,paymentStatus:'unpaid',paymentIntentId:intent?.id||null,receivedMinor:null,settledAtSeconds:null};
  }
  if(session.status!=='complete'||!intent||intent.status!=='succeeded'||intent.amount_received!==amount)mismatch();
  const charge=intent.latest_charge;
  if(!charge||typeof charge!=='object'||charge.object!=='charge'||!identifier(charge.id,'ch_')||charge.payment_intent!==intent.id||charge.livemode!==false||charge.currency!=='eur'||charge.amount!==amount||charge.amount_captured!==amount||charge.paid!==true||charge.captured!==true||charge.status!=='succeeded'||charge.disputed!==false||charge.refunded!==false||charge.amount_refunded!==0)mismatch();
  const transaction=charge.balance_transaction;
  if(transaction==null)throw new CentersError(503,'stripe-evidence-pending','gateway confirmation is not available yet');
  if(typeof transaction!=='object'||transaction.object!=='balance_transaction'||!identifier(transaction.id,'txn_')||transaction.source!==charge.id||transaction.type!=='charge'||transaction.currency!=='eur'||transaction.amount!==amount||!Number.isSafeInteger(transaction.created)||transaction.created<Math.max(0,Number(attempt.created_at_seconds||0)-300)||transaction.created>now+300)mismatch();
  return {sessionId:session.id,status:'complete',paymentStatus:'paid',paymentIntentId:intent.id,receivedMinor:String(amount),settledAtSeconds:transaction.created};
}
