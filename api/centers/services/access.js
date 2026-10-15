import {createHash,timingSafeEqual} from 'node:crypto';
import {CentersError} from '../errors.js';
import {businessTransaction} from './context.js';
import {objectBody,idField,versionField,requestField,textField} from '../domain/validation.js';
import {DEFAULT_ACCESS_POLICY,accessPolicy,accessToken,deviceCredential} from '../domain/access.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {memberRecord} from './member-records.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const matches=(value,hash)=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)&&timingSafeEqual(Buffer.from(digest(value),'hex'),Buffer.from(hash,'hex'));
const missing=()=>{throw new CentersError(404,'not-found','not found')};
const conflict=code=>{throw new CentersError(409,code,'access changed; reload')};
function privateCredential(mint,kind,id,version){
  if(typeof mint!=='function')throw new CentersError(503,'access-credentials-unavailable','access credentials are unavailable');
  const value=mint(kind,id,version),valid=kind==='device'?deviceCredential(value):accessToken(value);
  if(!valid)throw new CentersError(503,'access-credentials-unavailable','access credentials are unavailable');return value;
}
const deviceDto=row=>({id:row.id,name:row.name,version:row.version,expiresAt:row.expires_at,revokedAt:row.revoked_at,createdAt:row.created_at});
async function policyRow(client,centerId){
  const row=(await client.query('SELECT * FROM centers.access_policies WHERE center_id=$1',[centerId])).rows[0];
  return row?{policy:{enabled:row.enabled,requireSubscription:row.require_subscription,denyOverdue:row.deny_overdue,graceDays:row.grace_days},version:row.version}:{policy:{...DEFAULT_ACCESS_POLICY},version:0};
}
async function ownMember(client,uid,centerId){return (await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid])).rows[0]?.id||missing()}
async function decision(client,centerId,memberId){return (await client.query('SELECT centers.access_decision($1,$2) AS decision',[centerId,memberId])).rows[0].decision}
async function deviceRow(client,centerId,id){return (await client.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM centers.access_devices WHERE center_id=$1 AND id=$2',[centerId,id])).rows[0]||missing()}

export function configureAccess({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','version','policy','requestId']);const centerId=idField(raw.centerId),version=raw.version,requestId=requestField(raw.requestId),policy=accessPolicy(raw.policy),operation='access.policy',hash=commandHash({version,policy});
  if(!Number.isSafeInteger(version)||version<0)throw new CentersError(400,'invalid-input','policy version required');
  return businessTransaction(database,user.id,centerId,'access.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return policyRow(client,centerId);
    const previous=await policyRow(client,centerId);if(previous.version!==version)conflict('version-conflict');checkSession();
    await client.query(`INSERT INTO centers.access_policies(center_id,enabled,require_subscription,deny_overdue,grace_days,actor_uid) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(center_id) DO UPDATE SET enabled=excluded.enabled,require_subscription=excluded.require_subscription,deny_overdue=excluded.deny_overdue,grace_days=excluded.grace_days,actor_uid=excluded.actor_uid,version=access_policies.version+1,updated_at=clock_timestamp()`,[centerId,policy.enabled,policy.requireSubscription,policy.denyOverdue,policy.graceDays,user.id]);
    const result=await policyRow(client,centerId);await businessAudit(client,centerId,user.id,operation,centerId,{version:result.version});await rememberCommand(client,centerId,user.id,operation,requestId,hash,{version:result.version});checkSession();return result;
  },{platform});
}
export function accessPageOptions(params,{own=false,devices=false}={}){
  const allowed=['centerId','limit','cursor',...(!own&&!devices?['memberId']:[])];if([...params.keys()].some(key=>!allowed.includes(key)))throw new CentersError(400,'invalid-input','invalid access selectors');
  const limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null,memberId=params.has('memberId')?idField(params.get('memberId')):null;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid access page');return {limit,cursor,memberId};
}
export function accessStatus(database,uid,centerId,{limit=30,cursor=null}={}, {platform=false,own=false}={}){
  return businessTransaction(database,uid,centerId,own?'access.own.read':'access.manage',async client=>{
    const policy=await policyRow(client,centerId);
    if(own){const memberId=await ownMember(client,uid,centerId),allowed=(await decision(client,centerId,memberId))==='allowed';return {enabled:policy.policy.enabled,allowed,tokenLifetimeSeconds:45}}
    const scope=cursorScope(['access-devices',uid,centerId]),after=readCursor(cursor,scope),{rows}=await client.query(`SELECT *,created_at::text AS cursor_at FROM centers.access_devices WHERE center_id=$1
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::text)) ORDER BY created_at DESC,id DESC LIMIT $4`,[centerId,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit);return {...policy,devices:page.map(deviceDto),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  },{platform:!own&&platform,allowInactive:true});
}
export function createAccessDevice({database,user,checkSession,mintAccessCredential},raw,{platform=false}={}){
  objectBody(raw,['centerId','name','requestId']);const centerId=idField(raw.centerId),name=textField(raw.name,80,{required:true}),requestId=requestField(raw.requestId),operation='access.device.create',hash=commandHash({name});
  return businessTransaction(database,user.id,centerId,'access.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);let id;
    if(replay)id=replay.id;
    else{
      if((await client.query('SELECT count(*)::int AS n FROM centers.access_devices WHERE center_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()',[centerId])).rows[0].n>=50)conflict('access-device-limit');
      id='ad_'+commandHash([centerId,user.id,requestId]).slice(0,32);const key=privateCredential(mintAccessCredential,'device',id,1);checkSession();
      await client.query("INSERT INTO centers.access_devices(id,center_id,name,key_hash,actor_uid,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '30 days')",[id,centerId,name,digest(key),user.id]);
      await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id,version:1});await businessAudit(client,centerId,user.id,operation,id);
    }
    const row=await deviceRow(client,centerId,id);if(row.version!==1||row.revoked_at||!row.unexpired)conflict('access-device-changed');
    const credential=privateCredential(mintAccessCredential,'device',id,row.version);if(!matches(credential,row.key_hash))conflict('access-device-changed');checkSession();return {device:deviceDto(row),credential};
  },{platform});
}
export function changeAccessDevice({database,user,checkSession,mintAccessCredential},raw,{platform=false,revoke=false}={}){
  objectBody(raw,['centerId','id','version','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),operation=revoke?'access.device.revoke':'access.device.rotate',hash=commandHash({id,version});
  return businessTransaction(database,user.id,centerId,'access.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash),row=await deviceRow(client,centerId,id);
    if(!replay){
      if(row.version!==version)conflict('version-conflict');if(row.revoked_at)conflict('access-device-changed');checkSession();
      if(revoke)await client.query('UPDATE centers.access_devices SET revoked_at=clock_timestamp(),version=version+1 WHERE center_id=$1 AND id=$2',[centerId,id]);
      else await client.query("UPDATE centers.access_devices SET key_hash=$3,version=version+1 WHERE center_id=$1 AND id=$2",[centerId,id,digest(privateCredential(mintAccessCredential,'device',id,version+1))]);
      await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id,version:version+1});await businessAudit(client,centerId,user.id,operation,id);
    }
    const result=await deviceRow(client,centerId,id);if(result.version!==(replay?.version??version+1)||(!revoke&&(!result.unexpired||result.revoked_at)))conflict('access-device-changed');
    let credential=null;if(!revoke){credential=privateCredential(mintAccessCredential,'device',id,result.version);if(!matches(credential,result.key_hash))conflict('access-device-changed')}
    checkSession();return {device:deviceDto(result),credential};
  },{platform,allowInactive:revoke});
}
export function issueAccessToken({database,user,checkSession,mintAccessCredential},raw){
  objectBody(raw,['centerId','requestId']);const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),operation='access.token.issue',hash=commandHash({});
  return businessTransaction(database,user.id,centerId,'access.token.create',async client=>{
    const memberId=await ownMember(client,user.id,centerId),replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);let id;
    if(replay)id=replay.id;
    else{
      if((await decision(client,centerId,memberId))!=='allowed')conflict('access-unavailable');
      if((await client.query("SELECT count(*)::int AS n FROM centers.access_tokens WHERE center_id=$1 AND account_uid=$2 AND issued_at>clock_timestamp()-interval '1 minute'",[centerId,user.id])).rows[0].n>=6)throw new CentersError(429,'access-rate-limited','wait before requesting another access token');
      id='at_'+commandHash([centerId,user.id,requestId]).slice(0,32);const token=privateCredential(mintAccessCredential,'token',id,1);checkSession();
      await client.query('UPDATE centers.access_tokens SET invalidated_at=clock_timestamp() WHERE center_id=$1 AND member_id=$2 AND consumed_at IS NULL AND invalidated_at IS NULL',[centerId,memberId]);
      await client.query('INSERT INTO centers.access_tokens(id,center_id,member_id,account_uid,token_hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp())',[id,centerId,memberId,user.id,digest(token)]);
      await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});await businessAudit(client,centerId,user.id,operation,id);
    }
    const row=(await client.query('SELECT *,expires_at>clock_timestamp() AS unexpired,greatest(0,floor(extract(epoch FROM expires_at-clock_timestamp())*1000))::integer AS remaining_ms FROM centers.access_tokens WHERE center_id=$1 AND id=$2 AND member_id=$3 AND account_uid=$4',[centerId,id,memberId,user.id])).rows[0];
    if(!row||row.consumed_at||row.invalidated_at||!row.unexpired||row.remaining_ms<=0)conflict('access-token-expired');
    const token=privateCredential(mintAccessCredential,'token',id,1);if(!matches(token,row.token_hash))conflict('access-token-expired');checkSession();return {token,expiresAt:row.expires_at,issuedAt:row.issued_at,remainingMs:row.remaining_ms};
  });
}
export function consumeAccessToken({database,user,checkSession,deviceKey,mintAccessCredential},raw,{platform=false}={}){
  objectBody(raw,['centerId','deviceId','token','requestId']);const centerId=idField(raw.centerId),deviceId=idField(raw.deviceId),token=accessToken(raw.token),credential=deviceCredential(deviceKey),requestId=requestField(raw.requestId);
  if(!credential)throw new CentersError(401,'access-device-invalid','reception device is not authorized');
  if(!token)throw new CentersError(400,'invalid-input','invalid QR format');const hash=commandHash({tokenHash:digest(token)});
  return businessTransaction(database,user.id,centerId,'access.verify',async client=>{
    const device=await deviceRow(client,centerId,deviceId);if(device.revoked_at||!device.unexpired||!matches(credential,device.key_hash))throw new CentersError(401,'access-device-invalid','reception device is not authorized');
    const previous=(await client.query('SELECT body_hash,result,visit_id FROM centers.access_scans WHERE center_id=$1 AND device_id=$2 AND operator_uid=$3 AND request_id=$4',[centerId,deviceId,user.id,requestId])).rows[0];
    // A replay acknowledges the old record; it never authorizes a second admission.
    if(previous){if(previous.body_hash!==hash)conflict('idempotency-conflict');return {admitted:false,replayed:true,visitId:previous.visit_id||null}}
    if((await client.query("SELECT count(*)::int AS n FROM centers.access_scans WHERE center_id=$1 AND device_id=$2 AND created_at>clock_timestamp()-interval '1 minute'",[centerId,deviceId])).rows[0].n>=120)throw new CentersError(429,'access-rate-limited','reception scan limit reached');
    const row=(await client.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM centers.access_tokens WHERE center_id=$1 AND token_hash=$2 FOR UPDATE',[centerId,digest(token)])).rows[0];
    let result='unknown',visit=null,member=null;
    if(row){
      if(row.consumed_at||row.invalidated_at)result='used';else if(!row.unexpired||!matches(privateCredential(mintAccessCredential,'token',row.id,1),row.token_hash))result='expired';else{
        const current=(await client.query('SELECT account_uid,name,member_number FROM centers.members WHERE center_id=$1 AND id=$2',[centerId,row.member_id])).rows[0];
        if(!current||current.account_uid!==row.account_uid||(await decision(client,centerId,row.member_id))!=='allowed')result='denied';
        else{
          visit='av_'+commandHash([centerId,deviceId,user.id,requestId]).slice(0,32);checkSession();
          await client.query('INSERT INTO centers.access_visits(id,center_id,member_id,account_uid,token_id,device_id,operator_uid,visited_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',[visit,centerId,row.member_id,row.account_uid,row.id,deviceId,user.id]);
          result='admitted';member={name:current.name,number:current.member_number};await businessAudit(client,centerId,user.id,'access.visit',visit,{deviceId});
        }
      }
    }
    await client.query('INSERT INTO centers.access_scans(center_id,device_id,operator_uid,request_id,body_hash,result,visit_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[centerId,deviceId,user.id,requestId,hash,result,visit]);checkSession();
    return {admitted:result==='admitted',replayed:false,visitId:visit,...(member?{member}:{})};
  },{platform});
}

const holdDto=row=>({id:row.id,memberId:row.member_id,reason:row.reason,version:row.version,createdAt:row.created_at,releasedAt:row.released_at});
export function accessMember(database,uid,centerId,memberId,{platform=false}={}){
  return businessTransaction(database,uid,centerId,'access.manage',async client=>{
    const member=await memberRecord(client,centerId,memberId),hold=(await client.query('SELECT * FROM centers.access_holds WHERE center_id=$1 AND member_id=$2 AND released_at IS NULL',[centerId,memberId])).rows[0];
    return {member:{id:member.id,name:member.name,number:member.member_number,state:member.state,version:member.version},allowed:(await decision(client,centerId,memberId))==='allowed',hold:hold?holdDto(hold):null};
  },{platform,allowInactive:true});
}
export function setAccessHold({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','memberId','memberVersion','reason','requestId']);const centerId=idField(raw.centerId),memberId=idField(raw.memberId),version=versionField(raw.memberVersion),reason=textField(raw.reason,250,{required:true}),requestId=requestField(raw.requestId),operation='access.hold',hash=commandHash({memberId,version,reason});
  return businessTransaction(database,user.id,centerId,'access.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);let id;
    if(replay)id=replay.id;
    else{
      const member=await memberRecord(client,centerId,memberId);if(member.version!==version)conflict('version-conflict');
      if((await client.query('SELECT id FROM centers.access_holds WHERE center_id=$1 AND member_id=$2 AND released_at IS NULL',[centerId,memberId])).rows.length)conflict('access-hold-exists');
      id='ah_'+commandHash([centerId,user.id,requestId]).slice(0,32);checkSession();
      await client.query('INSERT INTO centers.access_holds(id,center_id,member_id,reason,actor_uid) VALUES($1,$2,$3,$4,$5)',[id,centerId,memberId,reason,user.id]);
      await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});await businessAudit(client,centerId,user.id,operation,id,{memberId});
    }
    const row=(await client.query('SELECT * FROM centers.access_holds WHERE center_id=$1 AND id=$2 AND member_id=$3',[centerId,id,memberId])).rows[0]||missing();checkSession();return {hold:holdDto(row)};
  },{platform,allowInactive:true});
}
export function releaseAccessHold({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','memberId','id','version','requestId']);const centerId=idField(raw.centerId),memberId=idField(raw.memberId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),operation='access.hold.release',hash=commandHash({memberId,id,version});
  return businessTransaction(database,user.id,centerId,'access.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash),row=(await client.query('SELECT * FROM centers.access_holds WHERE center_id=$1 AND id=$2 AND member_id=$3',[centerId,id,memberId])).rows[0]||missing();
    if(!replay){
      if(row.version!==version||row.released_at)conflict('version-conflict');checkSession();
      await client.query('UPDATE centers.access_holds SET released_at=clock_timestamp(),released_by=$3,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,id,user.id]);
      await rememberCommand(client,centerId,user.id,operation,requestId,hash,{id});await businessAudit(client,centerId,user.id,operation,id,{memberId});
    }
    checkSession();return {hold:holdDto((await client.query('SELECT * FROM centers.access_holds WHERE center_id=$1 AND id=$2',[centerId,id])).rows[0])};
  },{platform,allowInactive:true});
}
export function accessVisits(database,uid,centerId,{limit=30,cursor=null,memberId=null}={}, {platform=false,own=false}={}){
  return businessTransaction(database,uid,centerId,own?'access.own.read':'access.verify',async client=>{
    if(own)memberId=await ownMember(client,uid,centerId);else if(memberId)await memberRecord(client,centerId,memberId);
    const scope=cursorScope(['access-visits',own,uid,centerId,memberId]),after=readCursor(cursor,scope),{rows}=await client.query(`SELECT *,visited_at::text AS cursor_at FROM centers.access_visits WHERE center_id=$1
      AND ($2::text IS NULL OR member_id=$2) AND (NOT $3::boolean OR account_uid=$4)
      AND ($5::timestamptz IS NULL OR (visited_at,id)<($5::timestamptz,$6::text)) ORDER BY visited_at DESC,id DESC LIMIT $7`,[centerId,memberId,own,uid,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit);return {visits:page.map(row=>({id:row.id,visitedAt:row.visited_at,...(!own?{memberId:row.member_id,deviceId:row.device_id,operatorUid:row.operator_uid}:{})})),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  },{platform:!own&&platform,allowInactive:true});
}
