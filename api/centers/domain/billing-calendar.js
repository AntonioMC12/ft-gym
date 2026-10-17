import {membershipDate} from './membership-transitions.js';
import {CentersError} from '../errors.js';
const invalid=()=>{throw new CentersError(400,'invalid-input','invalid billing calendar');};
export function calendarDate(year,month,day) {
  if(!Number.isSafeInteger(year)||year<1000||year>9999||!Number.isSafeInteger(month)||month<1||month>12||!Number.isSafeInteger(day)||day<1||day>31)invalid();
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function shiftBillingMonth(date,months,anchorDay) {
  membershipDate(date);if(!Number.isSafeInteger(months)||Math.abs(months)>12000)invalid();
  const [year,month]=date.split('-').map(Number),index=year*12+month-1+months;
  return calendarDate(Math.floor(index/12),index%12+1,anchorDay);
}
export function billingAnchor(start,day,intervalMonths) {
  if(intervalMonths===1)day=1;
  membershipDate(start);const [year,month]=start.split('-').map(Number),anchor=calendarDate(year,month,day);
  return anchor>start?shiftBillingMonth(anchor,-1,day):anchor;
}
export function billingPeriodStartFor(date,anchor,interval,day) {
  membershipDate(date);membershipDate(anchor);if(![1,3,6,12].includes(interval))invalid();
  if(interval===1)return date.slice(0,7)+'-01';
  if(date<=anchor)return anchor;
  const [year,month]=date.split('-').map(Number),[ay,am]=anchor.split('-').map(Number);
  let count=Math.floor(((year-ay)*12+month-am)/interval)*interval;
  let candidate=shiftBillingMonth(anchor,count,day);
  if(candidate>date){count-=interval;candidate=count<0?anchor:shiftBillingMonth(anchor,count,day)}
  return candidate;
}
export function billingPeriod(start,{anchorOn,billingDay,intervalMonths}) {
  if(intervalMonths===1){anchorOn=anchorOn.slice(0,7)+'-01';billingDay=1;}
  membershipDate(start);membershipDate(anchorOn);
  if(![1,3,6,12].includes(intervalMonths))invalid();
  const [year,month]=start.split('-').map(Number),[ay,am]=anchorOn.split('-').map(Number),offset=(year-ay)*12+month-am;
  if(offset<0||offset%intervalMonths!==0||shiftBillingMonth(anchorOn,offset,billingDay)!==start)invalid();
  const end=shiftBillingMonth(start,intervalMonths,billingDay),days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
  return {start,end,days};
}
