import {CentersError} from '../errors.js';
import {objectBody,idField,requestField} from '../domain/validation.js';
import {progressShareFields,sharedProgress} from '../domain/shared-progress.js';
import {businessTransaction} from './context.js';
import {commandHash,commandReplay,rememberCommand,businessAudit} from './commands.js';
import {memberRecord} from './member-records.js';
const missing=()=>{throw new CentersError(404,'not-found','not found')};
const conflict=code=>{throw new CentersError(409,code,'shared progress changed; reload')};
const dto=row=>row?{enabled:row.enabled,from:row.starts_on,to:row.ends_on,routineIds:row.routine_ids,version:row.version}:{enabled:false,from:null,to:null,routineIds:[],version:0};
async function ownMember(client,centerId,uid){const {rows:[row]}=await client.query('SELECT id FROM centers.members WHERE center_id=$1 AND account_uid=$2',[centerId,uid]);return row?memberRecord(client,centerId,row.id):missing()}
async function shareRow(client,centerId,memberId,uid){const {rows:[row]}=await client.query('SELECT enabled,starts_on::text,ends_on::text,routine_ids,version FROM centers.progress_shares WHERE center_id=$1 AND member_id=$2 AND recipient_uid=$3',[centerId,memberId,uid]);return row}
const active=member=>member.state==='active'&&member.joined_on<=member.local_today&&(!member.ends_on||member.ends_on>member.local_today);
export function progressSelectors(params,{own=false}={}){
  if([...params.keys()].some(key=>!(own?['centerId']:['centerId','memberId']).includes(key)))throw new CentersError(400,'invalid-input','invalid progress selectors');
  return own?{}:{memberId:idField(params.get('memberId'))};
}
export function ownProgressShare({database,user,checkSession},centerId){
  return businessTransaction(database,user.id,centerId,'training.own.read',async(client,context)=>{const member=await ownMember(client,centerId,user.id),share=dto(await shareRow(client,centerId,member.id,user.id));checkSession();return {share,today:member.local_today,canEnable:context.center.state==='active'&&active(member)}},{allowInactive:true});
}
export function changeProgressShare({database,user,checkSession,accountLocks,readOwnTraining,lookupAccount},raw){
  objectBody(raw,['centerId','version','fields','requestId']);const centerId=idField(raw.centerId),fields=progressShareFields(raw.fields),version=raw.version,requestId=requestField(raw.requestId);
  if(!Number.isSafeInteger(version)||version<0)throw new CentersError(400,'invalid-input','share revision required');
  const hash=commandHash({version,fields}),operation='training.progress.share';
  return accountLocks.withAccounts([user.id],()=>businessTransaction(database,user.id,centerId,'membership.own.request',async(client,context)=>{
    const member=await ownMember(client,centerId,user.id),old=dto(await shareRow(client,centerId,member.id,user.id));
    if(await commandReplay(client,centerId,user.id,operation,requestId,hash)){checkSession();return {share:old}}
    if(old.version!==version)conflict('version-conflict');
    if(fields.enabled){
      if(context.center.state!=='active'||!active(member))conflict('training-member-inactive');if(fields.to>member.local_today)conflict('invalid-progress-share');
      if(!lookupAccount(user.id)||lookupAccount(user.id).disabled)conflict('training-account-required');
      const state=readOwnTraining(user.id),ids=new Set((Array.isArray(state?.routines)?state.routines:[]).map(row=>row?.id));if(fields.routineIds.some(id=>!ids.has(id)))conflict('progress-routines-unavailable');
    }
    checkSession();if(old.version===0)await client.query('INSERT INTO centers.progress_shares(center_id,member_id,recipient_uid,enabled,starts_on,ends_on,routine_ids) VALUES($1,$2,$3,$4,$5,$6,$7)',[centerId,member.id,user.id,fields.enabled,fields.from,fields.to,fields.routineIds]);
    else await client.query('UPDATE centers.progress_shares SET enabled=$4,starts_on=$5,ends_on=$6,routine_ids=$7,version=version+1,updated_at=clock_timestamp() WHERE center_id=$1 AND member_id=$2 AND recipient_uid=$3',[centerId,member.id,user.id,fields.enabled,fields.from,fields.to,fields.routineIds]);
    await businessAudit(client,centerId,user.id,operation,member.id,{enabled:fields.enabled,routines:fields.routineIds.length});await rememberCommand(client,centerId,user.id,operation,requestId,hash,{memberId:member.id});checkSession();return {share:dto(await shareRow(client,centerId,member.id,user.id))};
  },{allowInactive:true}));
}
export async function readSharedProgress({database,user,checkSession,accountLocks,readOwnTraining,lookupAccount},centerId,memberId,{platform=false}={}){
  const recipient=await businessTransaction(database,user.id,centerId,'training.shared.read',async client=>(await memberRecord(client,centerId,memberId)).account_uid,{platform,allowInactive:true});
  if(!recipient){checkSession();return {shared:false}}
  return accountLocks.withAccounts([user.id,recipient],()=>businessTransaction(database,user.id,centerId,'training.shared.read',async(client,context)=>{
    const member=await memberRecord(client,centerId,memberId);if(member.account_uid!==recipient)missing();
    const share=await shareRow(client,centerId,memberId,recipient),account=lookupAccount(recipient);
    if(!share?.enabled||context.center.state!=='active'||!active(member)||!account||account.disabled){checkSession();return {shared:false}}
    checkSession();const report=sharedProgress(readOwnTraining(recipient),{routineIds:share.routine_ids,from:share.starts_on,to:share.ends_on>member.local_today?member.local_today:share.ends_on});checkSession();return {shared:true,report};
  },{platform,allowInactive:true}));
}
