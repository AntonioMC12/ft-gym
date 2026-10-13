import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarDate,billingAnchor,shiftBillingMonth} from '../centers/domain/billing-calendar.js';
test('billing dates clamp short months without losing the original day 31',()=>{
  assert.equal(calendarDate(2024,2,31),'2024-02-29');assert.equal(calendarDate(2025,2,31),'2025-02-28');
  assert.equal(shiftBillingMonth('2024-02-29',1,31),'2024-03-31');assert.equal(shiftBillingMonth('2024-01-31',3,31),'2024-04-30');
  assert.equal(shiftBillingMonth('2024-02-29',12,29),'2025-02-28');assert.equal(shiftBillingMonth('2025-02-28',36,29),'2028-02-29');
});
test('first period anchors before the subscription start in the center calendar',()=>{
  assert.equal(billingAnchor('2026-10-13',31),'2026-09-30');assert.equal(billingAnchor('2026-10-13',1),'2026-10-01');
  assert.equal(billingAnchor('2024-02-29',31),'2024-02-29');
});
test('calendar helpers reject impossible ISO dates, invalid days and out of range shifts',()=>{
  for(const day of [0,32,1.5])assert.throws(()=>billingAnchor('2026-10-13',day),{status:400});
  assert.throws(()=>shiftBillingMonth('2026-02-30',1,31),{status:400});assert.throws(()=>shiftBillingMonth('9999-12-31',1,31),{status:400});
});
