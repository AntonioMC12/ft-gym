import { CentersError } from '../errors.js';
import { recordId } from '../authz.js';

const invalid = message => { throw new CentersError(400, 'invalid-input', message); };
export function objectBody(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('object required');
  if (Object.keys(body).some(key => !fields.includes(key))) invalid('unexpected field');
  return body;
}
export function textField(value, max, { required = false } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') invalid('text required');
  const text = value.trim();
  if (text.length > max || (required && !text)) invalid('invalid text length');
  return text || null;
}
export function idField(value) {
  if (!recordId(value)) invalid('invalid identifier');
  return value;
}
export function versionField(value) {
  if (!Number.isSafeInteger(value) || value < 1) invalid('version required');
  return value;
}
export function requestField(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) invalid('requestId required');
  return value;
}
export function centerFields(body) {
  const timezone = textField(body.timezone || 'Europe/Madrid', 80, { required: true });
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { invalid('invalid timezone'); }
  const capacity=body.capacity==null?null:body.capacity;
  if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1||capacity>100000))invalid('invalid capacity');
  const billingDay=body.billingDay??1;
  if(!Number.isSafeInteger(billingDay)||billingDay<1||billingDay>31)invalid('invalid billing day');
  const openingHours=body.openingHours??{};
  objectBody(openingHours,['0','1','2','3','4','5','6']);
  for(const intervals of Object.values(openingHours)){
    if(!Array.isArray(intervals)||intervals.length>4)invalid('invalid opening hours');
    let previous=0;
    for(const interval of intervals){
      if(!Array.isArray(interval)||interval.length!==2)invalid('invalid opening interval');
      const minute=value=>{
        if(typeof value!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)){if(value==='24:00')return 1440;invalid('invalid time');}
        return +value.slice(0,2)*60 + +value.slice(3);
      };
      const from=minute(interval[0]),to=minute(interval[1]);
      if(from<previous||from>=to)invalid('overlapping or reversed opening interval');
      previous=to;
    }
  }
  return { name:textField(body.name,120,{required:true}),taxId:textField(body.taxId,40),address:textField(body.address,250),
    contactEmail:textField(body.contactEmail,254),phone:textField(body.phone,40),timezone,capacity,billingDay,openingHours };
}
