import {createHash} from 'node:crypto';
import {CentersError} from '../errors.js';
export const fail=(code='community-invalid',status=400)=>{throw new CentersError(status,code,'community request unavailable')};
export const text=(value,max,required=true)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||required&&!value.trim())fail();return value.trim()};
export const boolean=value=>{if(typeof value!=='boolean')fail();return value};
export const BADGES=['first-session','ten-sessions','four-weeks','first-record'];
export const REACTIONS=['clap','strength','fire','party','heart'];
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export const day=value=>{if(!date(value))fail();return value};
// Same legacy phase precedence and partial-side completion as workout-model.js.
const work=set=>set&&!(set.phase!=null&&set.phase!==''?['warmup','warm-up','warm_up'].includes(String(set.phase).trim().toLowerCase()):set.warmup===true);
const rows=set=>set?.sides?.L&&set?.sides?.R?[set.sides.L,set.sides.R]:[set];
const completed=set=>work(set)&&rows(set).some(s=>s?.done===true);
const positive=s=>[s?.r,s?.reps,s?.actualReps,s?.sec,s?.seconds,s?.durationSec,s?.min,s?.dist].some(n=>Number.isFinite(Number(n))&&Number(n)>0);
export function savedWorkouts(state,today){
 const seen=new Set();return (Array.isArray(state?.workouts)?state.workouts:[]).filter(w=>{
  if(!w||!date(w.d)||w.d>today||!Array.isArray(w.entries)||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<w.start)return false;
  const id=String(w.id??(w.d+'|'+w.start));if(seen.has(id)||Number(state?.deleted?.workouts?.[id])>0)return false;seen.add(id);
  return w.entries.some(e=>Array.isArray(e?.sets)&&e.sets.some(s=>completed(s)&&rows(s).some(side=>side?.done===true&&positive(side))));
 }).sort((a,b)=>a.d.localeCompare(b.d)||a.start-b.start);
}
export function achievementMetrics(state,today){
 const workouts=savedWorkouts(state,today),earned={};
 if(workouts.length)earned['first-session']=workouts[0].d;
 if(workouts.length>=10)earned['ten-sessions']=workouts[9].d;
 const weeks=new Map();for(const w of workouts){const d=new Date(w.d+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const k=d.toISOString().slice(0,10);if(!weeks.has(k))weeks.set(k,w.d)}
 let consecutive=0,last=null;for(const [week,d] of [...weeks].sort(([a],[b])=>a.localeCompare(b))){consecutive=last&&Date.parse(week)-Date.parse(last)===604800000?consecutive+1:1;if(consecutive>=4&&!earned['four-weeks'])earned['four-weeks']=d;last=week}
 // PR annotations are the existing history engine's declared record metadata, not a second strength algorithm.
 const record=workouts.find(w=>Array.isArray(w.prs)&&w.prs.some(id=>w.entries.some(e=>e?.id===id&&Array.isArray(e.sets)&&e.sets.some(s=>completed(s)&&rows(s).some(side=>side?.done===true&&Number(side.w)>0)))));if(record)earned['first-record']=record.d;
 return {definition:1,earned,sessions:workouts.length,sourceHash:createHash('sha256').update(JSON.stringify(workouts.map(w=>[w.id,w.d,w.start,w.end,w.prs,w.entries]))).digest('hex')};
}
export function workoutSnapshot(state,workoutId,includeLoads,today){
 const w=savedWorkouts(state,today).find(w=>String(w.id)===workoutId);if(!w)fail('community-workout-unavailable',409);
 const name=String(w.name||'').slice(0,120),result={workoutId:String(w.id),date:w.d,title:name};
 if(includeLoads){result.unit=state.unit==='lb'?'lb':'kg';result.exercises=w.entries.filter(e=>e&&Array.isArray(e.sets)).slice(0,30).map(e=>({id:String(e.id).slice(0,64),sets:e.sets.filter(completed).flatMap(rows).filter(s=>s?.done===true).slice(0,30).map(s=>({reps:Math.max(0,Math.min(10000,Number(s.r)||0)),load:Math.max(0,Math.min(10000,Number(s.w)||0))}))}))}
 if(Buffer.byteLength(JSON.stringify(result))>30000)fail();return result;
}
