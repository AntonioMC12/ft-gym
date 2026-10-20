import {feeSummary,contractFeeAccess} from './renewals.js';
import { createHash } from 'node:crypto';
import { CentersError } from '../errors.js';
import { memberDto } from '../authz.js';
import { businessTransaction } from './context.js';
import { MEMBER_PROJECTION as projection, memberRecord } from './member-records.js';
import { membershipHistory } from './membership-lifecycle.js';
import { objectBody, idField, requestField, versionField } from '../domain/validation.js';
import { memberFields } from '../domain/member-validation.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const conflict=code=>new CentersError(409,code,'member changed; reload it');
const audit=(client,centerId,uid,action,id)=>client.query('INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id) VALUES($1,$2,$3,$4)',[centerId,uid,action,id]);

export async function createMember({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','name','email','phone','nationalDocument','requestId']);
  const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),fields=memberFields(raw);
  const hash=createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const id='m_'+createHash('sha256').update(`${centerId}:${user.id}:${requestId}`).digest('hex').slice(0,32);
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const {rows:previous}=await client.query("SELECT body_hash,result FROM centers.idempotency_records WHERE center_id=$1 AND actor_uid=$2 AND operation='member.create' AND request_id=$3",[centerId,user.id,requestId]);
    if(previous.length){if(previous[0].body_hash!==hash)throw conflict('idempotency-conflict');return previous[0].result;}
    // The shared center advisory lock serializes number allocation and permission changes.
    // Numeric arithmetic avoids overflow when existing data contains a large member number.
    const {rows:sequence}=await client.query("SELECT COALESCE(MAX(substring(member_number from '^M-([0-9]+)$')::numeric),0)+1 AS next FROM centers.members WHERE center_id=$1",[centerId]);
    const number='M-'+sequence[0].next.toString().padStart(6,'0');
    if(number.length>40)throw conflict('member-number-exhausted');
    checkSession();
    const {rows}=await client.query(`INSERT INTO centers.members(id,center_id,member_number,name,email,phone,national_document,joined_on)
      SELECT $1,$2,$3,$4,$5,$6,$7,(statement_timestamp() AT TIME ZONE c.timezone)::date FROM centers.centers c WHERE c.id=$2
      RETURNING ${projection}`,[id,centerId,number,fields.name,fields.email,fields.phone,fields.nationalDocument]);
    const result={member:memberDto(rows[0],context.capabilities)};
    await audit(client,centerId,user.id,'member.created',id);
    await client.query("INSERT INTO centers.idempotency_records(center_id,actor_uid,operation,request_id,body_hash,result) VALUES($1,$2,'member.create',$3,$4,$5)",[centerId,user.id,requestId,hash,JSON.stringify(result)]);
    checkSession();return result;
  },{platform});
}

export async function updateMember({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','version','name','email','phone','nationalDocument']);
  const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),fields=memberFields(raw);
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const {rows:old}=await client.query('SELECT version FROM centers.members WHERE center_id=$1 AND id=$2 FOR UPDATE',[centerId,id]);
    if(!old.length)throw new CentersError(404,'not-found','not found');
    if(old[0].version!==version)throw conflict('version-conflict');
    checkSession();
    await client.query(`UPDATE centers.members SET name=$3,email=$4,phone=$5,national_document=$6,version=version+1,updated_at=NOW()
      WHERE center_id=$1 AND id=$2`,[centerId,id,fields.name,fields.email,fields.phone,fields.nationalDocument]);
    const {rows}=await client.query(`SELECT ${projection} FROM centers.member_profiles WHERE center_id=$1 AND id=$2`,[centerId,id]);
    await audit(client,centerId,user.id,'member.updated',id);checkSession();
    return {member:memberDto(rows[0],context.capabilities)};
  },{platform});
}

