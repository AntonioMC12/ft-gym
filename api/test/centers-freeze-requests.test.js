import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freezePolicy,freezeRequest} from '../centers/domain/freeze-requests.js';
const policy={enabled:true,minDays:2,maxDays:30,noticeDays:2,maxDaysPerYear:30,billingEffect:'contract-proration'};
test('freeze requests require explicit configuration and never invent a discount policy',()=>{
  assert.throws(()=>freezePolicy({enabled:true}),{code:'invalid-input'});
  assert.throws(()=>freezePolicy({...policy,billingEffect:'free-month'}),{code:'invalid-input'});
  assert.throws(()=>freezePolicy({...policy,maxDays:31}),{code:'invalid-input'});
  assert.throws(()=>freezeRequest({effectiveOn:'2026-10-20',resumeOn:'2026-10-22',reason:'Personal'},null,{today:'2026-10-15'}),{code:'freeze-disabled'});
});
test('civil date limits enforce notice, exclusive resumption, leap days and annual splitting',()=>{
  const input={effectiveOn:'2026-12-30',resumeOn:'2027-01-03',reason:' Travel '};
  assert.deepEqual(freezeRequest(input,policy,{today:'2026-12-28',usedByYear:{2026:28,2027:28}}),{...input,reason:'Travel',days:4,byYear:{2026:2,2027:2}});
  assert.throws(()=>freezeRequest(input,policy,{today:'2026-12-29'}),{code:'freeze-limits'});
  assert.throws(()=>freezeRequest(input,policy,{today:'2026-12-28',usedByYear:{2027:29}}),{code:'freeze-limits'});
  assert.equal(freezeRequest({effectiveOn:'2028-02-28',resumeOn:'2028-03-01',reason:'Personal'},policy,{today:'2028-02-25'}).days,2);
  assert.throws(()=>freezeRequest({effectiveOn:'2027-02-29',resumeOn:'2027-03-02',reason:'Personal'},policy,{today:'2027-02-25'}),{code:'invalid-input'});
});
