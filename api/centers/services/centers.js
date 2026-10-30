import { createHash, randomUUID } from 'node:crypto';
import { CentersError } from '../errors.js';
import { requireCenter } from '../authz.js';
import { objectBody, centerFields, idField, requestField, versionField } from '../domain/validation.js';
import { DEVELOPMENT_POLICY } from '../domain/policies.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const error = (code,message='conflict') => new CentersError(409,code,message);
const audit = (client,centerId,uid,action,target,details={}) => client.query(`INSERT INTO centers.business_audit
  (center_id,actor_uid,action,target_id,details) VALUES($1,$2,$3,$4,$5)`,[centerId,uid,action,target,JSON.stringify(details)]);
export const centerDto = c => ({ id:c.id,name:c.name,state:c.state,currency:c.currency,timezone:c.timezone,
  taxId:c.tax_id,address:c.address,contactEmail:c.contact_email,phone:c.phone,version:c.version,
  capacity:c.capacity,openingHours:c.opening_hours,billingDay:c.billing_day });

async function lockedCenter(client,id,version) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[id]);
  const { rows } = await client.query('SELECT * FROM centers.centers WHERE id=$1 FOR UPDATE',[id]);
  if (!rows.length) throw new CentersError(404,'not-found','not found');
  if (rows[0].version !== version) throw error('version-conflict','center changed; reload it');
  return rows[0];
}
async function eligibleManagers(client,centerId,lookupAccount) {
  const { rows } = await client.query(`SELECT account_uid FROM centers.role_assignments WHERE center_id=$1 AND role='manager'
    AND revoked_at IS NULL AND valid_from<=statement_timestamp() AND (valid_until IS NULL OR valid_until>statement_timestamp())`,[centerId]);
  return rows.filter(r=>{ const account=lookupAccount(r.account_uid);return account && !account.disabled; });
}
function requireAccount(lookup,uid) {
  const account=lookup(uid);
  if (!account) throw new CentersError(404,'not-found','not found');
  if (account.disabled) throw error('account-inactive','account is disabled');
}

