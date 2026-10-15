import {CentersError} from '../errors.js';
import {objectBody,textField} from './validation.js';
import {membershipDate} from './membership-transitions.js';

const invalid=()=>{throw new CentersError(400,'invalid-input','explicit freeze policy and civil dates required')};
export function freezePolicy(raw){
  objectBody(raw,['enabled','minDays','maxDays','noticeDays','maxDaysPerYear','billingEffect']);
  if(typeof raw.enabled!=='boolean'||raw.billingEffect!=='contract-proration')invalid();
  for(const [key,min,max] of [['minDays',1,366],['maxDays',1,366],['noticeDays',0,366],['maxDaysPerYear',1,366]]){
    if(!Number.isSafeInteger(raw[key])||raw[key]<min||raw[key]>max)invalid();
  }
  if(raw.minDays>raw.maxDays||raw.maxDays>raw.maxDaysPerYear)invalid();
  return Object.fromEntries(['enabled','minDays','maxDays','noticeDays','maxDaysPerYear','billingEffect'].map(key=>[key,raw[key]]));
}
const day=date=>Date.parse(membershipDate(date)+'T00:00:00Z')/86400000;
export function freezeRequest(raw,policy,{today,usedByYear={}}){
  objectBody(raw,['effectiveOn','resumeOn','reason']);
  if(!policy?.enabled)throw new CentersError(409,'freeze-disabled','self-service freezing is not enabled');
  policy=freezePolicy(policy);
  const effectiveOn=membershipDate(raw.effectiveOn),resumeOn=membershipDate(raw.resumeOn),days=day(resumeOn)-day(effectiveOn);
  if(day(effectiveOn)-day(today)<policy.noticeDays||days<policy.minDays||days>policy.maxDays)throw new CentersError(409,'freeze-limits','freeze dates exceed configured limits');
  const byYear={};
  for(let year=+effectiveOn.slice(0,4);year<=+resumeOn.slice(0,4);year++){
    const count=Math.max(0,Math.min(day(resumeOn),Date.UTC(year+1,0,1)/86400000)-Math.max(day(effectiveOn),day(String(year).padStart(4,'0')+'-01-01')));
    if(!count)continue;
    if(count+(usedByYear[year]||0)>policy.maxDaysPerYear)throw new CentersError(409,'freeze-limits','annual freeze allowance exceeded');
    byYear[year]=count;
  }
  return {effectiveOn,resumeOn,reason:textField(raw.reason,250,{required:true}),days,byYear};
}
