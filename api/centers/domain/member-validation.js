import { CentersError } from '../errors.js';
import { textField } from './validation.js';

const invalid=()=>{throw new CentersError(400,'invalid-input','invalid member details');};
export function memberFields(body) {
  const name=textField(body.name,120,{required:true}),email=textField(body.email,254),phone=textField(body.phone,40),nationalDocument=textField(body.nationalDocument,40);
  if([name,email,phone,nationalDocument].some(value=>value&&/[\u0000-\u001f\u007f]/.test(value)))invalid();
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))invalid();
  return {name,email,phone,nationalDocument};
}
export function memberListOptions(params) {
  const query=(params.get('query')||'').trim(),state=params.get('state')||'',raw=params.get('limit')||'50';
  if(query.length>120||/[\u0000-\u001f\u007f]/.test(query)||!/^\d{1,3}$/.test(raw)||+raw<1||+raw>100||
    (state&&!['preactive','active','frozen','ended'].includes(state)))invalid();
  const cursor=params.get('cursor')||'';
  if(cursor.length>2000)invalid();
  return {query,state,limit:+raw,cursor};
}
