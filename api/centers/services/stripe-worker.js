import {randomBytes} from 'node:crypto';
import {CentersError} from '../errors.js';
import {STRIPE_API_VERSION,stripeProfileFor} from '../stripe-config.js';
import {stripeSessionEvidence} from '../domain/stripe-session.js';
import {createStripeTestClient,safeStripeCheckoutUrl} from './stripe-client.js';
import {appendPayment,receiptBalance} from './payments.js';
import {businessAudit} from './commands.js';

const SYSTEM='system_centers_stripe';
const lock=(client,id)=>client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:'||$1))",[id]);
const unavailable=()=>new CentersError(503,'stripe-unavailable','test gateway is unavailable');
async function testDatabase(client){if((await client.query('SELECT kind FROM centers.environment WHERE singleton')).rows[0]?.kind!=='test')throw unavailable()}

export function claimStripeAttempt(database,config,centerId,{attemptId=null}={}) {
  const profile=config.enabled&&stripeProfileFor(config,centerId);if(!profile)return null;
  return database.platformTransaction(SYSTEM,async client=>{
    await testDatabase(client);await lock(client,centerId);
    await client.query('INSERT INTO centers.stripe_scans(center_id) VALUES($1) ON CONFLICT(center_id) DO UPDATE SET scanned_at=now()',[centerId]);
    const {rows}=await client.query(`SELECT a.*,extract(epoch FROM a.expires_at)::bigint::text AS expires_at_seconds,
      extract(epoch FROM a.created_at)::text AS created_at_seconds FROM centers.stripe_attempts a
      WHERE a.center_id=$1 AND a.profile_id=$2 AND ($3::text IS NULL OR a.id=$3) AND (a.lease_until IS NULL OR a.lease_until<=now())
      AND (EXISTS(SELECT 1 FROM centers.stripe_reconcile_requests r WHERE r.center_id=a.center_id AND r.attempt_id=a.id)
        OR ((a.state IN ('creating','open') OR a.reconcile_requested) AND a.sync_next_at<=now()) OR EXISTS(SELECT 1 FROM centers.stripe_inbox i
        WHERE i.center_id=a.center_id AND i.attempt_id=a.id AND ((i.state='pending' AND i.next_attempt_at<=now()) OR (i.state='processing' AND i.lease_until<=now()))))
      ORDER BY a.sync_next_at,a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED`,[centerId,profile.id,attemptId]);
    if(!rows.length)return null;const attempt=rows[0],token=randomBytes(16).toString('hex');
    const {rowCount:requested}=await client.query('DELETE FROM centers.stripe_reconcile_requests WHERE center_id=$1 AND attempt_id=$2',[centerId,attempt.id]);
    await client.query("UPDATE centers.stripe_attempts SET claim_token=$3,lease_until=now()+interval '90 seconds',reconcile_requested=true,sync_attempts=CASE WHEN $4 THEN 1 ELSE sync_attempts+1 END WHERE center_id=$1 AND id=$2",[centerId,attempt.id,token,!!requested]);
    const {rows:events}=await client.query(`UPDATE centers.stripe_inbox SET state='processing',claim_token=$3,lease_until=now()+interval '90 seconds',attempts=attempts+1
      WHERE center_id=$1 AND attempt_id=$2 AND ((state='pending' AND next_attempt_at<=now()) OR (state='processing' AND lease_until<=now())) RETURNING projection`,[centerId,attempt.id,token]);
    return {...attempt,claim_token:token,sync_attempts:requested?1:attempt.sync_attempts+1,eventProjections:events.map(row=>row.projection)};
  },centerId);
}

