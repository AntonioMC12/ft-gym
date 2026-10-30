import {CentersError} from '../errors.js';
import {objectBody,textField} from './validation.js';

const invalid=message=>{throw new CentersError(400,'invalid-training-plan',message)};
const policies=new Set(['off','linear','greyskull','double','triple','time']);
const rootFields=['opengym_plan','name','unit','exported','routines','week','customEx'];
const routineFields=['id','name','emoji','prog','excludeFromProgression','ex'];
const exerciseFields=['id','setTargets','sets','mode','reps','weight','sec','min','speed','pyramid','pyramidRest','pyramidWeight','bodyweight','side','prog','inc','backoff','lastToFailure','deloadFactor','dbLoad','repsMin','setsMax','repsMax','restSec','warmupRestSec','sg','note','warmupSets','intensifier'];
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function shape(value,fields){try{return objectBody(value,fields)}catch{invalid('unexpected training plan field')}}
function number(value,min,max,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))invalid('invalid prescription number');return value}
function text(value,max,required=false){try{return textField(value,max,{required})}catch{invalid('invalid training plan text')}}
function policy(value){if(!policies.has(value))invalid('unknown progression policy');return value}
function cleanExercise(value,hasExercise){
  shape(value,exerciseFields);
  if(typeof value.id!=='string'||!hasExercise(value.id))invalid('exercise is not in the catalogue');
  const out={id:value.id,sets:number(value.sets,1,50,true)};
  if(value.mode!=null){if(!['reps','time','cardio'].includes(value.mode))invalid('invalid exercise mode');out.mode=value.mode}
  for(const key of ['reps','repsMin','repsMax'])if(value[key]!=null)out[key]=number(value[key],1,1000,true);
  if(out.repsMin!=null&&(out.reps==null||out.repsMin>out.reps||out.mode==='time'||out.mode==='cardio'))invalid('invalid repetition range');
  if(value.setTargets!=null){
    if(!Array.isArray(value.setTargets)||value.setTargets.length!==out.sets||out.mode==='time'||out.mode==='cardio'||value.pyramid!=null)invalid('invalid per-set targets');
    out.setTargets=value.setTargets.map(goal=>{
      shape(goal,['reps','repsMin']);
      const target={reps:number(goal.reps,1,1000,true)};
      if(goal.repsMin!=null)target.repsMin=number(goal.repsMin,1,target.reps,true);
      return target;
    });
  }
  for(const key of ['weight','inc'])if(value[key]!=null)out[key]=number(value[key],0,10000);
  for(const key of ['sec','restSec','warmupRestSec'])if(value[key]!=null)out[key]=number(value[key],1,7200,true);
  if(value.min!=null)out.min=number(value.min,0.1,1440);
  if(value.speed!=null)out.speed=number(value.speed,0,200);
  if(value.setsMax!=null)out.setsMax=number(value.setsMax,1,10,true);
  if(value.warmupSets!=null)out.warmupSets=number(value.warmupSets,0,5,true);
  if(value.deloadFactor!=null)out.deloadFactor=number(value.deloadFactor,0.01,1);
  for(const key of ['bodyweight','side','backoff','lastToFailure'])if(value[key]!=null){if(typeof value[key]!=='boolean')invalid('invalid prescription flag');out[key]=value[key]}
  if(value.prog!=null)out.prog=policy(value.prog);
  if(value.dbLoad!=null){if(!['as','each','total'].includes(value.dbLoad))invalid('invalid dumbbell load');out.dbLoad=value.dbLoad}
  if(value.sg!=null)out.sg=text(value.sg,64,true);
  if(value.note!=null)out.note=text(value.note,1000)||'';
  if(value.pyramid!=null){
    if(!Array.isArray(value.pyramid)||!value.pyramid.length||value.pyramid.length>10)invalid('invalid pyramid');
    out.pyramid=value.pyramid.map(v=>v==='max'?v:number(v,1,1000,true));
  }
  for(const key of ['pyramidRest','pyramidWeight'])if(value[key]!=null){
    if(!out.pyramid||!Array.isArray(value[key])||value[key].length!==out.pyramid.length)invalid('pyramid prescription length mismatch');
    out[key]=value[key].map(v=>number(v,0,key==='pyramidRest'?7200:10000,key==='pyramidRest'));
  }
  if(value.intensifier!=null){
    const x=value.intensifier;
    if(x?.type==='dropset'){shape(x,['type','count','pct']);out.intensifier={type:x.type,count:number(x.count,1,10,true),pct:number(x.pct,5,100,true)}}
    else if(x?.type==='restpause'){shape(x,['type','totalReps','restSec']);out.intensifier={type:x.type,totalReps:number(x.totalReps,1,1000,true),restSec:number(x.restSec,5,7200,true)}}
    else invalid('invalid intensifier');
  }
  return out;
}