export function getMember(database,uid,centerId,id,{platform=false}={}) {
  return businessTransaction(database,uid,centerId,'members.read',async(client,context)=>{
    const member=await memberRecord(client,centerId,id);
    return {member:memberDto(member,context.capabilities),...await membershipHistory(client,context,member)};
  },{platform,allowInactive:platform});
}
export async function listMembers(database,uid,centerId,{query,state,limit,cursor,unlinked=false,account='',feeStatus=''},{platform=false}={}) {
  const scope=cursorScope([uid,centerId,query,state,unlinked,account,feeStatus]),after=readCursor(cursor,scope);
  return businessTransaction(database,uid,centerId,'members.read',async(client,context)=>{
    if(account&&!context.capabilities.includes('members.read'))throw new CentersError(403,'forbidden','forbidden');
    if(feeStatus&&!context.capabilities.includes('billing.read'))throw new CentersError(403,'forbidden','forbidden');
    const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const normalized=query.toUpperCase().replace(/[ .-]/g,'');
    const documentPattern='%'+normalized.replace(/[\\%_]/g,'\\$&')+'%';
    let feeMembers=null;
    if(feeStatus){
      // Bulk source data only: no feeSummary call per directory candidate.
      const {rows:candidates}=await client.query(`SELECT m.id,m.ends_on::text,m.local_today::text,s.anchor_on::text,s.starts_on::text,s.ends_on::text AS contract_end,s.billing_day,v.interval_months,s.id AS subscription_id,
        (SELECT max(CASE WHEN v.interval_months=1 THEN (date_trunc('month',r.period_start)+interval '1 month')::date ELSE r.period_end END)::text FROM centers.receipts r WHERE r.center_id=m.center_id AND r.member_id=m.id AND r.subscription_id=s.id AND r.period_start<=m.local_today AND r.total_minor=coalesce((SELECT sum(a.amount_minor) FROM centers.payment_allocations a WHERE a.center_id=r.center_id AND a.receipt_id=r.id),0)-coalesce((SELECT sum(f.amount_minor) FROM centers.refunds f WHERE f.center_id=r.center_id AND f.receipt_id=r.id),0)) AS paid_until,
        (SELECT max(CASE WHEN v.interval_months=1 THEN (date_trunc('month',r.period_start)+interval '1 month')::date ELSE r.period_end END)::text FROM centers.renewals r WHERE r.center_id=m.center_id AND r.member_id=m.id AND r.subscription_id=s.id AND r.period_start<=m.local_today AND r.receipt_id IS NULL) AS renewed_until
        FROM centers.member_profiles m JOIN LATERAL(SELECT * FROM centers.subscriptions c WHERE c.center_id=m.center_id AND c.member_id=m.id AND c.canceled_at IS NULL ORDER BY (c.starts_on<=m.local_today) DESC,c.starts_on DESC,c.created_at DESC LIMIT 1)s ON true
        JOIN centers.membership_plan_versions v ON (v.center_id,v.id)=(s.center_id,s.price_version_id) WHERE m.center_id=$1`,[centerId]);
      feeMembers=candidates.filter(row=>{const status=contractFeeAccess(row,{...row,ends_on:row.contract_end},row.paid_until,row.renewed_until).status;return feeStatus==='current'?['active','grace'].includes(status):status==='expired'}).map(row=>row.id);
    }
    const {rows:result}=await client.query(`WITH filtered AS MATERIALIZED (SELECT ${projection},created_at::text AS cursor_at FROM centers.member_profiles
      WHERE center_id=$1 AND ($2='' OR name ILIKE $3 ESCAPE '\\' OR member_number ILIKE $3 ESCAPE '\\' OR ($9::boolean AND $10<>'' AND regexp_replace(upper(coalesce(national_document,'')),'[ .-]','','g') LIKE $10 ESCAPE '\\'))
        AND ($4='' OR state=$4) AND (NOT $8::boolean OR account_uid IS NULL)
        AND ($11='' OR ($11='linked')=(account_uid IS NOT NULL)) AND ($12::text[] IS NULL OR id=ANY($12)))
      SELECT (SELECT count(*)::int FROM filtered) AS total,coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.cursor_at::timestamptz DESC,p.id DESC) FROM (SELECT * FROM filtered WHERE ($5::timestamptz IS NULL OR (cursor_at::timestamptz,id)<($5::timestamptz,$6::text)) ORDER BY cursor_at::timestamptz DESC,id DESC LIMIT $7)p),'[]'::jsonb) AS page`,[centerId,query,pattern,state,after?.at||null,after?.id||null,limit+1,unlinked,context.capabilities.includes('members.read'),normalized?documentPattern:'',account,feeMembers]);
    const rows=result[0].page,page=rows.slice(0,limit),last=page.at(-1);
    const members=[];for(const row of page){const dto=memberDto(row,context.capabilities);if(context.capabilities.includes('billing.read'))dto.fee=await feeSummary(client,centerId,await memberRecord(client,centerId,row.id));members.push(dto)}
    return {members,total:result[0].total,nextCursor:rows.length>limit?nextCursor(scope,last):null};
  },{platform,allowInactive:platform});
}
