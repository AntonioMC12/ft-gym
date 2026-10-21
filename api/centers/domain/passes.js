import {CentersError} from '../errors.js';
import {objectBody,textField} from './validation.js';
import {minorUnits,splitTax} from './money.js';
import {membershipDate} from './membership-transitions.js';
const invalid=()=>{throw new CentersError(400,'invalid-pass','explicit pass terms required')};
export function passFields(raw){
  objectBody(raw,['name','kind','credits','validDays','priceMinor','priceIncludesTax','taxBasisPoints']);
  const name=textField(raw.name,120,{required:true});
  if(!['paid','promotion'].includes(raw.kind)||!Number.isSafeInteger(raw.credits)||raw.credits<1||raw.credits>1000||!Number.isSafeInteger(raw.validDays)||raw.validDays<1||raw.validDays>3650||typeof raw.priceIncludesTax!=='boolean'||!Number.isSafeInteger(raw.taxBasisPoints)||raw.taxBasisPoints<0||raw.taxBasisPoints>10000)invalid();
  const price=minorUnits(raw.priceMinor);if(raw.kind==='paid'?price===0n:price!==0n)invalid();
  const money=splitTax(raw.priceMinor,raw);if(BigInt(money.totalMinor)>999999999999999n)invalid();
  return {name,kind:raw.kind,credits:raw.credits,validDays:raw.validDays,priceMinor:price.toString(),priceIncludesTax:raw.priceIncludesTax,taxBasisPoints:raw.taxBasisPoints,...money};
}
export function passDates(start,days,today){
  const startsOn=membershipDate(start);if(startsOn<today)invalid();
  const date=new Date(startsOn+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);const endsOn=date.toISOString().slice(0,10);membershipDate(endsOn);return {startsOn,endsOn};
}
export function passOptions(params,{own=false,products=false}={}){
  if([...params.keys()].some(key=>!['centerId','cursor',...(products?['archived']:own?[]:['memberId'])].includes(key)))invalid();
  const cursor=params.get('cursor')||null;if(cursor?.length>1024||products&&params.has('archived')&&!['all','active'].includes(params.get('archived')))invalid();
  return {cursor,archived:params.get('archived')==='all'};
}
