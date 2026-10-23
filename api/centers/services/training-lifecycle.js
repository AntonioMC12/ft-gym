import {isPlatformUser} from '../authz.js';
import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
export async function retireAssignedRoutine({database,user,checkSession,config},raw){
 const verify=()=>{checkSession();if(!isPlatformUser(config,user))throw new CentersError(403,'forbidden','forbidden')};verify();
 objectBody(raw,['centerId','versionId','routineId','requestId']);const centerId=idField(raw.centerId),versionId=idField(raw.versionId),routineId=idField(raw.routineId),requestId=requestField(raw.requestId),operation='training.retire',hash=commandHash({versionId,routineId});
 return businessTransaction(database,user.id,centerId,'training.assign',async client=>{
  const replay=await commandReplay(client,centerId,user.id,operation,requestId,hash);if(replay){checkSession();return replay}
  const {rows:[row]}=await client.query(`SELECT v.* FROM centers.training_versions v JOIN centers.training_acceptances a ON a.version_id=v.id AND a.recipient_uid=v.recipient_uid JOIN centers.members m ON m.center_id=v.center_id AND m.id=v.member_id AND m.account_uid=v.recipient_uid WHERE v.center_id=$1 AND v.id=$2`,[centerId,versionId]);
  if(!row||!Object.values(row.routine_ids).includes(routineId))throw new CentersError(404,'not-found','not found');
  verify();await client.query(`INSERT INTO centers.training_routine_archives(center_id,version_id,member_id,recipient_uid,routine_id,reason,actor_uid) VALUES($1,$2,$3,$4,$5,'platform',$6) ON CONFLICT DO NOTHING`,[centerId,versionId,row.member_id,row.recipient_uid,routineId,user.id]);
  await businessAudit(client,centerId,user.id,operation,versionId,{routineId});const result={retired:true,routineId};await rememberCommand(client,centerId,user.id,operation,requestId,hash,result);verify();return result;
 },{platform:true,allowInactive:true});
}
export async function reconcileAssignments({database,user,checkSession,accountLocks,readOwnTraining},raw){
 objectBody(raw,['centerId']);const centerId=idField(raw.centerId);
 return accountLocks.withAccounts([user.id],()=>businessTransaction(database,user.id,centerId,'training.own.read',async client=>{
  const {rows}=await client.query(`SELECT v.id,v.member_id,v.routine_ids FROM centers.training_versions v JOIN centers.training_acceptances a ON a.version_id=v.id AND a.recipient_uid=v.recipient_uid WHERE v.center_id=$1 AND v.recipient_uid=$2 AND centers.owns_member(v.center_id,v.member_id)`,[centerId,user.id]);
  checkSession();const state=readOwnTraining(user.id);if(state?.routines!=null&&!Array.isArray(state.routines))throw new CentersError(503,'training-state-unavailable','training unavailable');
  const present=new Set((state?.routines||[]).map(r=>r.id)),deleted=new Set([...Object.keys(state?.deleted?.routines||{}).filter(id=>state.deleted.routines[id]>0),...(state?.resetIds?.routines||[])]);
  const {rows:existing}=await client.query("SELECT version_id,routine_id,active FROM centers.training_routine_archives WHERE center_id=$1 AND recipient_uid=$2 AND reason='member'",[centerId,user.id]);
  const previousById=new Map(existing.map(row=>[row.version_id+':'+row.routine_id,row]));
  for(const row of rows)for(const routineId of Object.values(row.routine_ids)){
   const removed=!present.has(routineId)&&deleted.has(routineId);
   const previous=previousById.get(row.id+':'+routineId);
   if(!removed&&!previous)continue;
   if(previous&&previous.active===removed)continue;
   // Never interpret a missing, not-yet-delivered routine as user deletion.
   if(!removed&&!present.has(routineId))continue;
   checkSession();await client.query(`INSERT INTO centers.training_routine_archives(center_id,version_id,member_id,recipient_uid,routine_id,reason,actor_uid,active) VALUES($1,$2,$3,$4,$5,'member',$6,$7) ON CONFLICT(version_id,routine_id,reason) DO UPDATE SET active=excluded.active,changed_at=clock_timestamp()`,[centerId,row.id,row.member_id,user.id,routineId,user.id,removed]);
   await businessAudit(client,centerId,user.id,'training.lifecycle',row.id,{routineId,removed});
  }
  const {rows:retirements}=await client.query(`SELECT x.routine_id AS id,x.changed_at FROM centers.training_routine_archives x WHERE x.center_id=$1 AND x.recipient_uid=$2 AND x.reason='platform' AND x.active AND centers.owns_member(x.center_id,x.member_id)`,[centerId,user.id]);
  checkSession();return {retirements:retirements.map(r=>({id:r.id,at:Date.parse(r.changed_at)}))};
 },{allowInactive:true}));
}
