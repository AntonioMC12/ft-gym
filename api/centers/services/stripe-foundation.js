import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {verifyStripeEvent,checkoutEventProjection,stripeBodyHash} from '../domain/stripe-webhook.js';
import {stripeProfileFor,STRIPE_API_VERSION} from '../stripe-config.js';
import {businessTransaction} from './context.js';
import {receiptBalance} from './payments.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
const SYSTEM='system_centers_stripe';
async function testDatabase(client) {
  const {rows}=await client.query('SELECT kind FROM centers.environment WHERE singleton');if(rows[0]?.kind!=='test')throw new CentersError(503,'stripe-unavailable','Stripe is available only in the isolated test environment');
}
export function prepareStripeAttempt({database,user,config,checkSession},raw,{platform=false,own=false}={}) {
  objectBody(raw,own?['centerId','receiptId','requestId','expectedBalanceMinor']:['centerId','memberId','receiptId','requestId','expectedBalanceMinor']);const centerId=idField(raw.centerId),suppliedMemberId=own?null:idField(raw.memberId),receiptId=idField(raw.receiptId),requestId=requestField(raw.requestId),profile=stripeProfileFor(config,centerId);
  const expected=raw.expectedBalanceMinor??null;if(expected!==null&&(typeof expected!=='string'||!/^\d{1,15}$/.test(expected)))throw new CentersError(400,'invalid-input','invalid balance assertion');
  if(!config.enabled||!profile)throw new CentersError(503,'stripe-unavailable','test gateway is not configured');
  const operation=own?'stripe.own.prepare':'stripe.checkout.prepare',hash=commandHash({memberId:suppliedMemberId,receiptId,expected});
  return businessTransaction(database,user.id,centerId,own?'payments.own.create':'payments.record',async client=>{
    const memberId=own?(await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,user.id])).rows[0]?.id:suppliedMemberId;
    if(!memberId)throw new CentersError(404,'not-found','not found');
    await testDatabase(client);const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const balance=await receiptBalance(client,centerId,memberId,receiptId),amount=BigInt(balance.balanceMinor);
    if(expected!==null&&BigInt(expected)!==amount)throw new CentersError(409,'stripe-balance-changed','reload the receipt before preparing checkout');
    if(amount<50n||amount>BigInt(profile.maxAmountMinor))throw new CentersError(409,'stripe-limit','test gateway amount limit exceeded');
    const {rows:active}=await client.query("SELECT id FROM centers.stripe_attempts WHERE center_id=$1 AND receipt_id=$2 AND state IN ('creating','open','review')",[centerId,receiptId]);if(active.length)throw new CentersError(409,'checkout-pending','receipt has an active checkout');
    const {rows:rate}=await client.query("SELECT count(*)::integer AS count FROM centers.stripe_attempts WHERE center_id=$1 AND actor_uid=$2 AND created_at>now()-interval '15 minutes'",[centerId,user.id]);
    if(rate[0].count>=10)throw new CentersError(429,'stripe-rate-limited','wait before preparing another checkout');
    const {rows:totals}=await client.query("SELECT coalesce(sum(amount_minor),0)::text AS total FROM centers.stripe_attempts WHERE center_id=$1 AND state IN ('creating','open','paid','review') AND created_at>=date_trunc('day',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",[centerId]);
    if(BigInt(totals[0].total)+amount>BigInt(profile.dailyLimitMinor))throw new CentersError(409,'stripe-limit','test gateway daily center limit exceeded');
    const id='sa_'+commandHash([centerId,user.id,operation,requestId]).slice(0,32),reserved='pgw_'+commandHash([id,'payment']).slice(0,32);checkSession();
    await client.query("INSERT INTO centers.stripe_attempts(id,center_id,member_id,receipt_id,profile_id,actor_uid,amount_minor,currency,reserved_payment_id,expires_at,provider_account_id,return_origin,api_version,audience) VALUES($1,$2,$3,$4,$5,$6,$7,'EUR',$8,date_trunc('second',now())+interval '1 hour',$9,$10,$11,$12)",[id,centerId,memberId,receiptId,profile.id,user.id,amount.toString(),reserved,profile.accountId,profile.returnOrigin,STRIPE_API_VERSION,own?'own':'staff']);
    await businessAudit(client,centerId,user.id,'stripe.attempt.prepared',id,{receiptId,mode:'test'});const result={attemptId:id};await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform});
}
export async function receiveStripeWebhook({database,config},profileId,raw,header) {
  const profile=config.enabled&&config.stripeProfiles?.find(value=>value.id===profileId);if(!profile)throw new CentersError(404,'not-found','not found');
  const event=verifyStripeEvent(raw,header,profile.webhookSecrets),projection=checkoutEventProjection(event,profile);if(!projection)return {received:true,ignored:true};
  return database.platformTransaction(SYSTEM,async client=>{
    await testDatabase(client);await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[projection.centerId]);
    const {rows:attempts}=await client.query('SELECT * FROM centers.stripe_attempts WHERE center_id=$1 AND id=$2 AND profile_id=$3',[projection.centerId,projection.attemptId,profile.id]);
    if(!attempts.length)return {received:true,ignored:true};const attempt=attempts[0];
    const hash=stripeBodyHash(raw),{rows:previous}=await client.query('SELECT body_hash,projection FROM centers.stripe_inbox WHERE profile_id=$1 AND event_id=$2',[profile.id,event.id]);
    const canonical=value=>commandHash(Object.keys(value).sort().map(key=>[key,value[key]]));
    if(previous.length){if(previous[0].body_hash!==hash&&canonical(previous[0].projection)!==canonical(projection))throw new CentersError(409,'stripe-event-conflict','gateway event conflicts with its recorded projection');return {received:true,duplicate:true}}
    const mismatch=attempt.receipt_id!==projection.receiptId||attempt.amount_minor!==projection.amountMinor||attempt.currency!==projection.currency||attempt.session_id&&attempt.session_id!==projection.sessionId;
    await client.query(`INSERT INTO centers.stripe_inbox(profile_id,event_id,center_id,attempt_id,body_hash,event_type,projection,state,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[profile.id,event.id,projection.centerId,attempt.id,hash,event.type,JSON.stringify(projection),mismatch?'review':'pending',mismatch?'gateway-mismatch':null]);
    await businessAudit(client,projection.centerId,SYSTEM,'stripe.event.received',event.id,{attemptId:attempt.id,review:!!mismatch});return {received:true};
  },projection.centerId);
}
