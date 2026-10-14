import {randomBytes} from 'node:crypto';
import {notificationAddress,notificationDigest,notificationMessage,notificationHtml,notificationRetry} from '../domain/notifications.js';
import {commandHash} from './commands.js';
import {scheduleReminders,noticeDisposition} from './notification-schedule.js';

const SYSTEM='system_centers_notifications';
const lock=(client,id)=>client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[id]);
async function currentContact(client,delivery) {
  const {rows}=await client.query(`SELECT n.*,n.challenge_expires_at>now() AS unexpired,m.account_uid AS member_uid,c.name AS center_name,c.state AS center_state
    FROM centers.notification_contacts n JOIN centers.members m ON (m.center_id,m.id)=(n.center_id,n.member_id)
    JOIN centers.centers c ON c.id=n.center_id WHERE n.center_id=$1 AND n.member_id=$2 AND n.account_uid=$3`,[delivery.center_id,delivery.member_id,delivery.account_uid]);
  const row=rows[0];
  if(!row||row.member_uid!==delivery.account_uid||row.version!==delivery.contact_version||row.center_state!=='active')return null;
  if(delivery.kind==='verify')return !row.verified_at&&row.unexpired&&row.challenge_hash===notificationDigest(delivery.payload.token||'')?row:null;
  return row.enabled&&row.verified_at?row:null;
}
export function createNotificationCapture(database) {
  return {kind:'test-capture',idempotent:true,async send(delivery){
    const recipient=notificationAddress(delivery.recipient);if(!recipient.endsWith('.invalid'))throw Object.assign(new Error('test recipient required'),{permanent:true});
    return database.platformTransaction(SYSTEM,async client=>{
      await lock(client,delivery.centerId);
      const {rows}=await client.query('SELECT * FROM centers.notification_deliveries WHERE center_id=$1 AND id=$2 AND claim_token=$3',[delivery.centerId,delivery.key,delivery.claimToken]);
      if(!rows.length||!await currentContact(client,rows[0])||await noticeDisposition(client,rows[0])!=='send')throw Object.assign(new Error('notice no longer authorized'),{permanent:true,skip:true});
      // SQL trigger additionally requires centers.environment.kind=test. No fetch,
      // SMTP connection or local fallback can accidentally transmit an email.
      await client.query('INSERT INTO centers.notification_test_sink(delivery_id,center_id,recipient,message) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[delivery.key,delivery.centerId,recipient,JSON.stringify(delivery.message)]);
      return {accepted:true};
    },delivery.centerId);
  }};
}
async function scheduleReceipts(database,centerId) {
  return database.platformTransaction(SYSTEM,async client=>{
    await lock(client,centerId);
    const {rows}=await client.query(`SELECT o.id AS event_id,r.id AS receipt_id,r.member_id,n.account_uid,n.version
      FROM centers.outbox o JOIN centers.receipts r ON (r.center_id,r.id)=(o.center_id,o.receipt_id)
      JOIN centers.members m ON (m.center_id,m.id)=(r.center_id,r.member_id)
      JOIN centers.notification_contacts n ON n.center_id=r.center_id AND n.member_id=r.member_id AND n.account_uid=m.account_uid
      JOIN centers.notification_policies p ON p.center_id=r.center_id JOIN centers.centers c ON c.id=r.center_id
      WHERE o.center_id=$1 AND o.kind='receipt.created' AND o.state='pending' AND c.state='active' AND p.enabled AND p.receipts AND n.enabled AND n.verified_at IS NOT NULL
      AND o.created_at>=n.verified_at AND o.created_at>=p.enabled_since
      AND NOT EXISTS(SELECT 1 FROM centers.notification_deliveries d WHERE d.center_id=o.center_id AND d.kind='receipt' AND d.event_key=o.id)
      ORDER BY o.created_at,o.id LIMIT 25`,[centerId]);
    for(const row of rows)await client.query(`INSERT INTO centers.notification_deliveries(id,center_id,member_id,account_uid,contact_version,kind,event_key,receipt_id)
      VALUES($1,$2,$3,$4,$5,'receipt',$6,$7) ON CONFLICT DO NOTHING`,['nd_'+commandHash([centerId,'receipt',row.event_id]).slice(0,32),centerId,row.member_id,row.account_uid,row.version,row.event_id,row.receipt_id]);
    await scheduleReminders(client,centerId);
    await client.query('UPDATE centers.notification_policies SET scanned_at=now() WHERE center_id=$1',[centerId]);
  },centerId);
}
async function claimNext(database,centerId,idempotent) {
  return database.platformTransaction(SYSTEM,async client=>{
    await lock(client,centerId);
    const {rows:policies}=await client.query("SELECT p.center_id,p.receipts FROM centers.notification_policies p JOIN centers.centers c ON c.id=p.center_id WHERE p.center_id=$1 AND p.enabled AND c.state='active'",[centerId]);if(!policies.length)return null;
    const {rows}=await client.query(`SELECT * FROM centers.notification_deliveries WHERE center_id=$1 AND ((state='pending' AND next_attempt_at<=now()) OR (state='sending' AND lease_until<=now()))
      ORDER BY CASE WHEN kind='verify' THEN 0 ELSE 1 END,next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[centerId]);
    if(!rows.length)return null;const delivery=rows[0];
    const finish=async(state,code)=>{await client.query('UPDATE centers.notification_deliveries SET state=$2,error_code=$3,claim_token=NULL,lease_until=NULL,finished_at=now() WHERE id=$1',[delivery.id,state,code]);return {skipped:true}};
    if(delivery.kind==='receipt'&&!policies[0].receipts)return finish('skipped','policy-no-longer-authorized');
    if(delivery.state==='sending'&&!idempotent)return finish('uncertain','delivery-outcome-unknown');
    const contact=await currentContact(client,delivery);if(!contact)return finish('skipped','contact-no-longer-authorized');
    const disposition=await noticeDisposition(client,delivery);
    if(disposition!=='send')return finish(disposition==='blocked'?'blocked':'skipped',disposition==='blocked'?'price-notice-window-missed':'notice-no-longer-needed');
    const claim=randomBytes(16).toString('hex'),message=notificationMessage(delivery.kind,{centerName:contact.center_name,token:delivery.payload.token});message.html=notificationHtml(message.text);
    await client.query("UPDATE centers.notification_deliveries SET state='sending',claim_token=$2,lease_until=now()+interval '90 seconds',attempts=attempts+1,error_code=NULL,finished_at=NULL WHERE id=$1",[delivery.id,claim]);
    return {key:delivery.id,centerId,claimToken:claim,recipient:contact.email,message,attempts:delivery.attempts+1};
  },centerId);
}
async function acknowledge(database,claim,{state,errorCode=null,delay=0}={state:'sent'}) {
  return database.platformTransaction(SYSTEM,async client=>{
    await lock(client,claim.centerId);
    const {rows}=await client.query(`UPDATE centers.notification_deliveries SET state=$4,error_code=$5,claim_token=NULL,lease_until=NULL,
      next_attempt_at=now()+$6::integer*interval '1 second',finished_at=CASE WHEN $4='pending' THEN NULL ELSE now() END,
      payload=CASE WHEN $4='sent' AND kind='verify' THEN '{}'::jsonb ELSE payload END
      WHERE center_id=$1 AND id=$2 AND claim_token=$3 RETURNING kind,event_key`,[claim.centerId,claim.key,claim.claimToken,state,errorCode,delay]);
    if(state==='sent'&&rows[0]?.kind==='receipt')await client.query("UPDATE centers.outbox SET state='sent' WHERE center_id=$1 AND id=$2",[claim.centerId,rows[0].event_key]);
  },claim.centerId);
}
export async function notificationTick(database,{transport=null}={}) {
  if(!transport)return {processed:0};
  if(!['test-capture','cloudflare'].includes(transport.kind)||typeof transport.send!=='function'||typeof transport.idempotent!=='boolean'||transport.kind==='cloudflare'&&(!Array.isArray(transport.centerIds)||transport.centerIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(id))))throw new Error('explicit supported notification transport required');
  // A test capture is never enabled just because there are pending production rows.
  const centers=await database.platformTransaction(SYSTEM,async client=>{
    const {rows:environment}=await client.query('SELECT kind FROM centers.environment WHERE singleton');
    if(transport.kind==='test-capture'&&environment[0]?.kind!=='test')throw new Error('isolated notification test database required');
    if(transport.kind==='cloudflare'&&environment[0]?.kind!=='production')throw new Error('external email requires an explicitly configured production database');
    return (await client.query('SELECT center_id FROM centers.notification_policies WHERE enabled AND ($1::text[] IS NULL OR center_id=ANY($1::text[])) ORDER BY scanned_at NULLS FIRST,center_id LIMIT 4',[transport.kind==='cloudflare'?transport.centerIds:null])).rows;
  });
  let processed=0;
  for(const {center_id:id} of centers){
    await scheduleReceipts(database,id);
    for(let count=0;count<10;count++){
      const claim=await claimNext(database,id,transport.idempotent);if(!claim)break;processed++;if(claim.skipped)continue;
      let outcome;
      try{const result=await transport.send(claim);outcome=result?.accepted===true?{state:'sent'}:{state:'uncertain',errorCode:'delivery-outcome-unknown'}}catch(error){
        const delay=claim.attempts>=8?null:notificationRetry(claim.attempts);
        outcome=error.skip?{state:'skipped',errorCode:'notice-no-longer-needed'}:!transport.idempotent&&!error.permanent&&!error.retryable?{state:'uncertain',errorCode:'delivery-outcome-unknown'}:error.permanent||delay===null?{state:'blocked',errorCode:'delivery-rejected'}:{state:'pending',errorCode:'temporary-delivery-failure',delay};
      }
      // A failed acknowledgement leaves the durable sending lease. An idempotent
      // transport safely reuses the same key after expiry; no payment TX is involved.
      await acknowledge(database,claim,outcome);await new Promise(resolve=>setImmediate(resolve));
    }
  }
  return {processed};
}
