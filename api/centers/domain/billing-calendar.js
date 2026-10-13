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
export function billingAnchor(start,day) {
  membershipDate(start);const [year,month]=start.split('-').map(Number),anchor=calendarDate(year,month,day);
  return anchor>start?shiftBillingMonth(anchor,-1,day):anchor;
}
