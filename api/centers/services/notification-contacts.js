import {randomBytes} from 'node:crypto';
import {notificationMode} from '../notification-config.js';
import {CentersError} from '../errors.js';
import {objectBody,idField,requestField,versionField} from '../domain/validation.js';
import {notificationAddress,notificationDigest,notificationPolicy} from '../domain/notifications.js';
import {businessTransaction} from './context.js';
import {businessAudit,commandHash,commandReplay,rememberCommand} from './commands.js';

const contactDto=row=>row?{email:row.email,enabled:row.enabled,verified:!!row.verified_at,version:row.version}:{email:null,enabled:false,verified:false,version:0};
async function availableTransport(client,config,centerId) {
  const mode=notificationMode(config||{},centerId);if(mode==='off')return mode;
  const {rows}=await client.query('SELECT kind FROM centers.environment WHERE singleton');
  return rows[0]?.kind===(mode==='test-capture'?'test':'production')?mode:'off';
}
export function notificationStatus(database,uid,centerId,{platform=false,config={}}={}) {
  return businessTransaction(database,uid,centerId,'billing.read',async client=>{
    const {rows}=await client.query('SELECT enabled,receipts,due_lead_days,debt_repeat_days,price_notice_days,version FROM centers.notification_policies WHERE center_id=$1',[centerId]);
    const {rows:counts}=await client.query('SELECT state,count(*)::text AS count FROM centers.notification_deliveries WHERE center_id=$1 GROUP BY state',[centerId]);
    return {policy:rows[0]?{enabled:rows[0].enabled,receipts:rows[0].receipts,dueLeadDays:rows[0].due_lead_days,debtRepeatDays:rows[0].debt_repeat_days,priceNoticeDays:rows[0].price_notice_days,version:rows[0].version}:null,counts:Object.fromEntries(counts.map(row=>[row.state,row.count])),transport:await availableTransport(client,config,centerId)};
  },{platform,allowInactive:true});
}
export function retryBlockedNotifications({database,user,checkSession},raw) {
  objectBody(raw,['centerId','requestId']);const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),operation='notification.retry',hash=commandHash({centerId});
  return businessTransaction(database,user.id,centerId,'billing.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const {rowCount}=await client.query(`UPDATE centers.notification_deliveries SET state='pending',attempts=0,error_code=NULL,finished_at=NULL,next_attempt_at=now()
      WHERE center_id=$1 AND id IN(SELECT id FROM centers.notification_deliveries WHERE center_id=$1 AND state='blocked' ORDER BY created_at,id LIMIT 25 FOR UPDATE)`,[centerId]);
    const result={retried:rowCount};await businessAudit(client,centerId,user.id,operation,centerId,result);await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform:true});
}
async function ownRecord(client,uid,centerId) {
  const {rows}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');return rows[0].id;
}
export function ownNotificationContact(database,uid,centerId,{config={}}={}) {
  return businessTransaction(database,uid,centerId,'membership.own.read',async client=>{
    const memberId=await ownRecord(client,uid,centerId),{rows}=await client.query('SELECT email,enabled,verified_at,version FROM centers.notification_contacts WHERE center_id=$1 AND account_uid=$2 AND member_id=$3',[centerId,uid,memberId]);
    return {contact:contactDto(rows[0]),transport:await availableTransport(client,config,centerId)};
  },{allowInactive:true});
}
export function configureNotificationPolicy({database,user,checkSession,config},raw) {
  objectBody(raw,['centerId','enabled','receipts','dueLeadDays','debtRepeatDays','priceNoticeDays','version','requestId']);
  const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),policy=notificationPolicy(raw),version=raw.version;
  if(policy.enabled&&notificationMode(config||{},centerId)==='off')throw new CentersError(503,'notification-not-configured','notification transport is not configured');
  if(!Number.isSafeInteger(version)||version<0)throw new CentersError(400,'invalid-input','notification version required');
  const operation='notification.policy',hash=commandHash({...policy,version});
  return businessTransaction(database,user.id,centerId,'billing.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    if(policy.enabled&&await availableTransport(client,config,centerId)==='off')throw new CentersError(503,'notification-not-configured','notification transport is not configured for this environment');
    const {rows}=await client.query('SELECT version FROM centers.notification_policies WHERE center_id=$1',[centerId]);
    if((rows[0]?.version||0)!==version)throw new CentersError(409,'version-conflict','notification policy changed');
    await client.query(`INSERT INTO centers.notification_policies(center_id,enabled,receipts,due_lead_days,debt_repeat_days,price_notice_days,actor_uid) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(center_id) DO UPDATE SET enabled=EXCLUDED.enabled,receipts=EXCLUDED.receipts,due_lead_days=EXCLUDED.due_lead_days,debt_repeat_days=EXCLUDED.debt_repeat_days,price_notice_days=EXCLUDED.price_notice_days,
      enabled_since=CASE WHEN NOT centers.notification_policies.enabled AND EXCLUDED.enabled THEN now() ELSE centers.notification_policies.enabled_since END,
      version=centers.notification_policies.version+1,actor_uid=EXCLUDED.actor_uid,updated_at=now()`,[centerId,policy.enabled,policy.receipts,policy.dueLeadDays,policy.debtRepeatDays,policy.priceNoticeDays,user.id]);
    await businessAudit(client,centerId,user.id,operation,centerId,policy);const response={policy:{...policy,version:version+1}};await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);checkSession();return response;
  },{platform:true});
}
export function requestNotificationContact({database,user,checkSession,config},raw) {
  objectBody(raw,['centerId','email','requestId']);const centerId=idField(raw.centerId),email=notificationAddress(raw.email),requestId=requestField(raw.requestId),operation='notification.own.request',hash=commandHash({email});
  return businessTransaction(database,user.id,centerId,'membership.own.read',async client=>{
    const memberId=await ownRecord(client,user.id,centerId),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    if(await availableTransport(client,config,centerId)==='off')throw new CentersError(503,'notification-not-configured','notification transport is not configured for this environment');
    const {rows:policies}=await client.query('SELECT enabled FROM centers.notification_policies WHERE center_id=$1',[centerId]);
    if(!policies[0]?.enabled)throw new CentersError(503,'notification-not-configured','center notices are disabled');
    const {rows:previous}=await client.query('SELECT request_count,request_window_at>now()-interval \'15 minutes\' AS recent FROM centers.notification_contacts WHERE center_id=$1 AND account_uid=$2 AND member_id=$3',[centerId,user.id,memberId]);
    if(previous[0]?.recent&&previous[0].request_count>=3)throw new CentersError(429,'notification-rate-limited','wait before requesting another code');
    const token=randomBytes(32).toString('hex');
    const {rows}=await client.query(`INSERT INTO centers.notification_contacts(center_id,account_uid,member_id,email,challenge_hash,challenge_expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')
      ON CONFLICT(center_id,account_uid,member_id) DO UPDATE SET email=EXCLUDED.email,enabled=false,verified_at=NULL,challenge_hash=EXCLUDED.challenge_hash,challenge_expires_at=EXCLUDED.challenge_expires_at,
      request_count=CASE WHEN centers.notification_contacts.request_window_at>now()-interval '15 minutes' THEN centers.notification_contacts.request_count+1 ELSE 1 END,
      request_window_at=CASE WHEN centers.notification_contacts.request_window_at>now()-interval '15 minutes' THEN centers.notification_contacts.request_window_at ELSE now() END,
      version=centers.notification_contacts.version+1,updated_at=now() RETURNING version`,[centerId,user.id,memberId,email,notificationDigest(token)]);
    const id='nd_'+commandHash([centerId,user.id,'verify',rows[0].version]).slice(0,32);
    await client.query(`INSERT INTO centers.notification_deliveries(id,center_id,member_id,account_uid,contact_version,kind,event_key,payload) VALUES($1,$2,$3,$4,$5,'verify',$1,$6)`,[id,centerId,memberId,user.id,rows[0].version,JSON.stringify({token})]);
    const response={queued:true};await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);await businessAudit(client,centerId,user.id,operation,memberId);checkSession();return response;
  });
}
export function verifyNotificationContact({database,user,checkSession},raw) {
  objectBody(raw,['centerId','token','requestId']);const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),operation='notification.own.verify';
  if(typeof raw.token!=='string'||!/^[a-f0-9]{64}$/.test(raw.token))throw new CentersError(400,'invalid-input','invalid verification code');
  const digest=notificationDigest(raw.token),hash=commandHash({digest});
  return businessTransaction(database,user.id,centerId,'membership.own.read',async client=>{
    const memberId=await ownRecord(client,user.id,centerId),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const {rows}=await client.query(`UPDATE centers.notification_contacts SET enabled=true,verified_at=now(),challenge_hash=NULL,challenge_expires_at=NULL,version=version+1,updated_at=now()
      WHERE center_id=$1 AND account_uid=$2 AND member_id=$3 AND challenge_hash=$4 AND challenge_expires_at>now() RETURNING email,enabled,verified_at,version`,[centerId,user.id,memberId,digest]);
    if(!rows.length)throw new CentersError(409,'notification-code-invalid','verification code expired or invalid');
    const response={contact:contactDto(rows[0])};await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);await businessAudit(client,centerId,user.id,operation,memberId);checkSession();return response;
  });
}
export function disableNotificationContact({database,user,checkSession},raw) {
  objectBody(raw,['centerId','version','requestId']);const centerId=idField(raw.centerId),version=versionField(raw.version),requestId=requestField(raw.requestId),operation='notification.own.disable',hash=commandHash({version});
  return businessTransaction(database,user.id,centerId,'membership.own.read',async client=>{
    const memberId=await ownRecord(client,user.id,centerId),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const {rows}=await client.query('UPDATE centers.notification_contacts SET enabled=false,challenge_hash=NULL,challenge_expires_at=NULL,version=version+1,updated_at=now() WHERE center_id=$1 AND account_uid=$2 AND member_id=$3 AND version=$4 RETURNING email,enabled,verified_at,version',[centerId,user.id,memberId,version]);
    if(!rows.length)throw new CentersError(409,'version-conflict','contact changed');
    const response={contact:contactDto(rows[0])};await rememberCommand(client,centerId,user.id,operation,requestId,hash,response);await businessAudit(client,centerId,user.id,operation,memberId);checkSession();return response;
  },{allowInactive:true});
}
