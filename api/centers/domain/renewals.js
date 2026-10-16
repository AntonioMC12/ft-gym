import {shiftBillingMonth,billingPeriodStartFor,billingPeriod} from './billing-calendar.js';
export function renewalPeriod(today,contract){
 const start=billingPeriodStartFor(today,contract.anchorOn,contract.intervalMonths,contract.billingDay);
 return billingPeriod(start,contract);
}
// endsOn is the exclusive end: the previous day is the displayed expiry date.
export function feeAccess(today,endsOn){
 if(!endsOn)return {status:'none',blocked:false,expiresOn:null,deadline:null};
 const day=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const expiresOn=day(endsOn,-1),deadline=day(expiresOn,10);
 return {status:today<endsOn?'active':today<=deadline?'grace':'expired',blocked:today>deadline,expiresOn,deadline};
}
export function initialCoverage(contract){return shiftBillingMonth(contract.anchorOn,contract.intervalMonths,contract.billingDay)}
export function passState(row,today){return row.revoked?'revoked':row.remaining<=0?'exhausted':row.endsOn<=today?'expired':row.startsOn>today?'scheduled':row.available?'active':'unavailable'}