export function platformCenterListOptions(params) {
  const query=(params.get('query')||'').trim(),limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null;
  if([...params.keys()].some(key=>!['query','limit','cursor'].includes(key))||query.length>120||/[\u0000-\u001f\u007f]/.test(query)||!Number.isSafeInteger(limit)||limit<1||limit>100||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid center list options');
  return {query,limit,cursor};
}
export async function listPlatformCenters(database,uid,{query='',limit=30,cursor=null}={}) {
  const scope=cursorScope(['platform-centers',uid,query]),after=readCursor(cursor,scope);
  return database.platformTransaction(uid,async client=>{
    const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const {rows}=await client.query(`SELECT *,created_at::text AS cursor_at FROM centers.centers WHERE ($1='' OR name ILIKE $2 ESCAPE '\\' OR id ILIKE $2 ESCAPE '\\')
      AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT $5`,[query,pattern,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit);return {centers:page.map(centerDto),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  });
}

export async function createCenter({database,accountLocks,lookupAccount,user,checkSession},raw) {
  objectBody(raw,['name','taxId','address','contactEmail','phone','timezone','capacity','billingDay','openingHours','managerUid','requestId']);
  const fields=centerFields(raw),requestId=requestField(raw.requestId);
  const managerUid=raw.managerUid ? idField(raw.managerUid) : null;
  const id='c_'+createHash('sha256').update(`${user.id}:${requestId}`).digest('hex').slice(0,32);
  const bodyHash=createHash('sha256').update(JSON.stringify({...fields,managerUid})).digest('hex');
  return accountLocks.withAccounts([user.id,...(managerUid?[managerUid]:[])],()=>database.platformTransaction(user.id,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ft-gym-center:' || $1))",[id]);
    const {rows:existing}=await client.query('SELECT result,body_hash FROM centers.idempotency_records WHERE center_id=$1 AND actor_uid=$2 AND operation=$3 AND request_id=$4',[id,user.id,'center.create',requestId]);
    if(existing.length){ if(existing[0].body_hash!==bodyHash)throw error('idempotency-conflict','requestId was used with different content');return existing[0].result; }
    if(managerUid)requireAccount(lookupAccount,managerUid);
    checkSession();
    const {rows}=await client.query(`INSERT INTO centers.centers(id,name,tax_id,address,contact_email,phone,timezone,policy,capacity,billing_day,opening_hours)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[id,fields.name,fields.taxId,fields.address,fields.contactEmail,fields.phone,fields.timezone,JSON.stringify(DEVELOPMENT_POLICY),fields.capacity,fields.billingDay,JSON.stringify(fields.openingHours)]);
    let center=rows[0];
    if(managerUid){
      await client.query('INSERT INTO centers.role_assignments(id,center_id,account_uid,role) VALUES($1,$2,$3,$4)',[randomUUID(),id,managerUid,'manager']);
      center=(await client.query("UPDATE centers.centers SET state='active' WHERE id=$1 RETURNING *",[id])).rows[0];
      await audit(client,id,user.id,'manager.assigned',managerUid);
    }
    await audit(client,id,user.id,'center.created',id,{state:center.state});
    const result={center:centerDto(center)};
    await client.query('INSERT INTO centers.idempotency_records(center_id,actor_uid,operation,request_id,body_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[id,user.id,'center.create',requestId,bodyHash,JSON.stringify(result)]);
    checkSession(); return result;
  },id));
}

export async function updateCenter({database,accountLocks,lookupAccount,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','version','name','taxId','address','contactEmail','phone','timezone','capacity','billingDay','openingHours',...(platform?['state']:[])]);
  const id=idField(raw.centerId),version=versionField(raw.version),fields=centerFields(raw);
  if(platform && raw.state!=null && !['draft','active','inactive'].includes(raw.state))throw new CentersError(400,'invalid-input','invalid center state');
  const work=async client=>{
    if(!platform)await requireCenter(client,user.id,id,'center.update',{lock:true});
    const center=await lockedCenter(client,id,version),state=platform?(raw.state||center.state):center.state;
    if(state==='active' && !(await eligibleManagers(client,id,lookupAccount)).length)throw error('last-manager','active center requires an enabled manager');
    checkSession();
    const {rows}=await client.query(`UPDATE centers.centers SET name=$2,tax_id=$3,address=$4,contact_email=$5,phone=$6,
      timezone=$7,state=$8,capacity=$9,billing_day=$10,opening_hours=$11,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,fields.name,fields.taxId,fields.address,fields.contactEmail,fields.phone,fields.timezone,state,fields.capacity,fields.billingDay,JSON.stringify(fields.openingHours)]);
    await audit(client,id,user.id,'center.updated',id,{state});checkSession();return {center:centerDto(rows[0])};
  };
  const execute=()=>platform?database.platformTransaction(user.id,work,id):database.transaction({uid:user.id,centerId:id},work);
  if(platform && raw.state==='active') {
    // An inactive center is absent from the global-disable lookup. Hold identity locks
    // through activation's COMMIT, so disabling cannot race its enabled-manager check.
    // Any intervening role change increments the center version and fails lockedCenter.
    const managers=await database.platformTransaction(user.id,async client=>{
      const {rows}=await client.query("SELECT account_uid FROM centers.role_assignments WHERE center_id=$1 AND role='manager' AND revoked_at IS NULL",[id]);
      return rows.map(r=>r.account_uid);
    },id);
    return accountLocks.withAccounts([user.id,...managers],execute);
  }
  return execute();
}

export async function assignRole({database,accountLocks,lookupAccount,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','version','accountUid','role',...(platform?['replaceAssignmentId','extraCapabilities']:[])]);
  const id=idField(raw.centerId),version=versionField(raw.version),uid=idField(raw.accountUid),role=raw.role||'trainer';
  if(!['manager','trainer'].includes(role)||(!platform&&role!=='trainer'))throw new CentersError(403,'forbidden','forbidden');
  const replace=raw.replaceAssignmentId?idField(raw.replaceAssignmentId):null;
  const extras=raw.extraCapabilities||[];
  if(!Array.isArray(extras)||extras.some(cap=>!['data.export','payments.refund'].includes(cap))||(role==='trainer'&&extras.length))throw new CentersError(400,'invalid-input','invalid extra capabilities');
  return accountLocks.withAccounts([user.id,uid],async()=>{
    const work=async client=>{
      if(!platform)await requireCenter(client,user.id,id,'staff.manage',{lock:true});
      const center=await lockedCenter(client,id,version);requireAccount(lookupAccount,uid);
      if(replace){
        const {rows}=await client.query('SELECT id,role FROM centers.role_assignments WHERE id=$1 AND center_id=$2 AND revoked_at IS NULL',[replace,id]);
        if(!rows.length||rows[0].role!==role)throw new CentersError(404,'not-found','not found');
        await client.query('UPDATE centers.role_assignments SET revoked_at=NOW(),version=version+1 WHERE id=$1',[replace]);
      }
      checkSession();
      const assignmentId=randomUUID();
      await client.query('INSERT INTO centers.role_assignments(id,center_id,account_uid,role,extra_capabilities) VALUES($1,$2,$3,$4,$5)',[assignmentId,id,uid,role,[...new Set(extras)]]);
      const state=center.state==='draft'&&role==='manager'?'active':center.state;
      await client.query('UPDATE centers.centers SET state=$2,version=version+1,updated_at=NOW() WHERE id=$1',[id,state]);
      await audit(client,id,user.id,'role.assigned',assignmentId,{role,replaced:replace});checkSession();
      return {assignment:{id:assignmentId,centerId:id,accountUid:uid,role},centerVersion:version+1,state};
    };
    return platform?database.platformTransaction(user.id,work,id):database.transaction({uid:user.id,centerId:id},work);
  });
}

export async function revokeRole({database,lookupAccount,user,checkSession},raw,{platform=false,managersOnly=false}={}) {
  objectBody(raw,['centerId','version','assignmentId']);
  const id=idField(raw.centerId),version=versionField(raw.version),assignmentId=idField(raw.assignmentId);
  const work=async client=>{
    if(!platform)await requireCenter(client,user.id,id,'staff.manage',{lock:true});
    const center=await lockedCenter(client,id,version);
    const {rows}=await client.query('SELECT id,role FROM centers.role_assignments WHERE id=$1 AND center_id=$2 AND revoked_at IS NULL',[assignmentId,id]);
    if(!rows.length)throw new CentersError(404,'not-found','not found');
    if(managersOnly&&rows[0].role!=='manager')throw new CentersError(403,'forbidden','forbidden');
    if(!platform && rows[0].role!=='trainer')throw new CentersError(403,'forbidden','forbidden');
    checkSession();
    await client.query('UPDATE centers.role_assignments SET revoked_at=NOW(),version=version+1 WHERE id=$1',[assignmentId]);
    if(center.state==='active' && !(await eligibleManagers(client,id,lookupAccount)).length)throw error('last-manager','cannot revoke the last enabled manager');
    await client.query('UPDATE centers.centers SET version=version+1,updated_at=NOW() WHERE id=$1',[id]);
    await audit(client,id,user.id,'role.revoked',assignmentId);checkSession();return {ok:true,centerVersion:version+1};
  };
  return platform?database.platformTransaction(user.id,work,id):database.transaction({uid:user.id,centerId:id},work);
}

export async function listStaff(database,uid,centerId,{platform=false,lookupAccount=()=>null}={}) {
  const work=async client=>{
    if(!platform)await requireCenter(client,uid,centerId,'staff.manage',{allowInactive:true});
    const {rows}=await client.query(`SELECT r.id,r.account_uid,r.role,r.extra_capabilities,r.valid_from,r.valid_until,r.revoked_at,r.version,
      (SELECT m.national_document FROM centers.members m WHERE m.center_id=r.center_id AND m.account_uid=r.account_uid LIMIT 1) AS national_document
      FROM centers.role_assignments r WHERE r.center_id=$1 ORDER BY r.role,r.account_uid`,[centerId]);
    return {staff:rows.map(r=>({id:r.id,accountUid:r.account_uid,name:lookupAccount(r.account_uid)?.name||null,nationalDocument:r.national_document||null,role:r.role,extraCapabilities:r.extra_capabilities,revoked:!!r.revoked_at,version:r.version}))};
  };
  return platform?database.platformTransaction(uid,work,centerId):database.transaction({uid,centerId},work);
}
