import {shiftBillingMonth,billingPeriodStartFor,billingPeriod} from './billing-calendar.js';
export function renewalPeriod(today,contract){
 const start=billingPeriodStartFor(today,contract.anchorOn,contract.intervalMonths,contract.billingDay);
 return billingPeriod(start,contract);
}
// Economic periods end exclusively. Monthly validity includes the following fifth.
export function feeAccess(today,endsOn,{intervalMonths=1}={}){
 if(!endsOn)return {status:'none',blocked:false,expiresOn:null,deadline:null};
 const day=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const coveredThrough=day(endsOn,-1),deadline=intervalMonths===1?shiftBillingMonth(coveredThrough,1,5):day(coveredThrough,10),expiresOn=intervalMonths===1?deadline:coveredThrough;
 return {status:today<endsOn?'active':today<=deadline?'grace':'expired',blocked:today>deadline,expiresOn,deadline};
}
export function initialCoverage(contract){return contract.intervalMonths===1?shiftBillingMonth(contract.startsOn||contract.anchorOn,1,1):shiftBillingMonth(contract.anchorOn,contract.intervalMonths,contract.billingDay)}
export function passState(row,today){return row.revoked?'revoked':row.remaining<=0?'exhausted':row.endsOn<=today?'expired':row.startsOn>today?'scheduled':row.available?'active':'unavailable'}
