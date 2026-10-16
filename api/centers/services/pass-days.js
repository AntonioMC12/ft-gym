import {CentersError} from '../errors.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {passState} from '../domain/renewals.js';
export function passHistoryOptions(params){
 const query=(params.get('query')||'').trim(),status=params.get('status')||'all',cursor=params.get('cursor')||null,passId=params.get('passId')||null;
 if(query.length>120||/[\u0000-\u001f\u007f]/.test(query)||!['all','active','exhausted','expired'].includes(status)||cursor?.length>2000||passId&&!/^[a-zA-Z0-9_-]{1,64}$/.test(passId))throw new CentersError(400,'invalid-input','invalid history filter');
 return {query,status,cursor,passId};
}
export function registerPassDay({database,user,checkSession},raw,{platform=false}={}){
 objectBody(raw,['centerId','memberId','requestId']);const c=idField(raw.centerId),m=idField(raw.memberId),requestId=requestField(raw.requestId),operation='pass.day',hash=commandHash({memberId:m});
 return businessTransaction(database,user.id,c,'billing.manage',async client=>{
  const replay=await commandReplay(client,c,user.id,operation,requestId,hash);if(replay){checkSession();return replay}
  const member=await memberRecord(client,c,m),day=member.local_today;
  const {rows:contracts}=await client.query('SELECT id FROM centers.subscriptions WHERE center_id=$1 AND member_id=$2 AND canceled_at IS NULL LIMIT 1',[c,m]);
  if(contracts.length)throw new CentersError(409,'pass-only-required','daily use is only for pass-only members');
  const {rows:used}=await client.query('SELECT id,pass_id FROM centers.pass_consumptions WHERE center_id=$1 AND member_id=$2 AND used_on=$3 LIMIT 1',[c,m,day]);
  if(used.length){const result={alreadyUsed:true,usedOn:day,passId:used[0].pass_id};await rememberCommand(client,c,user.id,operation,requestId,hash,result);checkSession();return result}
  if(member.state!=='active'||member.joined_on>day||member.ends_on&&member.ends_on<=day)throw new CentersError(409,'pass-member-inactive','inactive member');
  const {rows}=await client.query('SELECT b.id,p.name FROM centers.pass_purchases b JOIN centers.pass_products p ON (p.center_id,p.id)=(b.center_id,b.product_id) WHERE b.center_id=$1 AND b.member_id=$2 AND centers.pass_available(b.center_id,b.member_id,b.id,$3) ORDER BY b.ends_on ASC NULLS LAST,b.created_at,b.id LIMIT 1',[c,m,day]);
  if(!rows.length)throw new CentersError(409,'pass-unavailable','no usable pass');const pass=rows[0],id='pu_'+commandHash([c,m,day]).slice(0,32);checkSession();
  const {rows:consumed}=await client.query('INSERT INTO centers.pass_consumptions(id,center_id,member_id,pass_id,actor_uid,used_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING used_on::text',[id,c,m,pass.id,user.id,day]);const usedOn=consumed[0].used_on;
  await businessAudit(client,c,user.id,operation,id,{memberId:m,passId:pass.id,usedOn});
  const {rows:balance}=await client.query('SELECT p.credits-(SELECT count(*)::int FROM centers.pass_consumptions u WHERE u.center_id=b.center_id AND u.pass_id=b.id) AS remaining FROM centers.pass_purchases b JOIN centers.pass_products p ON (p.center_id,p.id)=(b.center_id,b.product_id) WHERE b.center_id=$1 AND b.id=$2',[c,pass.id]);
  const result={alreadyUsed:false,usedOn,passId:pass.id,name:pass.name,remaining:balance[0].remaining};await rememberCommand(client,c,user.id,operation,requestId,hash,result);checkSession();return result;
 },{platform});
}
export function passHistory(database,uid,c,options,{platform=false}={}){
 return businessTransaction(database,uid,c,'billing.read',async client=>{
  const {query,status,cursor,passId}=options,scope=cursorScope(['pass-history',uid,c,query,status,passId]),after=readCursor(cursor,scope);
  if(passId){
   const {rows}=await client.query('SELECT id,pass_id,member_id,used_on::text,actor_uid,visit_id,created_at::text AS cursor_at FROM centers.pass_consumptions WHERE center_id=$1 AND pass_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) ORDER BY created_at DESC,id DESC LIMIT 31',[c,passId,after?.at||null,after?.id||null]);
   const page=rows.slice(0,30);return {uses:page.map(r=>({id:r.id,passId:r.pass_id,memberId:r.member_id,usedOn:r.used_on,actorUid:r.actor_uid,source:r.visit_id?'qr':'manual'})),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
  }
  const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
  const {rows}=await client.query(`SELECT * FROM (SELECT b.*,b.created_at::text AS cursor_at,b.starts_on::text,b.ends_on::text,p.name,p.credits,m.name AS member_name,m.member_number,
   (SELECT count(*)::int FROM centers.pass_consumptions u WHERE u.center_id=b.center_id AND u.pass_id=b.id) AS used,
   EXISTS(SELECT 1 FROM centers.pass_revocations r WHERE r.center_id=b.center_id AND r.pass_id=b.id) AS revoked,
   centers.pass_available(b.center_id,b.member_id,b.id,(statement_timestamp() AT TIME ZONE c.timezone)::date) AS available,
   (statement_timestamp() AT TIME ZONE c.timezone)::date::text AS today,
   CASE WHEN EXISTS(SELECT 1 FROM centers.pass_revocations r WHERE r.center_id=b.center_id AND r.pass_id=b.id) THEN 'revoked'
    WHEN p.credits<=(SELECT count(*) FROM centers.pass_consumptions u WHERE u.center_id=b.center_id AND u.pass_id=b.id) THEN 'exhausted'
    WHEN b.ends_on<=(statement_timestamp() AT TIME ZONE c.timezone)::date THEN 'expired'
    WHEN centers.pass_available(b.center_id,b.member_id,b.id,(statement_timestamp() AT TIME ZONE c.timezone)::date) THEN 'active' ELSE 'unavailable' END AS status
   FROM centers.pass_purchases b JOIN centers.pass_products p ON (p.center_id,p.id)=(b.center_id,b.product_id)
   JOIN centers.members m ON (m.center_id,m.id)=(b.center_id,b.member_id) JOIN centers.centers c ON c.id=b.center_id
   WHERE b.center_id=$1 AND ($2='' OR m.name ILIKE $3 ESCAPE '\\') AND ($4::timestamptz IS NULL OR (b.created_at,b.id)<($4::timestamptz,$5::text))) entries
   WHERE ($6='all' OR status=$6) ORDER BY created_at DESC,id DESC LIMIT 31`,[c,query,pattern,after?.at||null,after?.id||null,status]);
  const page=rows.slice(0,30);return {passes:page.map(r=>{const row={id:r.id,memberId:r.member_id,memberName:r.member_name,number:r.member_number,name:r.name,createdAt:r.created_at,startsOn:r.starts_on,endsOn:r.ends_on,credits:r.credits,used:r.used,remaining:r.credits-r.used,revoked:r.revoked,available:r.available};return {...row,status:passState(row,r.today)}}),nextCursor:rows.length>30?nextCursor(scope,page.at(-1)):null};
 },{platform,allowInactive:true});
}
