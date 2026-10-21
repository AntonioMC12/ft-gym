import {CentersError} from '../errors.js';
import {billingPeriod} from './billing-calendar.js';
import {minorUnits,roundRatio,splitTax} from './money.js';
import {membershipDate} from './membership-transitions.js';

export function previewCharge(subscription,periodStart,{baseState='preactive',changes=[]}={}) {
  if(subscription.canceled)throw new CentersError(409,'subscription-canceled','subscription canceled');
  const {priceIncludesTax,taxBasisPoints,proration,discountBasisPoints=0}=subscription;
  if(typeof priceIncludesTax!=='boolean'||taxBasisPoints==null||!['none','actual-days'].includes(proration))throw new CentersError(409,'billing-policy-required','tax and proration policy required');
  if(subscription.currency!=='EUR'||!Number.isSafeInteger(discountBasisPoints)||discountBasisPoints<0||discountBasisPoints>10000)throw new CentersError(400,'invalid-input','invalid billing conditions');
  const period=billingPeriod(periodStart,subscription),start=membershipDate(subscription.startsOn),end=subscription.endsOn==null?null:membershipDate(subscription.endsOn);
  const events=changes.filter(row=>!row.canceled).map(row=>({...row,effectiveOn:membershipDate(row.effectiveOn)})).sort((a,b)=>a.effectiveOn.localeCompare(b.effectiveOn)||(a.sequence||0)-(b.sequence||0));
  let activeDays=0,state=baseState,index=0;
  for(let date=period.start;date<period.end;){
    while(index<events.length&&events[index].effectiveOn<=date)state=events[index++].toState;
    if(date>=start&&(!end||date<end)&&state==='active')activeDays++;
    const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);
  }
  const price=minorUnits(subscription.priceMinor),chargeDays=proration==='actual-days'?activeDays:activeDays?period.days:0;
  const periodPrice=roundRatio(price,BigInt(chargeDays),BigInt(period.days)),discount=roundRatio(periodPrice,BigInt(discountBasisPoints),10000n),discounted=periodPrice-discount;
  return {calculationVersion:1,rounding:'half-up',currency:subscription.currency,subscriptionId:subscription.id,priceVersionId:subscription.priceVersionId,
    periodStart:period.start,periodEnd:period.end,periodDays:period.days,activeDays,chargeDays,priceMinor:subscription.priceMinor,
    proration,priceIncludesTax,taxBasisPoints,discountBasisPoints,periodPriceMinor:periodPrice.toString(),discountMinor:discount.toString(),
    ...splitTax(discounted.toString(),{priceIncludesTax,taxBasisPoints})};
}
