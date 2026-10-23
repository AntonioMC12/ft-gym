import {LIB_BY_ID} from '../../coach/core/library.js';
import {membershipDate} from './membership-transitions.js';
const num=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const work=set=>set&&!(set.phase!=null&&set.phase!==''?['warmup','warm-up','warm_up'].includes(String(set.phase).trim().toLowerCase()):set.warmup===true);
const monday=day=>{const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10)};
// A bounded reporting projection, not a PR/progression prescription. Each week's
// load and reps come from the SAME completed main set; bursts/warmups are excluded.
// Separate laterality and load meaning instead of silently comparing unlike weights.
export function assignedStrength(state,{routineIds,allowedExercises,from,to}){
 const groups=new Map(routineIds.map(id=>[id,new Map()])),seen=new Set();
 for(const workout of Array.isArray(state?.workouts)?state.workouts:[]){
  if(!workout||typeof workout!=='object')continue;
  let day;try{day=membershipDate(workout.d)}catch{continue}if(day<from||day>to)continue;
  const key=String(workout.id??(workout.d+'|'+workout.start));if(seen.has(key)||Number(state?.deleted?.workouts?.[key])>0)continue;seen.add(key);
  const entries=Array.isArray(workout.entries)?workout.entries:[],hasRids=entries.some(entry=>entry?.rid),ids=Array.isArray(workout.routineIds)?workout.routineIds:workout.routineId?[workout.routineId]:[];
  for(const entry of entries){
   const rid=entry?.rid||(!hasRids&&ids.length===1?ids[0]:null),routine=groups.get(rid),catalogue=entry?.muscleSnapshot?.sharedRevision?entry.muscleSnapshot:LIB_BY_ID.get(entry?.id);
   if(!routine||!catalogue||!allowedExercises.get(rid)?.has(entry.id)||!Array.isArray(entry.sets))continue;
   const target=entry.target||{},mode=target.mode;
   const assisted=typeof target.assisted==='boolean'?target.assisted:typeof catalogue.assisted==='boolean'?catalogue.assisted:catalogue.eq==='leverage machine'&&/\bassist(ed)?\b/i.test(catalogue.n||'');
   const dbLoad=['each','total'].includes(target.dbLoad)?target.dbLoad:'as';
   for(const row of entry.sets){
    if(!work(row))continue;
    const resolved=row.mode||mode;
    if(resolved&&resolved!=='reps'||!resolved&&(target.sec>0||target.min>0||row.sec>0||row.min>0))continue;
    const sides=row.sides?.L&&row.sides?.R?Object.entries(row.sides).filter(([side])=>side==='L'||side==='R'):[[row.side==='L'||row.side==='R'?row.side:'both',row]];
    for(const [side,set] of sides){
     if(set?.done!==true||!num(set.w)||set.w>10000||!num(set.r)||set.r<=0||set.r>10000)continue;
     const groupKey=JSON.stringify([entry.id,side,dbLoad,assisted]);
     if(!routine.has(groupKey))routine.set(groupKey,{id:entry.id,side,dbLoad,assisted,weeks:new Map()});
     const exercise=routine.get(groupKey),week=monday(day),old=exercise.weeks.get(week);
     const better=!old||(assisted?set.w<old.load:set.w>old.load)||set.w===old.load&&set.r>old.reps;
     exercise.weeks.set(week,{from:week,load:better?set.w:old.load,reps:better?set.r:old.reps,sets:(old?.sets||0)+1});
    }
   }
  }
 }
 return routineIds.map(id=>[...groups.get(id).values()].map(ex=>({...ex,weeks:[...ex.weeks.values()].sort((a,b)=>a.from.localeCompare(b.from))})));
}
