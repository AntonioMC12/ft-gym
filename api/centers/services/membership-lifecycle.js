import {createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
import {memberDto} from '../authz.js';
import {objectBody,idField,versionField,requestField,textField} from '../domain/validation.js';
import {membershipDate,planMembershipTransition} from '../domain/membership-transitions.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';

const conflict=code=>new CentersError(409,code,'membership change conflicts with current state');
const audit=(client,centerId,uid,action,id,details)=>client.query('INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[centerId,uid,action,id,JSON.stringify(details)]);
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');

export async function membershipHistory(client,context,member) {
  if(!context.capabilities.includes('members.read'))return {};
  const {rows}=await client.query(`SELECT id,action,from_state,to_state,effective_on::text,resume_on::text,
    reason,parent_id,canceled_at,sequence FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2
    ORDER BY sequence DESC LIMIT 100`,[context.centerId,member.id]);
  return {today:member.local_today,changes:rows.map(row=>({id:row.id,action:row.action,fromState:row.from_state,toState:row.to_state,
    effectiveOn:row.effective_on,resumeOn:row.resume_on,reason:row.reason,automatic:!!row.parent_id,canceled:!!row.canceled_at,
    canCancel:context.capabilities.includes('members.manage')&&row.action!=='activate'&&!row.parent_id&&!row.canceled_at&&row.effective_on>member.local_today}))};
}
async function replay(client,centerId,uid,operation,requestId,bodyHash) {
  const {rows}=await client.query('SELECT body_hash,result FROM centers.idempotency_records WHERE center_id=$1 AND actor_uid=$2 AND operation=$3 AND request_id=$4',[centerId,uid,operation,requestId]);
  if(!rows.length)return null;
  if(rows[0].body_hash!==bodyHash)throw conflict('idempotency-conflict');
  return rows[0].result;
}
const remember=(client,centerId,uid,operation,requestId,bodyHash,result)=>client.query('INSERT INTO centers.idempotency_records(center_id,actor_uid,operation,request_id,body_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[centerId,uid,operation,requestId,bodyHash,JSON.stringify(result)]);
async function resultAfterChange(client,context,id) {
  await client.query('UPDATE centers.members SET version=version+1,updated_at=NOW() WHERE center_id=$1 AND id=$2',[context.centerId,id]);
  const member=await memberRecord(client,context.centerId,id);
  return {member:memberDto(member,context.capabilities),...await membershipHistory(client,context,member)};
}

export async function transitionMember({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','version','action','effectiveOn','resumeOn','reason','requestId']);
  const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),requestId=requestField(raw.requestId);
  const input={action:textField(raw.action,20,{required:true}),effectiveOn:membershipDate(raw.effectiveOn),
    resumeOn:raw.resumeOn==null?null:membershipDate(raw.resumeOn),reason:textField(raw.reason,250)};
  const bodyHash=hash({id,version,...input}),operation='member.transition';
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const previous=await replay(client,centerId,user.id,operation,requestId,bodyHash);if(previous)return previous;
    const member=await memberRecord(client,centerId,id,{version});
    const {rows:pending}=await client.query(`SELECT h.id,h.parent_id,h.effective_on::text,p.effective_on::text AS parent_on FROM centers.membership_changes h
      LEFT JOIN centers.membership_changes p ON p.center_id=h.center_id AND p.member_id=h.member_id AND p.id=h.parent_id
      WHERE h.center_id=$1 AND h.member_id=$2 AND h.canceled_at IS NULL AND h.effective_on>$3::date`,[centerId,id,member.local_today]);
    let projected=member.state;
    if(pending.length){
      if(!['end','resume'].includes(input.action)||pending.some(row=>!row.parent_id||row.parent_on>member.local_today))throw conflict('pending-transition');
      if(input.action==='resume'&&pending.some(row=>input.effectiveOn>row.effective_on))throw conflict('invalid-transition');
      if(input.action==='end'&&pending.some(row=>row.effective_on<input.effectiveOn))projected='active';
    }
    const plan=planMembershipTransition({...member,state:projected,joinedOn:member.joined_on},input,{today:member.local_today});
    const {rows:counter}=await client.query('SELECT COALESCE(MAX(sequence),0)::bigint+1 AS next FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2',[centerId,id]);
    const sequence=Number(counter[0].next),changeId='lc_'+hash([centerId,user.id,requestId]).slice(0,32);
    if(sequence>2147483646)throw conflict('sequence-exhausted');
    checkSession();
    const superseded=pending.filter(row=>input.action==='resume'||row.effective_on>=plan.effectiveOn);
    if(superseded.length)await client.query('UPDATE centers.membership_changes SET canceled_at=NOW(),canceled_by=$3,superseded_by=$5 WHERE center_id=$1 AND member_id=$2 AND id=ANY($4::text[])',[centerId,id,user.id,superseded.map(row=>row.id),changeId]);
    await client.query(`INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,resume_on,reason,actor_uid)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[changeId,centerId,id,sequence,plan.action,plan.fromState,plan.toState,plan.effectiveOn,plan.resumeOn,plan.reason,user.id]);
    if(plan.resumeOn)await client.query(`INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,parent_id,actor_uid)
      VALUES($1,$2,$3,$4,'resume','frozen','active',$5,$6,$7)`,[changeId+'_r',centerId,id,sequence+1,plan.resumeOn,changeId,user.id]);
    await audit(client,centerId,user.id,'member.'+plan.action,changeId,{memberId:id,effectiveOn:plan.effectiveOn,resumeOn:plan.resumeOn,scheduled:plan.scheduled});
    const result=await resultAfterChange(client,context,id);
    await remember(client,centerId,user.id,operation,requestId,bodyHash,result);checkSession();return result;
  },{platform});
}

export async function cancelMemberTransition({database,user,checkSession},raw,{platform=false}={}) {
  objectBody(raw,['centerId','id','version','changeId','requestId']);
  const centerId=idField(raw.centerId),id=idField(raw.id),version=versionField(raw.version),changeId=idField(raw.changeId),requestId=requestField(raw.requestId);
  const bodyHash=hash({id,version,changeId}),operation='member.transition.cancel';
  return businessTransaction(database,user.id,centerId,'members.manage',async(client,context)=>{
    const previous=await replay(client,centerId,user.id,operation,requestId,bodyHash);if(previous)return previous;
    const member=await memberRecord(client,centerId,id,{version});
    const {rows}=await client.query('SELECT action,parent_id,canceled_at,effective_on::text FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2 AND id=$3',[centerId,id,changeId]);
    if(!rows.length)throw new CentersError(404,'not-found','not found');
    if(rows[0].action==='activate'||rows[0].parent_id||rows[0].canceled_at||rows[0].effective_on<=member.local_today)throw conflict('invalid-transition');
    checkSession();
    await client.query('UPDATE centers.membership_changes SET canceled_at=NOW(),canceled_by=$4 WHERE center_id=$1 AND member_id=$2 AND (id=$3 OR parent_id=$3) AND canceled_at IS NULL',[centerId,id,changeId,user.id]);
    const {rows:restore}=await client.query(`SELECT parent_id,effective_on::text FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2 AND superseded_by=$3`,[centerId,id,changeId]);
    if(restore.length){
      const {rows:counter}=await client.query('SELECT COALESCE(MAX(sequence),0)::bigint+1 AS next FROM centers.membership_changes WHERE center_id=$1 AND member_id=$2',[centerId,id]);
      let sequence=Number(counter[0].next);
      for(const [index,row]of restore.entries()){
        if(row.effective_on<=member.local_today)throw conflict('invalid-transition');
        if(sequence>2147483647)throw conflict('sequence-exhausted');
        const restoredId='lr_'+hash([centerId,user.id,requestId,index]).slice(0,32);
        await client.query(`INSERT INTO centers.membership_changes(id,center_id,member_id,sequence,action,from_state,to_state,effective_on,parent_id,actor_uid)
          VALUES($1,$2,$3,$4,'resume','frozen','active',$5,$6,$7)`,[restoredId,centerId,id,sequence++,row.effective_on,row.parent_id,user.id]);
      }
    }
    await audit(client,centerId,user.id,'member.transition.canceled',changeId,{memberId:id,restoredResumptions:restore.length});
    const result=await resultAfterChange(client,context,id);
    await remember(client,centerId,user.id,operation,requestId,bodyHash,result);checkSession();return result;
  },{platform});
}
