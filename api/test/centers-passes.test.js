import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passFields,passDates,passOptions} from '../centers/domain/passes.js';
import {accessPolicy} from '../centers/domain/access.js';
const terms={name:'Explicit pass',kind:'paid',credits:10,validDays:31,priceMinor:'1000',priceIncludesTax:true,taxBasisPoints:2100};
test('passes require explicit bounded terms and exact tax; free promotion is not a zero-priced paid pack',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(passFields(terms)).filter(([k])=>['netMinor','taxMinor','totalMinor'].includes(k))),{netMinor:'826',taxMinor:'174',totalMinor:'1000'});
  assert.equal(passFields({...terms,priceIncludesTax:false}).totalMinor,'1210');
  assert.equal(passFields({...terms,kind:'promotion',priceMinor:'0'}).totalMinor,'0');
  for(const fields of [{credits:0},{credits:1.5},{validDays:3651},{priceMinor:'0'},{kind:'promotion'},{priceIncludesTax:null},{taxBasisPoints:10001},{priceMinor:'1.00'},{netMinor:'1'}])assert.throws(()=>passFields({...terms,...fields}));
});
test('pass validity is an exclusive civil-date interval, including leap years',()=>{
  assert.deepEqual(passDates('2028-02-28',2,'2028-02-28'),{startsOn:'2028-02-28',endsOn:'2028-03-01'});assert.throws(()=>passDates('2028-02-27',2,'2028-02-28'));assert.throws(()=>passDates('2028-02-30',2,'2028-02-28'));
  assert.throws(()=>passOptions(new URLSearchParams({centerId:'c',memberId:'other'}),{own:true}));
});
test('pass access is explicitly opt-in and preserves legacy access command hashes',()=>{
  const old={enabled:true,requireSubscription:true,denyOverdue:false,graceDays:0};assert.deepEqual(accessPolicy(old),old);assert.deepEqual(accessPolicy({...old,allowPasses:false}),old);assert.equal(accessPolicy({...old,allowPasses:true}).allowPasses,true);assert.throws(()=>accessPolicy({...old,allowPasses:'true'}));
});