// A proposal is a bounded training bundle, never a whole profile. Keep the same
// prescription vocabulary as buildPlanBundle; do not use the Coach's lossy summary.
export function trainingPlan(value,hasExercise){
  if(typeof hasExercise!=='function')throw new CentersError(503,'training-catalogue-unavailable','exercise catalogue is unavailable');
  let raw;try{raw=JSON.stringify(value)}catch{invalid('invalid training plan JSON')}
  if(!raw||Buffer.byteLength(raw)>65536)invalid('training plan exceeds 64 KiB');
  shape(value,rootFields);
  if(value.opengym_plan!==1||!['kg','lb'].includes(value.unit))invalid('plan format and unit required');
  if(value.customEx!=null&&(!Array.isArray(value.customEx)||value.customEx.length))invalid('custom exercises are not supported in proposals');
  if(!Array.isArray(value.routines)||!value.routines.length||value.routines.length>20)invalid('one to twenty routines required');
  const ids=new Set();let count=0;
  const routines=value.routines.map(row=>{
    shape(row,routineFields);
    if(typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(row.id)||ids.has(row.id))invalid('invalid or duplicate routine id');ids.add(row.id);
    if(!Array.isArray(row.ex)||!row.ex.length||row.ex.length>40||(count+=row.ex.length)>200)invalid('training plan exercise limit exceeded');
    const out={id:row.id,name:text(row.name,120,true)};
    if(row.emoji!=null)out.emoji=text(row.emoji,16)||'';
    if(row.prog!=null)out.prog=policy(row.prog);
    if(row.excludeFromProgression!=null){if(typeof row.excludeFromProgression!=='boolean')invalid('invalid progression exclusion');out.excludeFromProgression=row.excludeFromProgression}
    out.ex=row.ex.map(ex=>cleanExercise(ex,hasExercise));return out;
  });
  const week={};
  if(value.week!=null){
    if(!record(value.week)||Object.keys(value.week).some(day=>!/^[0-6]$/.test(day)))invalid('invalid week schedule');
    for(const day of ['0','1','2','3','4','5','6'])if(value.week[day]!=null){
      const rows=Array.isArray(value.week[day])?value.week[day]:[value.week[day]];
      if(rows.length>20||rows.some(id=>!ids.has(id))||new Set(rows).size!==rows.length)invalid('week references an unknown or repeated routine');
      if(rows.length)week[day]=[...rows];
    }
  }
  return {opengym_plan:1,name:text(value.name,120)||'',unit:value.unit,routines,week,customEx:[]};
}

// The marker is evidence of personal synchronization only after matching a durable
// acceptance and its server-issued map. It cannot grant membership or staff access.
export function appliedTrainingDelivery(state,{deliveryKey,acceptedAt,routineIds}){
  if(!record(state)||!record(routineIds))return null;
  const ids=Object.values(routineIds).sort(),at=typeof acceptedAt==='string'?Date.parse(acceptedAt):acceptedAt;
  const marker=Array.isArray(state.planDeliveries)?state.planDeliveries.find(row=>row?.id===deliveryKey):null;
  if(!marker||marker.acceptedAt!==at||!Array.isArray(marker.routineIds)||JSON.stringify([...marker.routineIds].sort())!==JSON.stringify(ids))return null;
  const present=new Set((Array.isArray(state.routines)?state.routines:[]).map(row=>row?.id));
  const reset=new Set(Array.isArray(state.resetIds?.routines)?state.resetIds.routines:[]);
  let removed=false;
  for(const id of ids){if(present.has(id))continue;if(reset.has(id)||Number(state.deleted?.routines?.[id])>0)removed=true;else return null}
  return removed?'removed':'applied';
}
