import {CentersError} from '../errors.js';
import {textField} from './validation.js';
const invalid=()=>{throw new CentersError(400,'invalid-input','invalid membership plan conditions');};

// Canonical decimal text in minor units keeps HTTP/SQL values exact (no float round trips).
export function planFields(raw) {
  const name=textField(raw.name,120,{required:true});
  if(typeof raw.priceMinor!=='string'||!/^(0|[1-9]\d{0,12})$/.test(raw.priceMinor)||BigInt(raw.priceMinor)>1000000000000n)invalid();
  if(raw.currency!=='EUR'||![1,3,6,12].includes(raw.intervalMonths))invalid();
  const priceIncludesTax=raw.priceIncludesTax??null,taxBasisPoints=raw.taxBasisPoints??null,proration=raw.proration??null;
  if(priceIncludesTax!==null&&typeof priceIncludesTax!=='boolean'||taxBasisPoints!==null&&(!Number.isSafeInteger(taxBasisPoints)||taxBasisPoints<0||taxBasisPoints>10000))invalid();
  if((priceIncludesTax===null)!==(taxBasisPoints===null)||proration!==null&&!['none','actual-days'].includes(proration))invalid();
  return {name,priceMinor:raw.priceMinor,currency:raw.currency,intervalMonths:raw.intervalMonths,priceIncludesTax,taxBasisPoints,proration};
}
export const PLAN_FIELDS=['name','priceMinor','currency','intervalMonths','priceIncludesTax','taxBasisPoints','proration'];
export function membershipPlanDto(row) {
  return {id:row.plan_id,centerId:row.center_id,version:row.version,archived:row.archived_at!==null,
    priceVersionId:row.id,revision:row.revision,name:row.name,priceMinor:row.price_minor,currency:row.currency,
    intervalMonths:row.interval_months,priceIncludesTax:row.price_includes_tax,taxBasisPoints:row.tax_basis_points,proration:row.proration,
    conditionsReady:row.price_includes_tax!==null&&row.tax_basis_points!==null&&row.proration!==null};
}
