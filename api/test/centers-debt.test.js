import {test} from 'node:test';
import assert from 'node:assert/strict';
import {debtPolicy,debtState,csvCell,debtCsv} from '../centers/domain/debt.js';
import {debtListOptions} from '../centers/services/debt.js';
test('debt uses civil dates with inclusive due date and exact grace boundaries',()=>{
  assert.equal(debtState('1','2026-10-14','2026-10-13',15).status,'not-due');assert.equal(debtState('1','2026-10-14','2026-10-14',15).status,'due');
  assert.equal(debtState('1','2026-10-14','2026-10-15',15).status,'grace');assert.equal(debtState('1','2026-10-14','2026-10-29',15).status,'grace');assert.equal(debtState('1','2026-10-14','2026-10-30',15).status,'overdue');
  assert.equal(debtState('1','2026-10-14','2026-10-15',0).status,'overdue');assert.equal(debtState('0','2020-01-01','2026-10-14',15).status,'settled');
  assert.deepEqual(debtState('900719925474099','2024-02-28','2024-03-01',15),{status:'grace',lateDays:2});assert.equal(debtState('1','2026-03-28','2026-03-30',1).lateDays,2);
});
test('debt cannot silently invent grace or suspend accounts from an unsupported policy',()=>{
  assert.deepEqual(debtPolicy({version:1,graceDays:15,automaticSuspension:false}),{version:1,graceDays:15,automaticSuspension:false});for(const value of [{},{version:2,graceDays:15,automaticSuspension:false},{version:1,graceDays:-1,automaticSuspension:false},{version:1,graceDays:15,automaticSuspension:true}])assert.throws(()=>debtPolicy(value),{code:'debt-policy-required'});
});
test('debt filters reject malformed dates, reversed ranges, excessive range and export cursors',()=>{
  assert.equal(debtListOptions(new URLSearchParams()).limit,30);for(const q of ['dueFrom=2026-10-01','dueFrom=2026-10-15&dueTo=2026-10-01','dueFrom=2024-01-01&dueTo=2026-01-01','limit=101','dueFrom=2026-02-30&dueTo=2026-03-01'])assert.throws(()=>debtListOptions(new URLSearchParams(q)),{code:'invalid-input'});assert.throws(()=>debtListOptions(new URLSearchParams('cursor=old'),{exporting:true}),{code:'invalid-input'});
});
test('CSV escapes separators, quotes and dangerous formula/control/full-width prefixes as visible text',()=>{
  for(const name of ['=HYPERLINK("https://invalid")',' +SUM(1,2)','-1+1','@name','\t=1','\r=1','\n=1','＝1+1','＋1','－1','＠a','\u200B=1'])assert.ok(csvCell(name).startsWith('"[text] '),JSON.stringify(name));
  assert.equal(csvCell('Normal, "name"'),'"Normal, ""name"""');assert.equal(csvCell('\u0000=1'),'"[text] =1"');assert.equal(csvCell('M-000001'),'"M-000001"');
  const text=debtCsv([{centerId:'c',memberNumber:'M-1',memberName:'=1+1',id:'r',periodStart:'2026-10-01',periodEnd:'2026-11-01',dueOn:'2026-10-14',currency:'EUR',totalMinor:'900719925474099',paidMinor:'0',refundedMinor:'0',balanceMinor:'900719925474099',debt:{status:'due'}}]);assert.ok(text.startsWith('\uFEFF'));assert.ok(text.includes('"9007199254740.99"'));assert.ok(text.includes('"[text] =1+1"'));
});
