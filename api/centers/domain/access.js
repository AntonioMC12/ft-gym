import {CentersError} from '../errors.js';
import {objectBody} from './validation.js';

const invalid=message=>{throw new CentersError(400,'invalid-access-policy',message)};
export const ACCESS_TOKEN_LIFETIME_MS=45000;
export function accessPolicy(value){
  objectBody(value,['enabled','requireSubscription','denyOverdue','graceDays']);
  if(typeof value.enabled!=='boolean'||typeof value.requireSubscription!=='boolean'||typeof value.denyOverdue!=='boolean'||!Number.isSafeInteger(value.graceDays)||value.graceDays<0||value.graceDays>365)invalid('explicit access policy required');
  return {enabled:value.enabled,requireSubscription:value.requireSubscription,denyOverdue:value.denyOverdue,graceDays:value.graceDays};
}
export const DEFAULT_ACCESS_POLICY=Object.freeze({enabled:false,requireSubscription:true,denyOverdue:false,graceDays:15});

// Wall-clock opening hours use the center's IANA zone; token expiry uses absolute
// time. In a DST fold both occurrences of an open local minute are open.
export function localAccessClock(now,timezone){
  if(!Number.isSafeInteger(now)||now<0)invalid('server time required');
  if(typeof timezone!=='string'||!timezone)invalid('center timezone required');
  let parts;try{parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now))}catch{invalid('invalid center timezone')}
  const fields=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const today=`${fields.year}-${fields.month}-${fields.day}`,day=new Date(today+'T12:00:00Z').getUTCDay();
  return {today,day,minute:Number(fields.hour)*60+Number(fields.minute)};
}
const minuteOf=value=>{
  if(value==='24:00')return 1440;
  if(typeof value!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return null;
  return Number(value.slice(0,2))*60+Number(value.slice(3));
};
export function centerIsOpen(hours,clock){
  if(!hours||typeof hours!=='object'||Array.isArray(hours))return false;
  const intervals=hours[clock.day];
  if(!Array.isArray(intervals)||intervals.length>4)return false;
  let end=0,open=false;
  for(const pair of intervals){
    if(!Array.isArray(pair)||pair.length!==2)return false;
    const from=minuteOf(pair[0]),to=minuteOf(pair[1]);
    if(from===null||to===null||from<end||from>=to)return false;
    if(clock.minute>=from&&clock.minute<to)open=true;
    end=to;
  }
  return open;
}
// Inputs are a fresh SQL projection, never claims from the QR. Financial detail
// is intentionally reduced to a boolean before constructing reception responses.
export function decideAccess({policy=DEFAULT_ACCESS_POLICY,center,member,hasSubscription,hasOverdue,manualHold=false,now}){
  if(policy.enabled!==true)return {allowed:false,reason:'not-configured'};
  if(center?.state!=='active')return {allowed:false,reason:'center-inactive'};
  const clock=localAccessClock(now,center.timezone);
  if(!member||member.state!=='active'||typeof member.joinedOn!=='string'||member.joinedOn>clock.today||member.endsOn&&member.endsOn<=clock.today)return {allowed:false,reason:'membership-inactive'};
  if(manualHold)return {allowed:false,reason:'manual-hold'};
  if(!centerIsOpen(center.openingHours,clock))return {allowed:false,reason:'closed'};
  if(policy.requireSubscription&&hasSubscription!==true)return {allowed:false,reason:'no-current-subscription'};
  if(policy.denyOverdue&&hasOverdue!==false)return {allowed:false,reason:'account-review'};
  return {allowed:true,reason:null};
}
export function accessToken(value){return typeof value==='string'&&/^gqr1_[A-Za-z0-9_-]{43}$/.test(value)?value:null}
export function deviceCredential(value){return typeof value==='string'&&/^gdev1_[A-Za-z0-9_-]{43}$/.test(value)?value:null}
export function tokenIsCurrent({issuedAt,expiresAt,consumedAt,invalidatedAt},now){
  return Number.isSafeInteger(now)&&Number.isSafeInteger(issuedAt)&&Number.isSafeInteger(expiresAt)&&consumedAt==null&&invalidatedAt==null&&issuedAt<=now&&expiresAt>now&&expiresAt-issuedAt===ACCESS_TOKEN_LIFETIME_MS;
}
