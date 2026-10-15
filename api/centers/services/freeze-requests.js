import {CentersError} from '../errors.js';
import {objectBody,idField,versionField,requestField,textField} from '../domain/validation.js';
import {freezePolicy,freezeRequest} from '../domain/freeze-requests.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {transitionMemberInTransaction} from './membership-lifecycle.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';

const conflict=code=>{throw new CentersError(409,code,'freeze request requires current review')};
const missing=()=>{throw new CentersError(404,'not-found','not found')};
const projection='*,effective_on::text,resume_on::text';
const dto=row=>({id:row.id,memberId:row.member_id,state:row.state,version:row.version,effectiveOn:row.effective_on,resumeOn:row.resume_on,
  reason:row.reason,policyVersion:row.policy_version,billingEffect:row.policy_snapshot.billingEffect,createdAt:row.created_at,
  decisionReason:row.decision_reason,decidedAt:row.decided_at,changeId:row.change_id});
async function policyRecord(client,centerId){
  const {rows}=await client.query('SELECT config,version FROM centers.freeze_policies WHERE center_id=$1',[centerId]);
  return rows[0]||{config:{enabled:false},version:0};
}
async function ownMember(client,centerId,uid){
  const {rows}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid]);
  if(!rows.length)missing();return memberRecord(client,centerId,rows[0].id);
}
async function requestRecord(client,centerId,id){
  const {rows}=await client.query(`SELECT ${projection} FROM centers.freeze_requests WHERE center_id=$1 AND id=$2 FOR UPDATE`,[centerId,id]);
  return rows[0]||missing();
}
async function validateDates(client,centerId,member,input,policy){
  if(member.state!=='active')conflict('invalid-transition');
  const {rows:[clock]}=await client.query('SELECT (statement_timestamp() AT TIME ZONE timezone)::date::text AS today FROM centers.centers WHERE id=$1',[centerId]);
  const plan=freezeRequest(input,policy,{today:clock.today});
  if(plan.effectiveOn<member.joined_on||member.ends_on&&plan.resumeOn>member.ends_on)conflict('freeze-limits');
  const pending=await client.query('SELECT id FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2 AND canceled_at IS NULL AND effective_on>$3::date LIMIT 1',[centerId,member.id,clock.today]);
  if(pending.rows.length)conflict('pending-transition');
  // Count actual frozen civil days, including administrative freezes and early resumptions.
  // At most two calendar years for a request bounded to 366 days.
  const first=plan.effectiveOn.slice(0,4)+'-01-01',last=String(+plan.resumeOn.slice(0,4)+1).padStart(4,'0')+'-01-01';
  const {rows}=await client.query(`SELECT extract(year FROM d)::integer AS year,count(*)::integer AS days
    FROM generate_series($3::date,$4::date-1,interval '1 day')d
    WHERE (SELECT h.to_state FROM centers.membership_changes h WHERE h.center_id=$1 AND h.member_id=$2 AND h.canceled_at IS NULL
      AND h.effective_on<=d::date ORDER BY h.effective_on DESC,h.sequence DESC LIMIT 1)='frozen' GROUP BY year`,[centerId,member.id,first,last]);
  return freezeRequest(input,policy,{today:clock.today,usedByYear:Object.fromEntries(rows.map(row=>[row.year,row.days]))});
}
export function configureFreezePolicy({database,user,checkSession},raw,{platform=false}={}){
  objectBody(raw,['centerId','config','version','requestId']);const centerId=idField(raw.centerId),config=freezePolicy(raw.config),version=raw.version,requestId=requestField(raw.requestId);
  if(!Number.isSafeInteger(version)||version<0)throw new CentersError(400,'invalid-input','invalid policy version');
  const operation='freeze.policy',hash=commandHash({config,version});
  return businessTransaction(database,user.id,centerId,'members.manage',async client=>{
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    const previous=await policyRecord(client,centerId);if(previous.version!==version)conflict('version-conflict');checkSession();
    const {rows}=await client.query(`INSERT INTO centers.freeze_policies(center_id,config,actor_uid) VALUES($1,$2,$3)
      ON CONFLICT(center_id) DO UPDATE SET config=EXCLUDED.config,version=centers.freeze_policies.version+1,actor_uid=EXCLUDED.actor_uid,updated_at=statement_timestamp()
      RETURNING config,version`,[centerId,JSON.stringify(config),user.id]);
    await businessAudit(client,centerId,user.id,'freeze.policy',centerId,{version:rows[0].version,...config});
    const result={policy:rows[0]};await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform});
}
export function freezePageOptions(params,{own=false}={}){
  const allowed=['centerId','cursor',...(own?[]:['memberId'])];
  if([...params.keys()].some(key=>!allowed.includes(key)))throw new CentersError(400,'invalid-input','invalid freeze list options');
  return {cursor:params.get('cursor')||null,...(own?{}:{memberId:idField(params.get('memberId'))})};
}
export function listFreezeRequests(database,uid,centerId,options,{own=false,platform=false}={}){
  return businessTransaction(database,uid,centerId,own?'membership.own.read':'members.manage',async client=>{
    const member=own?await ownMember(client,centerId,uid):await memberRecord(client,centerId,options.memberId),scope=cursorScope({kind:'freeze-requests',centerId,uid,memberId:member.id,own});
    const after=readCursor(options.cursor,scope),policy=await policyRecord(client,centerId);
    const {rows}=await client.query(`SELECT ${projection},created_at::text AS cursor_at FROM centers.freeze_requests WHERE center_id=$1 AND member_id=$2
      AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::text)) AND (NOT $5::boolean OR actor_uid=$6)
      ORDER BY created_at DESC,id DESC LIMIT 31`,[centerId,member.id,after?.at||null,after?.id||null,own,uid]);
    const page=rows.slice(0,30),last=page.at(-1);
    return {policy,requests:page.map(dto),nextCursor:rows.length>30?nextCursor(scope,last):null};
  },{platform,allowInactive:true});
}
export function requestFreeze({database,user,checkSession},raw){
  objectBody(raw,['centerId','effectiveOn','resumeOn','reason','requestId']);const centerId=idField(raw.centerId),requestId=requestField(raw.requestId);
  const input={effectiveOn:raw.effectiveOn,resumeOn:raw.resumeOn,reason:raw.reason},hash=commandHash(input);
  return businessTransaction(database,user.id,centerId,'membership.own.request',async client=>{
    const member=await ownMember(client,centerId,user.id);
    const {rows:previous}=await client.query(`SELECT ${projection} FROM centers.freeze_requests WHERE center_id=$1 AND actor_uid=$2 AND request_id=$3`,[centerId,user.id,requestId]);
    if(previous.length){if(previous[0].input_hash!==hash)conflict('idempotency-conflict');if(previous[0].member_id!==member.id)missing();return {request:dto(previous[0])}}
    const policy=await policyRecord(client,centerId),plan=await validateDates(client,centerId,member,input,policy.config);
    const pending=await client.query("SELECT id FROM centers.freeze_requests WHERE center_id=$1 AND member_id=$2 AND state='pending'",[centerId,member.id]);if(pending.rows.length)conflict('freeze-pending');
    checkSession();const id='fr_'+commandHash([centerId,user.id,requestId]).slice(0,32);
    const {rows}=await client.query(`INSERT INTO centers.freeze_requests(id,center_id,member_id,actor_uid,request_id,input_hash,policy_version,policy_snapshot,effective_on,resume_on,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${projection}`,[id,centerId,member.id,user.id,requestId,hash,policy.version,JSON.stringify(policy.config),plan.effectiveOn,plan.resumeOn,plan.reason]);
    await businessAudit(client,centerId,user.id,'freeze.requested',id,{memberId:member.id,effectiveOn:plan.effectiveOn,resumeOn:plan.resumeOn,policyVersion:policy.version});checkSession();return {request:dto(rows[0])};
  });
}
export function decideFreeze({database,user,checkSession},raw,{platform=false,own=false}={}){
  objectBody(raw,['centerId','id','version','action','reason','requestId',...(own?[]:['memberVersion'])]);
  const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId),action=raw.action;
  if(!(own?['withdrawn']:['approved','rejected']).includes(action))throw new CentersError(400,'invalid-input','invalid freeze decision');
  const reason=textField(raw.reason,250,{required:action==='rejected'}),memberVersion=action==='approved'?versionField(raw.memberVersion):null;
  const hash=commandHash({id,version,action,reason,memberVersion}),operation='freeze.decision';
  return businessTransaction(database,user.id,centerId,own?'membership.own.request':'members.manage',async(client,context)=>{
    const row=await requestRecord(client,centerId,id);
    if(own){const member=await ownMember(client,centerId,user.id);if(row.member_id!==member.id||row.actor_uid!==user.id)missing()}
    const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay)return replay;
    if(row.version!==version)conflict('version-conflict');if(row.state!=='pending')conflict('freeze-decided');
    let changeId=null,lifecycle;
    if(action==='approved'){
      if(context.center.state!=='active')conflict('center-inactive');
      const policy=await policyRecord(client,centerId);if(policy.version!==row.policy_version)conflict('freeze-policy-changed');
      const member=await memberRecord(client,centerId,row.member_id,{version:memberVersion});
      if(member.account_uid!==row.actor_uid)conflict('freeze-owner-changed');
      await validateDates(client,centerId,member,{effectiveOn:row.effective_on,resumeOn:row.resume_on,reason:row.reason},policy.config);
      const transitionId='freeze_'+id;
      lifecycle=await transitionMemberInTransaction(client,context,{user,checkSession},{centerId,id:member.id,version:member.version,action:'freeze',effectiveOn:row.effective_on,resumeOn:row.resume_on,reason:row.reason,requestId:transitionId});
      changeId='lc_'+commandHash([centerId,user.id,transitionId]).slice(0,32);
    }
    checkSession();
    const {rows}=await client.query(`UPDATE centers.freeze_requests SET state=$3,version=version+1,decision_reason=$4,decided_by=$5,change_id=$6
      WHERE center_id=$1 AND id=$2 RETURNING ${projection}`,[centerId,id,action,reason,user.id,changeId]);
    await businessAudit(client,centerId,user.id,own?'freeze.withdrawn':'freeze.'+action,id,{memberId:row.member_id,changeId});
    const result={request:dto(rows[0]),...(lifecycle?{lifecycle}:{})};await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);checkSession();return result;
  },{platform,allowInactive:true});
}
