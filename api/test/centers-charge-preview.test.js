import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewCharge} from '../centers/domain/charge-preview.js';
import {splitTax,roundRatio,minorUnits} from '../centers/domain/money.js';
import {billingPeriodStartFor} from '../centers/domain/billing-calendar.js';
const base={id:'contract',priceVersionId:'price',startsOn:'2026-01-01',endsOn:null,anchorOn:'2026-01-01',billingDay:1,intervalMonths:1,priceMinor:'3100',currency:'EUR',priceIncludesTax:true,taxBasisPoints:0,proration:'actual-days',discountBasisPoints:0};
const quote=(patch={},events={},start='2026-01-01')=>previewCharge({...base,...patch},start,{baseState:'active',...events});
test('partial first period, percentage discount and tax balance exactly to cents',()=>{
  const result=quote({startsOn:'2026-01-16',discountBasisPoints:1000,taxBasisPoints:2000});
  assert.equal(result.periodDays,31);assert.equal(result.activeDays,16);assert.equal(result.periodPriceMinor,'1600');assert.equal(result.discountMinor,'160');
  assert.deepEqual([result.netMinor,result.taxMinor,result.totalMinor],['1200','240','1440']);
});
test('freeze/resume/end charge only effective active days; canceled events have no financial effect',()=>{
  const changes=[{effectiveOn:'2026-01-10',toState:'frozen',sequence:1},{effectiveOn:'2026-01-15',toState:'active',sequence:2},{effectiveOn:'2026-01-20',toState:'ended',sequence:3}];
  const result=quote({}, {changes});assert.equal(result.activeDays,14);assert.equal(result.totalMinor,'1400');
  assert.equal(quote({}, {changes:changes.map(event=>({...event,canceled:event.toState==='ended'}))}).activeDays,26);
  assert.equal(quote({proration:'none'}, {changes}).totalMinor,'3100');assert.equal(quote({proration:'none'}, {baseState:'frozen'}).totalMinor,'0');
});
test('leap-year annual and clamped quarterly periods preserve day 31 anchors',()=>{
  const annual=quote({startsOn:'2024-02-29',anchorOn:'2024-01-01',intervalMonths:12,priceMinor:'10000'}, {},'2024-01-01');assert.equal(annual.periodDays,366);assert.equal(annual.activeDays,307);assert.equal(annual.totalMinor,'8388');
  const quarterly=quote({startsOn:'2026-02-28',anchorOn:'2026-01-31',billingDay:31,intervalMonths:3,priceMinor:'8900'}, {},'2026-01-31');assert.equal(quarterly.periodEnd,'2026-04-30');assert.equal(quarterly.activeDays,61);assert.equal(quarterly.totalMinor,'6100');
  assert.equal(quote({anchorOn:'2026-01-31',billingDay:31,intervalMonths:3}, {},'2026-04-30').periodEnd,'2026-07-31');
});
test('tax-included/excluded, discounts and half-cent ties use explicit half-up rounding',()=>{
  assert.deepEqual(splitTax('1099',{priceIncludesTax:true,taxBasisPoints:2100}),{netMinor:'908',taxMinor:'191',totalMinor:'1099'});
  assert.deepEqual(splitTax('999',{priceIncludesTax:false,taxBasisPoints:2100}),{netMinor:'999',taxMinor:'210',totalMinor:'1209'});
  assert.equal(splitTax('1',{priceIncludesTax:false,taxBasisPoints:5000}).totalMinor,'2');
  assert.equal(quote({priceMinor:'1',discountBasisPoints:5000}).totalMinor,'0');
  assert.equal(quote({priceMinor:'1000000000000',priceIncludesTax:false,taxBasisPoints:10000}).totalMinor,'2000000000000');
  assert.equal(roundRatio(1n,1n,2n),1n);assert.throws(()=>roundRatio(1n,1n,0n),{status:400});assert.throws(()=>minorUnits('1.01'),{status:400});
});
test('states before the period and same-day events resolve in sequence order without jobs',()=>{
  const changes=[{effectiveOn:'2025-12-10',toState:'frozen',sequence:1},{effectiveOn:'2026-01-15',toState:'active',sequence:2},{effectiveOn:'2026-01-15',toState:'frozen',sequence:3},{effectiveOn:'2026-01-20',toState:'active',sequence:4}];
  assert.equal(quote({}, {changes}).activeDays,12);
  assert.equal(quote({endsOn:'2026-01-01'}).totalMinor,'0');
});
test('unconfigured fiscal policy, canceled contracts and non-boundary periods cannot produce a quote',()=>{
  for(const patch of [{priceIncludesTax:null,taxBasisPoints:null},{proration:null},{canceled:true}])assert.throws(()=>quote(patch),{status:409});
  assert.throws(()=>quote({}, {},'2026-01-15'),{status:400});assert.throws(()=>quote({discountBasisPoints:10001}),{status:400});
  assert.throws(()=>quote({anchorOn:'2026-01-31',billingDay:31,intervalMonths:3}, {},'2026-02-28'),{status:400});
});
test('monthly preview uses calendar months while quarterly retains its original phase',()=>{
  assert.equal(billingPeriodStartFor('2026-03-01','2026-01-31',1,31),'2026-03-01');
  assert.equal(billingPeriodStartFor('2026-04-29','2026-01-31',3,31),'2026-01-31');
  assert.equal(billingPeriodStartFor('2026-05-01','2026-01-31',3,31),'2026-04-30');
  assert.equal(billingPeriodStartFor('2025-01-01','2026-01-31',1,31),'2025-01-01');
});