// Only this service crosses the provider boundary, after committing a fenced
// claim. No transaction/center lock is held while the network request runs.
export async function runClaimedStripeAttempt(database,config,claim,{clientFactory=createStripeTestClient}={}) {
  if(!claim)return {processed:false};let evidence=null,url=null,error=null;
  try{
    if(claim.state!=='paid'){
      const profile=stripeProfileFor(config,claim.center_id);
      if(!config.enabled||!profile||profile.id!==claim.profile_id||profile.accountId!==claim.provider_account_id||profile.returnOrigin!==claim.return_origin||claim.api_version!==STRIPE_API_VERSION)throw new CentersError(409,'stripe-profile-changed','gateway profile requires review');
      const gateway=clientFactory(profile);await gateway.verifyAccount();
      const hints=[...new Set(claim.eventProjections.map(event=>event.sessionId))];
      if(hints.length>1||claim.session_id&&hints.some(id=>id!==claim.session_id))throw new CentersError(409,'stripe-session-conflict','gateway identity requires review');
      let sessionId=claim.session_id||hints[0];
      if(!sessionId){
        // Stripe may prune idempotency keys after 24h. Never recreate an unknown
        // session beyond the bounded recovery window, even on an explicit retry.
        if(Date.now()/1000-Number(claim.created_at_seconds)>23*3600)throw new CentersError(409,'stripe-creation-uncertain','gateway creation requires review');
        const created=await gateway.create(claim);sessionId=created.id;url=created.url;
      }
      const session=await gateway.retrieve(sessionId);
      evidence=stripeSessionEvidence(session,{...claim,session_id:sessionId});
      if(evidence.status==='open'){
        url=safeStripeCheckoutUrl(session.url);
        if(!new URL(url).pathname.endsWith('/'+sessionId))throw new CentersError(409,'stripe-evidence-invalid','gateway URL requires review');
      }else url=null;
    }
  }catch(caught){error=caught instanceof CentersError?caught:unavailable()}
  return finishStripeClaim(database,claim,{evidence,url,error});
}

