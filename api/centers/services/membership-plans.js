import {CentersError} from '../errors.js';
import {objectBody,idField,versionField,requestField} from '../domain/validation.js';
import {planFields,PLAN_FIELDS,membershipPlanDto} from '../domain/membership-plan.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';

const conflict=code=>new CentersError(409,code,'membership plan changed; reload');
const projection='v.*,p.version,p.archived_at,p.created_at::text AS cursor_at,p.id AS cursor_id';
async function record(client,centerId,id) {
  const {rows}=await client.query(`SELECT ${projection} FROM centers.membership_plans p JOIN centers.membership_plan_versions v ON (v.center_id,v.plan_id,v.revision)=(p.center_id,p.id,p.current_revision) WHERE p.center_id=$1 AND p.id=$2`,[centerId,id]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');return rows[0];
}
async function insertVersion(client,centerId,planId,revision,fields,uid) {
  const id='pv_'+commandHash([centerId,planId,revision]).slice(0,32);
  await client.query(`INSERT INTO centers.membership_plan_versions(id,center_id,plan_id,revision,name,price_minor,currency,interval_months,price_includes_tax,tax_basis_points,proration,actor_uid)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,centerId,planId,revision,fields.name,fields.priceMinor,fields.currency,fields.intervalMonths,fields.priceIncludesTax,fields.taxBasisPoints,fields.proration,uid]);
}
export async function createMembershipPlan({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','requestId',...PLAN_FIELDS]);
  const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),fields=planFields(raw),hash=commandHash(fields),operation='membership-plan.create';
  return businessTransaction(database,user.id,centerId,'plans.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const id='mp_'+commandHash([centerId,user.id,requestId]).slice(0,32);checkSession();
    await client.query('INSERT INTO centers.membership_plans(id,center_id) VALUES($1,$2)',[id,centerId]);
    await insertVersion(client,centerId,id,1,fields,user.id);
    const result={plan:membershipPlanDto(await record(client,centerId,id))};
    await businessAudit(client,centerId,user.id,operation,id);await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform});
}
export async function reviseMembershipPlan({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','version','requestId',...PLAN_FIELDS]);
  const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),fields=planFields(raw),hash=commandHash({id,version,...fields}),operation='membership-plan.revise';
  return businessTransaction(database,user.id,centerId,'plans.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const previous=await record(client,centerId,id);
    if(previous.version!==version)throw conflict('version-conflict');if(previous.archived_at)throw conflict('plan-archived');checkSession();
    await insertVersion(client,centerId,id,previous.revision+1,fields,user.id);
    await client.query('UPDATE centers.membership_plans SET current_revision=current_revision+1,version=version+1 WHERE center_id=$1 AND id=$2',[centerId,id]);
    const result={plan:membershipPlanDto(await record(client,centerId,id))};
    await businessAudit(client,centerId,user.id,operation,id,{revision:previous.revision+1});await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform});
}
export async function duplicateMembershipPlan(context,raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','priceVersionId','name','requestId']);
  const centerId=idField(raw.centerId),id=idField(raw.id),source=idField(raw.priceVersionId),requestId=requestField(raw.requestId),hash=commandHash({id,source,name:raw.name}),operation='membership-plan.duplicate';
  return businessTransaction(context.database,context.user.id,centerId,'plans.manage',async client=>{
    const replay=await commandReplay(client,centerId,context.user.id,operation,requestId,hash);if(replay)return replay;
    const {rows}=await client.query('SELECT * FROM centers.membership_plan_versions WHERE center_id=$1 AND plan_id=$2 AND id=$3',[centerId,id,source]);
    if(!rows.length)throw new CentersError(404,'not-found','not found');
    const row=rows[0],fields=planFields({name:raw.name,priceMinor:row.price_minor,currency:row.currency,intervalMonths:row.interval_months,priceIncludesTax:row.price_includes_tax,taxBasisPoints:row.tax_basis_points,proration:row.proration});
    const target='mp_'+commandHash([centerId,context.user.id,requestId]).slice(0,32);context.checkSession();
    await client.query('INSERT INTO centers.membership_plans(id,center_id) VALUES($1,$2)',[target,centerId]);await insertVersion(client,centerId,target,1,fields,context.user.id);
    const result={plan:membershipPlanDto(await record(client,centerId,target))};
    await businessAudit(client,centerId,context.user.id,operation,target,{sourceVersionId:source});await rememberCommand(client,centerId,context.user.id,operation,requestId,hash,result);context.checkSession();return result;
  },{platform});
}
export async function archiveMembershipPlan({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','version']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version);
  return businessTransaction(database,user.id,centerId,'plans.manage',async client=>{
    const previous=await record(client,centerId,id);if(previous.version!==version)throw conflict('version-conflict');if(previous.archived_at)throw conflict('plan-archived');checkSession();
    await client.query('UPDATE centers.membership_plans SET archived_at=NOW(),version=version+1 WHERE center_id=$1 AND id=$2',[centerId,id]);
    await businessAudit(client,centerId,user.id,'membership-plan.archive',id);checkSession();return {plan:membershipPlanDto(await record(client,centerId,id))};
  },{platform});
}
export function planListOptions(params) {
  const query=(params.get('query')||'').trim(),archived=params.get('archived')||'active',limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null;
  if(query.length>120||!['active','archived','all'].includes(archived)||!Number.isSafeInteger(limit)||limit<1||limit>100||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid plan list');
  return {query,archived,limit,cursor};
}
export async function listMembershipPlans(database,uid,centerId,{query,archived,limit,cursor},{platform=false}={}) {
  const scope=cursorScope(['membership-plans',uid,centerId,query,archived]),after=readCursor(cursor,scope),pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
  return businessTransaction(database,uid,centerId,'plans.manage',async client=>{
    const {rows}=await client.query(`SELECT ${projection} FROM centers.membership_plans p JOIN centers.membership_plan_versions v ON (v.center_id,v.plan_id,v.revision)=(p.center_id,p.id,p.current_revision)
      WHERE p.center_id=$1 AND ($2='' OR v.name ILIKE $3 ESCAPE '\\') AND ($4='all' OR ($4='active' AND p.archived_at IS NULL) OR ($4='archived' AND p.archived_at IS NOT NULL))
      AND ($5::timestamptz IS NULL OR (p.created_at,p.id)<($5::timestamptz,$6::text)) ORDER BY p.created_at DESC,p.id DESC LIMIT $7`,[centerId,query,pattern,archived,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit);return {plans:page.map(membershipPlanDto),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  },{platform,allowInactive:platform});
}
export function getMembershipPlan(database,uid,centerId,id,{platform=false}={}) {
  return businessTransaction(database,uid,centerId,'plans.manage',async client=>{
    const current=await record(client,centerId,id),{rows}=await client.query('SELECT v.*,p.version,p.archived_at FROM centers.membership_plan_versions v JOIN centers.membership_plans p ON (p.center_id,p.id)=(v.center_id,v.plan_id) WHERE v.center_id=$1 AND v.plan_id=$2 ORDER BY revision DESC',[centerId,id]);
    return {plan:membershipPlanDto(current),versions:rows.map(membershipPlanDto)};
  },{platform,allowInactive:platform});
}
