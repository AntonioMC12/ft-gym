import {randomBytes} from 'node:crypto';
import {CentersError} from '../errors.js';
import {objectBody,idField,versionField,requestField} from '../domain/validation.js';
import {trainingPlan,appliedTrainingDelivery} from '../domain/training-plan.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const missing=()=>{throw new CentersError(404,'not-found','not found')};
const conflict=code=>{throw new CentersError(409,code,'training proposal changed; reload')};
const opaque=prefix=>prefix+randomBytes(16).toString('hex');
const projection=`v.*,p.version,p.state AS proposal_state,p.current_revision,a.accepted_at,k.result AS delivery_result,k.acknowledged_at`;
const joins=`FROM centers.training_versions v JOIN centers.training_proposals p ON p.center_id=v.center_id AND p.id=v.proposal_id
  LEFT JOIN centers.training_acceptances a ON a.version_id=v.id AND a.recipient_uid=v.recipient_uid
  LEFT JOIN centers.training_delivery_acks k ON k.version_id=v.id AND k.recipient_uid=v.recipient_uid`;
function dto(row,{own=false,content=false}={}){
  const result={id:row.proposal_id,version:row.version,versionId:row.id,revision:row.revision,state:row.state,proposalState:row.proposal_state,
    name:row.bundle.name,unit:row.bundle.unit,routineCount:row.bundle.routines.length,exerciseCount:row.bundle.routines.reduce((n,r)=>n+r.ex.length,0),
    createdAt:row.created_at,acceptedAt:row.accepted_at||null,deliveryResult:row.delivery_result||null,acknowledgedAt:row.acknowledged_at||null};
  if(!own)result.memberId=row.member_id;
  if(content){result.bundle=row.bundle;result.deliveryKey=row.delivery_key;result.routineIds=row.routine_ids}
  return result;
}
async function record(client,centerId,id,{own=false,uid,versionId=null}={}){
  const {rows}=await client.query(`SELECT ${projection} ${joins} WHERE v.center_id=$1 AND p.id=$2
    AND ($3::text IS NULL AND v.revision=p.current_revision OR v.id=$3)
    AND (NOT $4::boolean OR (v.recipient_uid=$5 AND centers.owns_member(v.center_id,v.member_id)))`,[centerId,id,versionId,own,uid||'']);
  return rows[0]||missing();
}
async function linkedMember(client,centerId,memberId,recipient=null){
  const member=await memberRecord(client,centerId,memberId);
  if(!member.account_uid)conflict('training-account-required');
  if(recipient&&member.account_uid!==recipient)missing();
  if(member.state!=='active'||member.joined_on>member.local_today||(member.ends_on&&member.ends_on<=member.local_today))conflict('training-member-inactive');
  return member;
}
async function insertVersion(client,centerId,proposalId,memberId,recipient,revision,bundle,uid){
  const routineIds=Object.fromEntries(bundle.routines.map(row=>[row.id,opaque('cr_')])),id=opaque('tv_');
  await client.query(`INSERT INTO centers.training_versions(id,center_id,proposal_id,member_id,recipient_uid,revision,actor_uid,delivery_key,bundle,bundle_hash,routine_ids)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,centerId,proposalId,memberId,recipient,revision,uid,opaque('td_'),JSON.stringify(bundle),commandHash(bundle),JSON.stringify(routineIds)]);
}
export function proposeTraining({database,user,checkSession,hasTrainingExercise},raw,{platform=false,revise=false}={}){
  objectBody(raw,revise?['centerId','id','version','bundle','requestId']:['centerId','memberId','memberVersion','bundle','requestId']);
  const centerId=idField(raw.centerId),requestId=requestField(raw.requestId),bundle=trainingPlan(raw.bundle,hasTrainingExercise),id=revise?idField(raw.id):null,
    version=versionField(revise?raw.version:raw.memberVersion),memberId=revise?null:idField(raw.memberId),operation=revise?'training.revise':'training.propose',hash=commandHash({id,memberId,version,bundle});
  return businessTransaction(database,user.id,centerId,'training.assign',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay){await record(client,centerId,replay.proposal.id);return replay}
    let target=id,revision=1,recipient,member;
    if(revise){
      const previous=await record(client,centerId,id);if(previous.version!==version)conflict('version-conflict');if(previous.proposal_state!=='offered')conflict('training-proposal-unavailable');
      member=await linkedMember(client,centerId,previous.member_id,previous.recipient_uid);recipient=previous.recipient_uid;revision=previous.current_revision+1;
      checkSession();await client.query("UPDATE centers.training_versions SET state='superseded' WHERE center_id=$1 AND proposal_id=$2 AND revision=$3 AND state='offered'",[centerId,id,previous.current_revision]);
    }else{
      // The center advisory lock already serializes membership changes. A trainer
      // must not need UPDATE permission on the member just to offer a routine.
      member=await linkedMember(client,centerId,memberId);if(member.version!==version)conflict('version-conflict');recipient=member.account_uid;target=opaque('tp_');
      checkSession();await client.query('INSERT INTO centers.training_proposals(id,center_id,member_id,recipient_uid,actor_uid) VALUES($1,$2,$3,$4,$5)',[target,centerId,member.id,recipient,user.id]);
    }
    await insertVersion(client,centerId,target,member.id,recipient,revision,bundle,user.id);
    await client.query(`UPDATE centers.training_proposals SET current_revision=$3,version=version+$4 WHERE center_id=$1 AND id=$2`,[centerId,target,revision,revise?1:0]);
    const result={proposal:dto(await record(client,centerId,target),{content:true})};
    await businessAudit(client,centerId,user.id,operation,target,{revision});await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform});
}
export function withdrawTraining({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','id','version','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),operation='training.withdraw',hash=commandHash({id,version});
  return businessTransaction(database,user.id,centerId,'training.assign',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const previous=await record(client,centerId,id);if(previous.version!==version)conflict('version-conflict');if(previous.proposal_state!=='offered'||previous.accepted_at)conflict('training-proposal-unavailable');
    checkSession();await client.query("UPDATE centers.training_versions SET state='withdrawn' WHERE center_id=$1 AND id=$2",[centerId,previous.id]);
    await client.query("UPDATE centers.training_proposals SET state='withdrawn',version=version+1 WHERE center_id=$1 AND id=$2",[centerId,id]);
    const result={proposal:dto(await record(client,centerId,id))};await businessAudit(client,centerId,user.id,operation,id);await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform});
}
export function trainingListOptions(params,{own=false}={}){
  if([...params.keys()].some(key=>!['centerId','limit','cursor',...(own?[]:['memberId'])].includes(key)))throw new CentersError(400,'invalid-input','invalid training selectors');
  const limit=Number(params.get('limit')||20),cursor=params.get('cursor')||null,memberId=params.has('memberId')?idField(params.get('memberId')):null;
  if(!Number.isSafeInteger(limit)||limit<1||limit>50||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid training page');
  return {limit,cursor,memberId};
}
export function listTraining(database,uid,centerId,{limit=20,cursor=null,memberId=null}={}, {own=false,platform=false}={}){
  const scope=cursorScope(['training',own,uid,centerId,memberId]),after=readCursor(cursor,scope);
  return businessTransaction(database,uid,centerId,own?'training.own.read':'training.assign',async client=>{
    if(memberId)await memberRecord(client,centerId,memberId);
    const {rows}=await client.query(`SELECT ${projection},v.created_at::text AS cursor_at,v.id AS cursor_id ${joins}
      WHERE v.center_id=$1 AND (v.revision=p.current_revision OR ($3::boolean AND a.accepted_at IS NOT NULL AND k.result IS NULL)) AND ($2::text IS NULL OR v.member_id=$2)
      AND (NOT $3::boolean OR (v.recipient_uid=$4 AND centers.owns_member(v.center_id,v.member_id)))
      AND ($5::timestamptz IS NULL OR (v.created_at,v.id)<($5::timestamptz,$6::text)) ORDER BY v.created_at DESC,v.id DESC LIMIT $7`,[centerId,memberId,own,uid,after?.at||null,after?.id||null,limit+1]);
    const page=rows.slice(0,limit);return {proposals:page.map(row=>dto(row,{own})),nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
  },{platform:!own&&platform,allowInactive:true});
}
export function getTraining(database,uid,centerId,id,{own=false,platform=false,versionId=null}={}){
  return businessTransaction(database,uid,centerId,own?'training.own.read':'training.assign',async client=>({proposal:dto(await record(client,centerId,id,{own,uid,versionId}),{own,content:true})}),{platform:!own&&platform,allowInactive:true});
}
export function acceptTraining({database,user,checkSession},raw){
  objectBody(raw,['centerId','id','versionId','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),versionId=idField(raw.versionId),requestId=requestField(raw.requestId),hash=commandHash({id,versionId});
  return businessTransaction(database,user.id,centerId,'training.own.read',async(client,context)=>{
    let row=await record(client,centerId,id,{own:true,uid:user.id,versionId});
    const replay=await commandReplay(client,centerId,user.id,'training.accept',requestId,hash);
    if(!row.accepted_at){
      if(context.center.state!=='active')conflict('center-inactive');
      if(row.state!=='offered'||row.proposal_state!=='offered'||row.revision!==row.current_revision)conflict('training-proposal-unavailable');
      await linkedMember(client,centerId,row.member_id,user.id);checkSession();
      await client.query('INSERT INTO centers.training_acceptances(center_id,version_id,member_id,recipient_uid) VALUES($1,$2,$3,$4)',[centerId,row.id,row.member_id,user.id]);
      await businessAudit(client,centerId,user.id,'training.accept',row.id);
      row=await record(client,centerId,id,{own:true,uid:user.id,versionId});
    }
    if(!replay)await rememberCommand(client,centerId,user.id,'training.accept',requestId,hash,{versionId});
    checkSession();return {proposal:dto(row,{own:true,content:true})};
  },{allowInactive:true});
}
export function acknowledgeTraining({database,user,checkSession,accountLocks,readOwnTraining},raw){
  objectBody(raw,['centerId','id','versionId','requestId']);const centerId=idField(raw.centerId),id=idField(raw.id),versionId=idField(raw.versionId),requestId=requestField(raw.requestId),hash=commandHash({id,versionId});
  if(!accountLocks||!readOwnTraining)throw new CentersError(503,'training-state-unavailable','personal training is unavailable');
  return accountLocks.withAccounts([user.id],()=>businessTransaction(database,user.id,centerId,'training.own.read',async client=>{
    const row=await record(client,centerId,id,{own:true,uid:user.id,versionId});if(!row.accepted_at)conflict('training-not-accepted');
    const replay=await commandReplay(client,centerId,user.id,'training.ack',requestId,hash);
    if(!row.delivery_result){
      const result=appliedTrainingDelivery(readOwnTraining(user.id),{deliveryKey:row.delivery_key,acceptedAt:row.accepted_at instanceof Date?row.accepted_at.toISOString():row.accepted_at,routineIds:row.routine_ids});
      if(!result)conflict('training-not-synced');checkSession();
      await client.query('INSERT INTO centers.training_delivery_acks(center_id,version_id,member_id,recipient_uid,result) VALUES($1,$2,$3,$4,$5)',[centerId,row.id,row.member_id,user.id,result]);
      await businessAudit(client,centerId,user.id,'training.ack',row.id,{result});
    }
    if(!replay)await rememberCommand(client,centerId,user.id,'training.ack',requestId,hash,{versionId});
    checkSession();return {proposal:dto(await record(client,centerId,id,{own:true,uid:user.id,versionId}),{own:true})};
  },{allowInactive:true}));
}
