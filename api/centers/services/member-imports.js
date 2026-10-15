import {CentersError} from '../errors.js';
import {parseMemberCsv} from '../domain/member-csv.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {businessTransaction} from './context.js';
import {commandHash,businessAudit} from './commands.js';

const error=code=>new CentersError(409,code,'member import requires review');
async function reviewed(client,centerId,records){
  // Canonical identity keys are computed by PostgreSQL with the exact expressions
  // of the member unique constraints (rather than a subtly different JS regexp).
  const {rows:keys}=await client.query(`WITH incoming AS(
    SELECT (entry->>'record')::integer AS record,lower(nullif(btrim(entry->'fields'->>'email'),'')) AS email_key,
      nullif(upper(regexp_replace(entry->'fields'->>'nationalDocument','[[:space:]-]','','g')),'') AS document_key
    FROM jsonb_array_elements($2::jsonb)entry)
    SELECT i.*,EXISTS(SELECT 1 FROM centers.members m WHERE m.center_id=$1 AND
      (i.email_key IS NOT NULL AND m.email_key=i.email_key OR i.document_key IS NOT NULL AND m.document_key=i.document_key)) AS existing
    FROM incoming i ORDER BY i.record`,[centerId,JSON.stringify(records)]);
  const emails=new Set(),documents=new Set();
  return records.map((row,i)=>{
    if(row.error)return {...row,status:'error'};
    const key=keys[i];let reason=key.existing?'duplicate-existing':emails.has(key.email_key)||documents.has(key.document_key)?'duplicate-file':null;
    if(!reason){if(key.email_key)emails.add(key.email_key);if(key.document_key)documents.add(key.document_key)}
    return {...row,status:reason?'skipped':'ready',reason};
  });
}
const summary=rows=>({total:rows.length,ready:rows.filter(r=>r.status==='ready').length,skipped:rows.filter(r=>r.status==='skipped').length,errors:rows.filter(r=>r.status==='error').length});
async function dto(client,job){
  const {rows:[clock]}=await client.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[job.expires_at]);
  if(job.state==='completed')return {id:job.id,state:'completed',definitionVersion:1,result:job.result,completedAt:job.completed_at};
  if(job.state==='expired'||clock.expired)return {id:job.id,state:'expired',definitionVersion:1,expiresAt:job.expires_at,rows:[]};
  const rows=await reviewed(client,job.center_id,job.records);
  return {id:job.id,state:clock.expired?'expired':'prepared',definitionVersion:1,duplicatePolicy:'skip',expiresAt:job.expires_at,
    reviewHash:commandHash(rows),summary:summary(rows),rows};
}
async function readJob(client,centerId,uid,id){
  const {rows}=await client.query('SELECT * FROM centers.member_import_jobs WHERE center_id=$1 AND actor_uid=$2 AND id=$3 FOR UPDATE',[centerId,uid,id]);
  if(!rows.length)throw new CentersError(404,'not-found','not found');return rows[0];
}
export async function prepareMemberImport({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','csv','duplicatePolicy','requestId']);
  const centerId=idField(raw.centerId),requestId=requestField(raw.requestId);
  if(raw.duplicatePolicy!=='skip')throw new CentersError(400,'invalid-member-csv','explicit duplicate policy required');
  const records=parseMemberCsv(raw.csv),hash=commandHash({csv:raw.csv,duplicatePolicy:'skip'}),id='mi_'+commandHash([centerId,user.id,requestId]).slice(0,32);
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const previous=await client.query('SELECT * FROM centers.member_import_jobs WHERE center_id=$1 AND actor_uid=$2 AND request_id=$3',[centerId,user.id,requestId]);
    if(previous.rows.length){if(previous.rows[0].input_hash!==hash)throw error('idempotency-conflict');return dto(client,previous.rows[0])}
    checkSession();
    const {rows:[job]}=await client.query('INSERT INTO centers.member_import_jobs(id,center_id,actor_uid,request_id,input_hash,records) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id,centerId,user.id,requestId,hash,JSON.stringify(records)]);
    await businessAudit(client,centerId,user.id,'members.import.prepared',id,{rows:records.length});
    checkSession();return dto(client,job);
  },{platform});
}
export function getMemberImport(database,uid,centerId,id,{platform=false}={}){
  return businessTransaction(database,uid,centerId,'members.manage',async client=>dto(client,await readJob(client,centerId,uid,id)),{platform,allowInactive:true});
}
export function commitMemberImport({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','id','reviewHash']);
  const centerId=idField(raw.centerId),id=idField(raw.id),hash=raw.reviewHash;
  if(typeof hash!=='string'||!/^([a-f0-9]{64})$/.test(hash))throw new CentersError(400,'invalid-input','valid review hash required');
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const job=await readJob(client,centerId,user.id,id);
    if(job.state==='completed'){if(job.review_hash!==hash)throw error('idempotency-conflict');return dto(client,job)}
    if(context.center.state!=='active')throw new CentersError(409,'center-inactive','center is not active');
    const review=await dto(client,job);
    if(review.state==='expired')throw error('import-expired');
    if(review.reviewHash!==hash)throw error('import-review-changed');
    if(review.summary.errors)throw error('import-invalid-rows');
    const eligible=review.rows.filter(row=>row.status==='ready');
    const {rows:[sequence]}=await client.query("SELECT (coalesce(max(substring(member_number from '^M-([0-9]+)$')::numeric),0)+1)::text AS next FROM centers.members WHERE center_id=$1",[centerId]);
    const start=BigInt(sequence.next),insert=eligible.map((row,i)=>({id:'m_'+commandHash([job.id,row.record]).slice(0,32),number:'M-'+String(start+BigInt(i)).padStart(6,'0'),...row.fields}));
    if(insert.some(row=>row.number.length>40))throw error('member-number-exhausted');
    checkSession();
    if(insert.length){
      await client.query(`INSERT INTO centers.members(id,center_id,member_number,name,email,phone,national_document,joined_on)
        SELECT r.id,$1,r.number,r.name,r.email,r.phone,r."nationalDocument",(statement_timestamp() AT TIME ZONE c.timezone)::date
        FROM jsonb_to_recordset($2::jsonb) AS r(id text,number text,name text,email text,phone text,"nationalDocument" text) CROSS JOIN centers.centers c WHERE c.id=$1`,[centerId,JSON.stringify(insert)]);
      await client.query(`INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id,details)
        SELECT $1,$2,'member.created',r.id,jsonb_build_object('source','csv','importId',$3::text) FROM jsonb_to_recordset($4::jsonb) AS r(id text)`,[centerId,user.id,id,JSON.stringify(insert)]);
    }
    let next=0;const result={total:review.rows.length,imported:insert.length,skipped:review.summary.skipped,
      rows:review.rows.map(row=>row.status==='ready'?{record:row.record,line:row.line,status:'imported',memberId:insert[next++].id}:{record:row.record,line:row.line,status:'skipped',reason:row.reason})};
    const {rows:[completed]}=await client.query("UPDATE centers.member_import_jobs SET state='completed',records=NULL,result=$4,review_hash=$5 WHERE center_id=$1 AND actor_uid=$2 AND id=$3 RETURNING *",[centerId,user.id,id,JSON.stringify(result),hash]);
    await businessAudit(client,centerId,user.id,'members.import.completed',id,{imported:result.imported,skipped:result.skipped});
    checkSession();return dto(client,completed);
  },{platform,allowInactive:true});
}
