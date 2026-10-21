import {normalizeNationalDocument,validNationalDocument} from '../domain/national-document.js';
import {randomUUID} from 'node:crypto';
import {CentersError} from '../errors.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {objectBody,idField,versionField,requestField} from '../domain/validation.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
const fail=(code,status=409)=>{throw new CentersError(status,code,'activation requires review')};
export async function registrationCenter(database,id){
 const centerId=idField(id);return database.accountTransaction('registration',async client=>{const {rows}=await client.query('SELECT * FROM centers.registration_center($1)',[centerId]);if(!rows.length)fail('registration-center-unavailable',404);return rows[0]});
}
export async function requestActivation(database,user,raw,{accountLocks,checkSession=()=>{},newAccount=false,documentMatches}){
 objectBody(raw,['centerId','nationalDocument']);const document=raw.nationalDocument===undefined?null:normalizeNationalDocument(raw.nationalDocument);if(document!==null&&!validNationalDocument(raw.nationalDocument))fail('national-document-invalid',400);if(document&&documentMatches&&!documentMatches(user,document))fail('national-document-invalid',400);const centerId=idField(raw.centerId);await registrationCenter(database,centerId);
 return accountLocks.withAccounts([user.id],()=>database.accountTransaction(user.id,async client=>{
  checkSession();
  const {rows:linked}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,user.id]);if(linked.length)return {status:'approved'};
  const {rows}=await client.query(`INSERT INTO centers.activation_requests(id,center_id,account_uid,national_document) VALUES($1,$2,$3,$4) ON CONFLICT(center_id,account_uid) DO NOTHING RETURNING status`,[randomUUID(),centerId,user.id,document]);
  checkSession();return {status:rows[0]?.status||(await client.query('SELECT status FROM centers.activation_requests WHERE center_id=$1 AND account_uid=$2',[centerId,user.id])).rows[0].status};
 }),{requireExisting:!newAccount});
}
export async function ownActivations(database,uid){
 return database.accountTransaction(uid,async client=>({requests:(await client.query('SELECT id,center_id AS "centerId",status FROM centers.activation_requests WHERE account_uid=$1 ORDER BY created_at DESC LIMIT 50',[uid])).rows}));
}
async function documentMatch(client,centerId,document){
 if(!document)return {documentMatch:'legacy',matchedMember:null}
 const pending=await client.query("SELECT id FROM centers.activation_requests WHERE center_id=$1 AND national_document=$2 AND status='pending' LIMIT 2",[centerId,document]);
 if(pending.rows.length>1)return {documentMatch:'duplicate',matchedMember:null}
 const {rows}=await client.query(`SELECT id,name,member_number,version,account_uid FROM centers.members WHERE center_id=$1 AND regexp_replace(upper(national_document),'[ .-]','','g')=$2 ORDER BY id LIMIT 2`,[centerId,document])
 if(rows.length>1)return {documentMatch:'duplicate',matchedMember:null}
 if(!rows.length)return {documentMatch:'none',matchedMember:null}
 const m=rows[0]
 return m.account_uid?{documentMatch:'linked',matchedMember:null}:{documentMatch:'unique',matchedMember:{id:m.id,name:m.name,number:m.member_number,version:m.version,accountLinked:false}}
}
export function listActivations(database,user,centerId,params,directory,{platform=false}={}){
 centerId=idField(centerId);
 const query=(params.get('query')||'').trim().toLowerCase(),limit=20;if(query.length>120||[...params.keys()].some(k=>!['centerId','query','cursor'].includes(k)))fail('invalid-input',400);
 const scope=cursorScope(['activations',user.id,centerId,query]),after=readCursor(params.get('cursor'),scope);
 const matches=directory.filter(a=>!a.disabled&&[a.name,a.email,a.id].some(v=>String(v||'').toLowerCase().includes(query))).map(a=>a.id),accounts=new Map(directory.map(a=>[a.id,a]));
 return businessTransaction(database,user.id,centerId,'members.manage',async client=>{
  const {rows}=await client.query(`SELECT *,created_at::text AS cursor_at FROM centers.activation_requests WHERE center_id=$1 AND status='pending' AND ($2='' OR account_uid=ANY($3::text[])) AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::text)) ORDER BY created_at DESC,id DESC LIMIT $6`,[centerId,query,matches,after?.at||null,after?.id||null,limit+1]);
  return {requests:await Promise.all(rows.slice(0,limit).map(async r=>({...(await documentMatch(client,centerId,r.national_document)),id:r.id,version:r.version,accountUid:r.account_uid,name:accounts.get(r.account_uid)?.name||r.account_uid,email:accounts.get(r.account_uid)?.email||null,disabled:!accounts.has(r.account_uid)||!!accounts.get(r.account_uid)?.disabled,createdAt:r.created_at}))),nextCursor:rows.length>limit?nextCursor(scope,rows[limit-1]):null};
 },{platform});
}
export function decideActivation({database,user,checkSession,accountLocks,lookupAccount},raw,{platform=false}={}){
 objectBody(raw,['centerId','id','version','memberId','memberVersion','requestId','reject']);
 const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),reject=raw.reject===true;
 if(raw.reject!==undefined&&typeof raw.reject!=='boolean')fail('invalid-input',400);
 const memberId=reject?null:idField(raw.memberId),memberVersion=reject?null:versionField(raw.memberVersion),hash=commandHash({id,version,memberId,memberVersion,reject});
 return businessTransaction(database,user.id,centerId,'members.manage',async client=>{
  const replay=await commandReplay(client,centerId,user.id,'activation.decide',requestId,hash);if(replay)return replay;
  const row=(await client.query('SELECT * FROM centers.activation_requests WHERE center_id=$1 AND id=$2 FOR UPDATE',[centerId,id])).rows[0];if(!row)fail('not-found',404);
  if(row.status!=='pending'||row.version!==version)fail('activation-changed');
  return accountLocks.withAccounts([user.id,row.account_uid],async()=>{
   const account=lookupAccount(row.account_uid);if(!reject&&(!account||account.disabled))fail('activation-account-unavailable');
   if(!reject){
    const match=await documentMatch(client,centerId,row.national_document);
    if(['duplicate','linked'].includes(match.documentMatch)||match.matchedMember&&match.matchedMember.id!==memberId)fail('activation-document-changed');
    const member=await memberRecord(client,centerId,memberId,{version:memberVersion});
    if(member.account_uid)fail('account-linked');
    if((await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,row.account_uid])).rows.length)fail('account-linked');
    checkSession();await client.query('UPDATE centers.members SET account_uid=$3,version=version+1,updated_at=clock_timestamp() WHERE center_id=$1 AND id=$2',[centerId,memberId,row.account_uid]);
    const revoked=await client.query("UPDATE centers.invitations SET status='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE center_id=$1 AND member_id=$2 AND status='pending' RETURNING id",[centerId,memberId]);
    for(const invite of revoked.rows)await businessAudit(client,centerId,user.id,'invitation.revoked',invite.id);
   }
   checkSession();await client.query(`UPDATE centers.activation_requests SET status=$3,member_id=$4,decided_at=clock_timestamp(),decided_by=$5,version=version+1 WHERE center_id=$1 AND id=$2`,[centerId,id,reject?'rejected':'approved',memberId,user.id]);
   await businessAudit(client,centerId,user.id,reject?'activation.rejected':'activation.approved',id,{memberId});
   const result={status:reject?'rejected':'approved',memberId};await rememberCommand(client,centerId,user.id,'activation.decide',requestId,hash,result);checkSession();return result;
  });
 },{platform});
}

// Caller must enforce the explicit platform allowlist. No member identity leaves this summary.
export function platformActivationSummary(database,uid){
 return database.platformTransaction(uid,async client=>{
  const {rows}=await client.query(`WITH pending AS (
   SELECT a.id,a.center_id,c.name,a.created_at FROM centers.activation_requests a
   JOIN centers.centers c ON c.id=a.center_id WHERE a.status='pending' AND c.state='active'
  ) SELECT count(*)::int AS total,
   (SELECT json_build_object('id',center_id,'name',name) FROM pending ORDER BY created_at,id LIMIT 1) AS center FROM pending`)
  return rows[0]
 })
}
