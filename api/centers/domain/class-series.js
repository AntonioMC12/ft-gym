import {CentersError} from '../errors.js';
import {objectBody} from './validation.js';
import {membershipDate} from './membership-transitions.js';
import {classFields} from './classes.js';

export const SERIES_MAX_CLASSES=25,SERIES_MAX_DAYS=93;
const invalid=()=>{throw new CentersError(400,'invalid-class-series','bounded weekly dates and explicit weekdays required')};

// Normalize without the current center timezone, so completed command replay is
// stable even if the center later changes its timezone. Real dates use classFields.
export function classSeriesInput(rawFields,rawRule,expectedTimezone){
  const normalized=classFields(rawFields,{timezone:'UTC'}),{timezone,startsAt,endsAt,...fields}=normalized;
  const occurrence=typeof rawFields.disambiguation==='string'?{start:rawFields.disambiguation,end:rawFields.disambiguation}:rawFields.disambiguation||{};
  fields.disambiguation={start:occurrence.start||null,end:occurrence.end||null};
  if(typeof expectedTimezone!=='string'||!expectedTimezone||expectedTimezone.length>80)invalid();
  objectBody(rawRule,['until','weekdays','excludedDates']);
  const until=membershipDate(rawRule.until),distance=(Date.parse(until+'T00:00:00Z')-Date.parse(fields.date+'T00:00:00Z'))/86400000;
  if(distance<0||distance>SERIES_MAX_DAYS||!Array.isArray(rawRule.weekdays)||!rawRule.weekdays.length||rawRule.weekdays.length>7)invalid();
  const weekdays=[...rawRule.weekdays].sort((a,b)=>a-b);
  if(weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(weekdays).size!==weekdays.length)invalid();
  const rawExcluded=rawRule.excludedDates??[];
  if(!Array.isArray(rawExcluded)||rawExcluded.length>SERIES_MAX_DAYS+1)invalid();
  const excludedDates=rawExcluded.map(membershipDate).sort();if(new Set(excludedDates).size!==excludedDates.length)invalid();
  const dates=[];for(let day=0;day<=distance;day++){
    const instant=new Date(fields.date+'T00:00:00Z');instant.setUTCDate(instant.getUTCDate()+day);
    if(weekdays.includes(instant.getUTCDay()))dates.push(instant.toISOString().slice(0,10));
  }
  if(!dates.length||excludedDates.some(date=>!dates.includes(date)))invalid();
  const excluded=new Set(excludedDates);
  return {fields,timezone:expectedTimezone,rule:{until,weekdays,excludedDates},dates:dates.map(date=>({date,excluded:excluded.has(date)}))};
}
