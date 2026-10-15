import {CentersError} from '../errors.js';
import {objectBody,idField} from './validation.js';
import {membershipDate} from './membership-transitions.js';
const invalid=()=>{throw new CentersError(400,'invalid-progress-share','choose explicit routines and a bounded logged-date period')};
export function progressShareFields(raw){
  objectBody(raw,['enabled','routineIds','from','to']);if(typeof raw.enabled!=='boolean')invalid();
  if(!raw.enabled)return {enabled:false,routineIds:[],from:null,to:null};
  if(!Array.isArray(raw.routineIds)||!raw.routineIds.length||raw.routineIds.length>20)invalid();
  const routineIds=raw.routineIds.map(idField).sort();if(new Set(routineIds).size!==routineIds.length)invalid();
  let from,to;try{from=membershipDate(raw.from);to=membershipDate(raw.to)}catch{invalid()}
  if(from>to||(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>365)invalid();
  return {enabled:true,routineIds,from,to};
}
// A privacy projection over saved session metadata, not the strength/progression engine.
// It deliberately never reads sets, loads, notes, media, measurements or active workouts.
export function sharedProgress(state,{routineIds,from,to}){
  if(state!=null&&(typeof state!=='object'||Array.isArray(state)||state.workouts!=null&&!Array.isArray(state.workouts)||state.routines!=null&&!Array.isArray(state.routines)))throw new CentersError(503,'training-state-unavailable','personal training is unreadable');
  const chosen=new Set(routineIds),names=new Map((Array.isArray(state?.routines)?state.routines:[]).filter(row=>chosen.has(row?.id)).map(row=>[row.id,typeof row.name==='string'?row.name.slice(0,120):null]));
  const rows=new Map(routineIds.map(id=>[id,{name:names.get(id)||null,sessions:0,days:new Set(),weeks:new Map(),lastSessionOn:null}])),seen=new Set();
  for(const workout of Array.isArray(state?.workouts)?state.workouts:[]){
    if(!workout||typeof workout!=='object')continue;
    const key=String(workout.id??(workout.d+'|'+workout.start));if(seen.has(key)||Number(state?.deleted?.workouts?.[key])>0)continue;seen.add(key);
    let day;try{day=membershipDate(workout.d)}catch{continue}if(day<from||day>to)continue;
    const ids=Array.isArray(workout.routineIds)&&workout.routineIds.length?workout.routineIds:[workout.routineId],matching=new Set(ids.filter(id=>chosen.has(id)));
    const week=new Date(day+'T00:00:00Z');week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+6)%7);const monday=week.toISOString().slice(0,10);
    for(const id of matching){const row=rows.get(id);row.sessions++;row.days.add(day);row.weeks.set(monday,(row.weeks.get(monday)||0)+1);if(!row.lastSessionOn||day>row.lastSessionOn)row.lastSessionOn=day}
  }
  return {definitionVersion:1,dateBasis:'logged-workout-date',period:{from,to},routines:[...rows.values()].map(row=>({name:row.name,sessions:row.sessions,days:row.days.size,lastSessionOn:row.lastSessionOn,weeks:[...row.weeks].sort(([a],[b])=>a.localeCompare(b)).map(([from,sessions])=>({from,sessions}))}))};
}