async function finishStripeClaim(database,claim,{evidence,url,error}) {
  return database.platformTransaction(SYSTEM,async client=>{
    await testDatabase(client);await lock(client,claim.center_id);
    const {rows}=await client.query('SELECT * FROM centers.stripe_attempts WHERE center_id=$1 AND id=$2 AND claim_token=$3 AND lease_until>now() FOR UPDATE',[claim.center_id,claim.id,claim.claim_token]);
    if(!rows.length)return {processed:false,stale:true};const current=rows[0];
    let state=current.state,code=error?.code||null,retry=error?.status===503&&claim.sync_attempts<8,bindingConflict=false;
    if(evidence&&state!=='paid'){
      await client.query('SAVEPOINT stripe_identity');
      try{await client.query('UPDATE centers.stripe_attempts SET session_id=coalesce(session_id,$3),payment_intent_id=coalesce(payment_intent_id,$4) WHERE center_id=$1 AND id=$2',[current.center_id,current.id,evidence.sessionId,evidence.paymentIntentId])}
      catch(caught){await client.query('ROLLBACK TO SAVEPOINT stripe_identity');if(caught.code!=='23505')throw caught;bindingConflict=true;error=new CentersError(409,'stripe-identity-conflict','gateway identity requires review');code=error.code;retry=false}
    }
    if(error){if(state!=='paid'&&!retry)state='review'}
    else if(state!=='paid'&&evidence){
      if(evidence.paymentStatus==='paid'){
        const {rows:other}=await client.query("SELECT id FROM centers.stripe_attempts WHERE center_id=$1 AND receipt_id=$2 AND id<>$3 AND state IN ('creating','open','review') LIMIT 1",[claim.center_id,current.receipt_id,current.id]);
        const balance=await receiptBalance(client,current.center_id,current.member_id,current.receipt_id);
        if(other.length||balance.balanceMinor!==current.amount_minor){state='review';code=other.length?'stripe-reservation-conflict':'stripe-balance-changed'}
        else {
          // Expired attempts can receive a late success. Move them to review
          // while holding the center lock so the shared ledger sees a reservation.
          await client.query('SAVEPOINT stripe_ledger');
          try{
            if(!['creating','open','review'].includes(state))await client.query("UPDATE centers.stripe_attempts SET state='review' WHERE center_id=$1 AND id=$2",[current.center_id,current.id]);
            const {rows:clock}=await client.query("SELECT (to_timestamp($2) AT TIME ZONE timezone)::date::text AS paid_on FROM centers.centers WHERE id=$1",[current.center_id,evidence.settledAtSeconds]);
            await appendPayment(client,{id:current.reserved_payment_id,centerId:current.center_id,memberId:current.member_id,uid:SYSTEM,amountMinor:current.amount_minor,currency:current.currency,paidOn:clock[0].paid_on,method:'card',reference:'Stripe test '+current.id,allocations:[{receiptId:current.receipt_id,amountMinor:current.amount_minor}]},{reservedAttemptId:current.id});
            state='paid';
          }catch(caught){await client.query('ROLLBACK TO SAVEPOINT stripe_ledger');if(!(caught instanceof CentersError)&&!['23505','23514'].includes(caught.code))throw caught;state='review';code='stripe-ledger-conflict'}
        }
      }else if(evidence.status==='expired'&&current.received_minor==null)state='expired';
      else if(current.received_minor!=null){state='review';code='stripe-evidence-regressed'}
      else if(evidence.status==='complete'){state='review';code='stripe-payment-unconfirmed'}
      else if(!['expired','failed','review'].includes(state))state='open';
    }
    // Keep a valid captured-money projection even when it cannot be allocated.
    // Do not bind a conflicting PaymentIntent to the unique identity column.
    const intent=!bindingConflict?evidence?.paymentIntentId||null:null;
    await client.query(`UPDATE centers.stripe_attempts SET state=$3,session_id=coalesce(session_id,$4),checkout_url=$5,
      payment_id=CASE WHEN $3='paid' THEN reserved_payment_id ELSE payment_id END,payment_intent_id=coalesce(payment_intent_id,$6),
      received_minor=coalesce(received_minor,$7::bigint),settled_at=coalesce(settled_at,to_timestamp($8)),evidence=coalesce($9::jsonb,evidence),error_code=$10,
      claim_token=NULL,lease_until=NULL,sync_attempts=CASE WHEN $11 THEN sync_attempts ELSE 0 END,
      reconcile_requested=$11,sync_next_at=now()+CASE WHEN $11 THEN interval '5 minutes' ELSE interval '1 minute' END,updated_at=now()
      WHERE center_id=$1 AND id=$2`,[current.center_id,current.id,state,!bindingConflict?evidence?.sessionId||null:null,state==='open'&&!error?url:null,intent,evidence?.receivedMinor||null,evidence?.settledAtSeconds??null,evidence?JSON.stringify(evidence):null,code,retry]);
    const inboxState=retry?'pending':error||state==='review'?'review':'done';
    await client.query("UPDATE centers.stripe_inbox SET state=$4,claim_token=NULL,lease_until=NULL,error_code=$5,next_attempt_at=now()+interval '5 minutes' WHERE center_id=$1 AND attempt_id=$2 AND claim_token=$3",[current.center_id,current.id,claim.claim_token,inboxState,code]);
    if(state!==current.state||code!==current.error_code)await businessAudit(client,current.center_id,SYSTEM,'stripe.attempt.reconciled',current.id,{state,code});
    return {processed:true,state,retry};
  },claim.center_id);
}

export async function stripeTick(database,config,options={}) {
  const ids=config.enabled?config.stripeProfiles?.flatMap(profile=>profile.centerIds)||[]:[];if(!ids.length)return {centers:0,processed:0};
  const centers=await database.platformTransaction(SYSTEM,async client=>{await testDatabase(client);return (await client.query(`SELECT c.id FROM centers.centers c LEFT JOIN centers.stripe_scans s ON s.center_id=c.id WHERE c.id=ANY($1::text[]) ORDER BY s.scanned_at NULLS FIRST,c.id LIMIT 4`,[ids])).rows});
  let processed=0;
  for(const {id} of centers)for(let index=0;index<4;index++){const claim=await claimStripeAttempt(database,config,id);if(!claim)break;await runClaimedStripeAttempt(database,config,claim,options);processed++}
  return {centers:centers.length,processed};
}
