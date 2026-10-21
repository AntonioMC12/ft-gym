import {CentersError} from '../errors.js';
import {objectBody,textField,idField} from './validation.js';
import {membershipDate} from './membership-transitions.js';

const invalid=()=>{throw new CentersError(400,'invalid-input','explicit class schedule and limits required')};
const minutes=value=>{if(typeof value!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))invalid();return +value.slice(0,2)*60 + +value.slice(3)};
const civilParts=(formatter,instant)=>Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
const stamp=parts=>Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
// Probe offsets around the requested civil day and verify every candidate. No host-zone assumptions.
export function classTimeCandidates(date,time,timezone){
  if(typeof timezone!=='string'||!timezone.trim())invalid();
  membershipDate(date);const minute=minutes(time),[year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day,Math.floor(minute/60),minute%60);
  let formatter;try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}catch{invalid()}
  const offsets=new Set();for(let hour=-36;hour<=36;hour+=6){const instant=target+hour*3600000;offsets.add(stamp(civilParts(formatter,instant))-instant)}
  return [...offsets].map(offset=>target-offset).filter(instant=>stamp(civilParts(formatter,instant))===target).sort((a,b)=>a-b).map(instant=>new Date(instant).toISOString());
}
function instant(date,time,timezone,disambiguation){
  const candidates=classTimeCandidates(date,time,timezone);
  if(!candidates.length)throw new CentersError(409,'class-time-missing','civil time does not exist in this timezone');
  if(candidates.length>1&&!disambiguation)throw new CentersError(409,'class-time-ambiguous','choose the first or second occurrence of the repeated hour');
  return candidates[disambiguation==='later'?candidates.length-1:0];
}
export function classFields(raw,{timezone}){
  objectBody(raw,['name','room','instructorAssignmentId','date','startTime','endTime','disambiguation','capacity','waitlistCapacity','cancelBeforeMinutes','eligiblePlanIds']);
  const instructorAssignmentId=raw.instructorAssignmentId==null||raw.instructorAssignmentId===''?null:idField(raw.instructorAssignmentId);
  const room=textField(raw.room,120);if(room&&/[\u0000-\u001f\u007f]/.test(room))invalid();
  const name=textField(raw.name,120,{required:true}),date=membershipDate(raw.date),start=minutes(raw.startTime),end=raw.endTime==='24:00'?1440:minutes(raw.endTime);
  if(start>=end||end-start>720)invalid();
  const occurrence=typeof raw.disambiguation==='string'?{start:raw.disambiguation,end:raw.disambiguation}:raw.disambiguation||{};
  objectBody(occurrence,['start','end']);for(const choice of Object.values(occurrence))if(choice!=null&&!['earlier','later'].includes(choice))invalid();
  for(const [key,min,max] of [['capacity',1,1000],['waitlistCapacity',0,1000],['cancelBeforeMinutes',0,10080]])if(!Number.isSafeInteger(raw[key])||raw[key]<min||raw[key]>max)invalid();
  if(!Array.isArray(raw.eligiblePlanIds)||!raw.eligiblePlanIds.length||raw.eligiblePlanIds.length>50)invalid();
  const eligiblePlanIds=raw.eligiblePlanIds.map(idField);if(new Set(eligiblePlanIds).size!==eligiblePlanIds.length)invalid();
  const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const startsAt=instant(date,raw.startTime,timezone,occurrence.start),endsAt=instant(end===1440?next.toISOString().slice(0,10):date,end===1440?'00:00':raw.endTime,timezone,occurrence.end);
  if(Date.parse(endsAt)<=Date.parse(startsAt)||Date.parse(endsAt)-Date.parse(startsAt)>13*3600000)invalid();
  return {name,...(room?{room}:{}),...(instructorAssignmentId?{instructorAssignmentId}:{}),date,startTime:raw.startTime,endTime:raw.endTime,timezone,startsAt,endsAt,capacity:raw.capacity,waitlistCapacity:raw.waitlistCapacity,cancelBeforeMinutes:raw.cancelBeforeMinutes,eligiblePlanIds};
}
