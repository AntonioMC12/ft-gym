import {CentersError} from '../errors.js';
import {cursorScope,readCursor,nextCursor} from '../domain/pagination.js';
import {businessTransaction} from './context.js';
import {memberRecord} from './member-records.js';
import {recordId} from '../authz.js';
import {LIB_BY_ID} from '../../coach/core/library.js';
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
const setKeys=['w','r','done','mode','side','phase','warmup','rir','rpe','failure','effort','min','sec','speed','incline','distance','dbLoad','type','kind'];
function trainingSet(row,side=false){const out=pick(row,setKeys);if(!side&&row?.sides)out.sides=Object.fromEntries(['L','R'].filter(k=>row.sides[k]).map(k=>[k,trainingSet(row.sides[k],true)]));for(const key of ['drops','clusters'])if(Array.isArray(row?.[key]))out[key]=row[key].map(x=>pick(x,setKeys));return out}
const definitionKeys=['id','n','bp','tg','eq','assisted','primaries','secondaries','muscleGroups','sm','muscleWeights','sharedRevision'];
export function savedWorkouts(state){
 if(state?.workouts!=null&&!Array.isArray(state.workouts))throw new CentersError(503,'training-state-unavailable','training unavailable');
 const seen=new Set();return (state?.workouts||[]).filter(w=>{if(!w||!Array.isArray(w.entries)||!w.entries.length||!/^\d{4}-\d{2}-\d{2}$/.test(w.d||''))return false;const id=String(w.id??(w.d+'|'+w.start));if(seen.has(id)||Number(state?.deleted?.workouts?.[id])>0)return false;seen.add(id);return true});
}
export function progressProjection(state){
 const definitions=Object.fromEntries([...Object.values(state?.exerciseDefs||{}),...(state?.customEx||[])].filter(Boolean).map(e=>[e.id,pick(e,definitionKeys)]));
 const workouts=savedWorkouts(state).map(w=>({...pick(w,['id','d','start','end','duration','routineId','routineIds','name','unit','bw','dur','min']),entries:w.entries.map(e=>{
  const definition={...LIB_BY_ID.get(e.id),...definitions[e.id],...(e.exerciseSnapshot||e.muscleSnapshot||e)};
  if(!definitions[e.id])definitions[e.id]=pick(definition,definitionKeys);
  return {...pick(e,['id','rid','n','mode','side','dbLoad','unit','assisted','bw','bodyweight']),target:pick(e.target,['mode','sets','reps','weight','sec','min','speed','side','unilateral','dbLoad','assisted','bodyweight','bw','rir','rpe','restSec']),exerciseSnapshot:pick(definition,definitionKeys),muscleSnapshot:pick(definition,definitionKeys),sets:(e.sets||[]).map(row=>trainingSet(row))};
 })}));
 return {...pick(state,['unit','body','targetW','heatmapMetric','speedUnit','showRir','effortScale','effort','dbLoad','weekStart']),unit:state?.unit==='lb'?'lb':'kg',bodyweight:(state?.bodyweight||[]).map(w=>pick(w,['d','t','w'])),routines:(state?.routines||[]).map(r=>({...pick(r,['id','name']),ex:(r.ex||[]).map(e=>({...pick(e,['id','sets','reps','weight','mode','sec','min','speed','side','dbLoad','rir','rpe']),exerciseSnapshot:pick(definitions[e.id]||LIB_BY_ID.get(e.id)||e,definitionKeys)}))})),week:Object.fromEntries(Object.entries(state?.week||{}).filter(([k,v])=>/^[0-6]$/.test(k)&&Array.isArray(v)).map(([k,v])=>[k,v.filter(x=>typeof x==='string')])),measurements:[],workouts,definitions};
}
export function progressPageOptions(params){
 if([...params.keys()].some(k=>!['query','cursor','limit'].includes(k)))throw new CentersError(400,'invalid-input','invalid selectors');
 const query=(params.get('query')||'').trim(),limit=Number(params.get('limit')||30),cursor=params.get('cursor')||null;
 if(query.length>120||!Number.isSafeInteger(limit)||limit<1||limit>50||cursor?.length>1024)throw new CentersError(400,'invalid-input','invalid page');return {query,limit,cursor};
}
export async function progressMembers({database,user,readOwnTraining,lookupAccount,checkSession},{query='',limit=30,cursor=null}){
 const scope=cursorScope(['progress-members',user.id,query]),after=readCursor(cursor,scope);
 return database.platformTransaction(user.id,async client=>{
  const {rows}=await client.query(`SELECT m.id,m.center_id,m.account_uid,m.name,m.member_number,m.created_at::text AS cursor_at,c.name AS center_name FROM centers.member_profiles m JOIN centers.centers c ON c.id=m.center_id WHERE m.account_uid IS NOT NULL AND ($1='' OR m.name ILIKE $2 ESCAPE '\\' OR m.member_number ILIKE $2 ESCAPE '\\') AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::text)) ORDER BY m.created_at DESC,m.id DESC LIMIT $5`,[query,'%'+query.replace(/[\\%_]/g,'\\$&')+'%',after?.at||null,after?.id||null,limit+1]);
  const page=rows.slice(0,limit),members=[];
  for(const row of page){checkSession();const account=lookupAccount(row.account_uid);if(!account||account.disabled)continue;const workouts=savedWorkouts(readOwnTraining(row.account_uid));if(!workouts.length)continue;members.push({id:row.id,centerId:row.center_id,name:row.name,number:row.member_number,centerName:row.center_name,workouts:workouts.length,lastOn:workouts.map(w=>w.d).sort().at(-1)})}
  checkSession();return {members,nextCursor:rows.length>limit?nextCursor(scope,page.at(-1)):null};
 });
}
export async function memberProgress(context,centerId,memberId){
 if(!recordId(centerId)||!recordId(memberId))throw new CentersError(400,'invalid-input','invalid member');
 const {database,user,accountLocks,readOwnTraining,lookupAccount,checkSession}=context;
 const recipient=await businessTransaction(database,user.id,centerId,'training.shared.read',async client=>(await memberRecord(client,centerId,memberId)).account_uid,{platform:true,allowInactive:true});
 if(!recipient)throw new CentersError(404,'not-found','not found');
 return accountLocks.withAccounts([user.id,recipient],()=>businessTransaction(database,user.id,centerId,'training.shared.read',async client=>{
  const member=await memberRecord(client,centerId,memberId),account=lookupAccount(recipient);checkSession();
  if(member.account_uid!==recipient||!account||account.disabled)throw new CentersError(404,'not-found','not found');
  const progress=progressProjection(readOwnTraining(recipient));if(!progress.workouts.length)throw new CentersError(404,'not-found','no saved workouts');
  await client.query('INSERT INTO centers.business_audit(center_id,actor_uid,action,target_id) VALUES($1,$2,$3,$4)',[centerId,user.id,'platform.member-progress.read',memberId]);checkSession();return {member:{id:memberId,name:member.name},progress};
 },{platform:true,allowInactive:true}));
}
