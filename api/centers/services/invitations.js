import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
import {isPlatformUser,requireCenter} from '../authz.js';
import {idField,versionField,requestField,objectBody} from '../domain/validation.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';

const conflict=code=>new CentersError(409,code,'invitation conflicts with current state');
const capability=kind=>kind==='manager'?'managers.manage':kind==='trainer'?'staff.manage':'members.manage';
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
function tokenField(raw){objectBody(raw,['token']);if(typeof raw.token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(raw.token))throw new CentersError(400,'invalid-input','invalid invitation');return raw.token;}
const dto=row=>({id:row.id,centerId:row.center_id,kind:row.kind,memberId:row.member_id,accountUid:row.account_uid,
  status:row.status,expiresAt:row.expires_at,expired:row.expired===true,version:row.version});
function account(lookup,uid){const value=lookup(uid);if(!value||value.disabled)throw new CentersError(404,'not-found','account unavailable');return value;}

export async function createInvitation({database,accountLocks,lookupAccount,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','kind','memberId','accountUid','ttlHours','requestId']);
  const centerId=idField(raw.centerId),uid=idField(raw.accountUid),requestId=requestField(raw.requestId),kind=raw.kind;
  if(!['member','manager','trainer'].includes(kind))throw new CentersError(400,'invalid-input','invalid invitation kind');
  if(kind==='manager'&&!platform)throw new CentersError(403,'forbidden','forbidden');
  const memberId=kind==='member'?idField(raw.memberId):null,ttlHours=raw.ttlHours??72;
  if((kind!=='member'&&raw.memberId!=null)||!Number.isSafeInteger(ttlHours)||ttlHours<1||ttlHours>168)throw new CentersError(400,'invalid-input','invalid invitation details');
  const bodyHash=commandHash({kind,memberId,uid,ttlHours}),operation='invitation.create';
  return accountLocks.withAccounts([user.id,uid],()=>businessTransaction(database,user.id,centerId,capability(kind),async(client)=>{
    const previous=await commandReplay(client,centerId,user.id,operation,requestId,bodyHash);if(previous)return {...previous,token:null};
    account(lookupAccount,uid);
    if(memberId){
      await memberRecord(client,centerId,memberId);
      const {rows}=await client.query('SELECT account_uid FROM centers.members WHERE center_id=$1 AND id=$2',[centerId,memberId]);
      if(rows[0].account_uid)throw conflict('account-linked');
    }
    const expired=await client.query("UPDATE centers.invitations SET status='revoked',revoked_at=NOW(),version=version+1 WHERE center_id=$1 AND status='pending' AND expires_at<=clock_timestamp() AND kind=$2 AND ($3::text IS NULL OR member_id=$3) AND ($3::text IS NOT NULL OR account_uid=$4) RETURNING id",[centerId,kind,memberId,uid]);
    for(const row of expired.rows)await businessAudit(client,centerId,user.id,'invitation.expired',row.id);
    const token=randomBytes(32).toString('base64url'),id='iv_'+commandHash([centerId,user.id,requestId]).slice(0,32);
    checkSession();
    const {rows}=await client.query(`INSERT INTO centers.invitations(id,center_id,kind,member_id,account_uid,issuer_uid,token_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW()+($8*INTERVAL '1 hour')) RETURNING *`,[id,centerId,kind,memberId,uid,user.id,tokenHash(token),ttlHours]);
    const result={invite:dto(rows[0])};
    await businessAudit(client,centerId,user.id,'invitation.created',id,{kind,memberId});
    // Persist only metadata: a replay never exposes or stores the original secret.
    await rememberCommand(client,centerId,user.id,operation,requestId,bodyHash,result);checkSession();return {...result,token};
  },{platform,allowInactive:kind==='manager'}));
}

export async function listInvitations(database,uid,centerId,kind,memberId,{platform=false}={}) {
  if(!['member','manager','trainer'].includes(kind)||kind==='manager'&&!platform)throw new CentersError(403,'forbidden','forbidden');
  return businessTransaction(database,uid,centerId,capability(kind),async client=>{
    const {rows}=await client.query(`SELECT *,expires_at<=clock_timestamp() AS expired FROM centers.invitations WHERE center_id=$1 AND kind=$2 AND ($3::text IS NULL OR member_id=$3)
      ORDER BY created_at DESC,id DESC LIMIT 50`,[centerId,kind,memberId||null]);
    return {invites:rows.map(dto)};
  },{platform,allowInactive:kind==='manager'||platform});
}

export async function revokeInvitation({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','version']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version);
  // Start with broad staff capability only for metadata lookup, then enforce invite kind.
  return businessTransaction(database,user.id,centerId,platform?'managers.manage':'members.manage',async client=>{
    const {rows}=await client.query('SELECT * FROM centers.invitations WHERE center_id=$1 AND id=$2 FOR UPDATE',[centerId,id]);
    if(!rows.length)throw new CentersError(404,'not-found','not found');
    if(rows[0].kind==='manager'&&!platform)throw new CentersError(403,'forbidden','forbidden');
    if(rows[0].version!==version)throw conflict('version-conflict');
    if(rows[0].status!=='pending')throw conflict('invalid-state');
    checkSession();
    const updated=await client.query("UPDATE centers.invitations SET status='revoked',revoked_at=NOW(),version=version+1 WHERE center_id=$1 AND id=$2 RETURNING *",[centerId,id]);
    await businessAudit(client,centerId,user.id,'invitation.revoked',id);checkSession();return {invite:dto(updated.rows[0])};
  },{platform,allowInactive:platform});
}

async function ownInvitation(database,user,token) {
  return database.accountTransaction(user.id,async client=>{
    const {rows}=await client.query('SELECT id,center_id,issuer_uid FROM centers.invitations WHERE token_hash=$1 AND account_uid=$2',[tokenHash(token),user.id]);
    if(!rows.length)throw new CentersError(404,'not-found','invitation unavailable');return rows[0];
  });
}
async function validGrant(client,config,lookup,user,found,token) {
  const {rows}=await client.query('SELECT *,expires_at>clock_timestamp() AS valid FROM centers.invitations WHERE id=$1 AND center_id=$2 AND account_uid=$3 AND token_hash=$4 FOR UPDATE',[found.id,found.center_id,user.id,tokenHash(token)]);
  if(!rows.length||rows[0].status==='revoked')throw new CentersError(404,'not-found','invitation unavailable');
  const invite=rows[0];if(invite.status==='accepted')return invite;
  if(!invite.valid)throw new CentersError(410,'invitation-expired','invitation expired');
  const issuer=account(lookup,invite.issuer_uid);
  if(isPlatformUser(config,issuer)){
    const {rows:centers}=await client.query('SELECT state FROM centers.centers WHERE id=$1',[invite.center_id]);
    if(!centers.length||invite.kind!=='manager'&&centers[0].state!=='active')throw conflict('center-inactive');
  }else{
    if(invite.kind==='manager')throw new CentersError(403,'forbidden','invitation unavailable');
    await requireCenter(client,issuer.id,invite.center_id,capability(invite.kind));
  }
  return invite;
}
export async function inspectInvitation({database,lookupAccount,user,config,checkSession},raw) {
  const token=tokenField(raw),found=await ownInvitation(database,user,token);
  return database.platformTransaction(user.id,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[found.center_id]);
    const invite=await validGrant(client,config,lookupAccount,user,found,token);
    const {rows}=await client.query('SELECT name FROM centers.centers WHERE id=$1',[found.center_id]);
    checkSession();return {invite:{...dto(invite),centerName:rows[0].name}};
  },found.center_id);
}
export async function acceptInvitation({database,accountLocks,lookupAccount,user,config,checkSession},raw) {
  const token=tokenField(raw),found=await ownInvitation(database,user,token);
  return accountLocks.withAccounts([user.id,found.issuer_uid],()=>database.platformTransaction(user.id,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[found.center_id]);
    const invite=await validGrant(client,config,lookupAccount,user,found,token);
    if(invite.status==='accepted'){checkSession();return {accepted:true,alreadyAccepted:true,centerId:invite.center_id,kind:invite.kind};}
    account(lookupAccount,user.id);checkSession();let target;
    if(invite.kind==='member'){
      const {rows}=await client.query('SELECT id,account_uid FROM centers.members WHERE center_id=$1 AND id=$2 FOR UPDATE',[invite.center_id,invite.member_id]);
      if(!rows.length)throw new CentersError(404,'not-found','invitation unavailable');
      if(rows[0].account_uid&&rows[0].account_uid!==user.id)throw conflict('account-linked');
      await client.query('UPDATE centers.members SET account_uid=$3,version=version+1,updated_at=NOW() WHERE center_id=$1 AND id=$2',[invite.center_id,invite.member_id,user.id]);target=invite.member_id;
    }else{
      const {rows}=await client.query('SELECT id FROM centers.role_assignments WHERE center_id=$1 AND account_uid=$2 AND role=$3 AND revoked_at IS NULL',[invite.center_id,user.id,invite.kind]);
      target=rows[0]?.id||randomUUID();
      if(!rows.length)await client.query('INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,$4)',[target,invite.center_id,user.id,invite.kind]);
      await client.query("UPDATE centers.centers SET state=CASE WHEN state='draft' AND $2='manager' THEN 'active' ELSE state END,version=version+1,updated_at=NOW() WHERE id=$1",[invite.center_id,invite.kind]);
    }
    const applied=await client.query("UPDATE centers.invitations SET status='accepted',accepted_at=NOW(),target_record_id=$4,version=version+1 WHERE id=$1 AND center_id=$2 AND account_uid=$3 AND status='pending' AND expires_at>clock_timestamp() RETURNING id",[invite.id,invite.center_id,user.id,target]);
    if(!applied.rows.length)throw new CentersError(410,'invitation-expired','invitation expired');
    await businessAudit(client,invite.center_id,user.id,'invitation.accepted',invite.id,{kind:invite.kind,targetRecordId:target});checkSession();
    return {accepted:true,centerId:invite.center_id,kind:invite.kind};
  },found.center_id),{requireExisting:false});
}
