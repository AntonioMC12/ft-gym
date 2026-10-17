import {test} from 'node:test';import assert from 'node:assert/strict';
import {feeAccess,renewalPeriod,initialCoverage,passState} from '../centers/domain/renewals.js';
import {renewalGateExempt,applicationAccess} from '../centers/services/application-access.js';
test('monthly validity always includes the fifth of the following month, then expires on the sixth',()=>{
 for(const [end,fifth,sixth] of [['2026-11-01','2026-11-05','2026-11-06'],['2028-03-01','2028-03-05','2028-03-06'],['2027-01-01','2027-01-05','2027-01-06']]){
  assert.deepEqual(feeAccess(fifth,end),{status:'grace',blocked:false,expiresOn:fifth,deadline:fifth});
  assert.equal(feeAccess(sixth,end).blocked,true);
 }
 assert.equal(feeAccess('2026-10-31','2026-11-01').status,'active');
 assert.equal(feeAccess('2026-10-16',null).blocked,false);
 assert.equal(feeAccess('2026-11-10','2026-11-01',{intervalMonths:3}).blocked,false);
});
test('monthly renewals use the current calendar month on every registration day, including leap years and December',()=>{
 for(const [month,next,days] of [['2026-10','2026-11',31],['2028-02','2028-03',29],['2026-12','2027-01',31]]){
  for(let n=1;n<=days;n++){const registered=month+'-'+String(n).padStart(2,'0');assert.deepEqual(renewalPeriod(registered,{anchorOn:month+'-28',billingDay:28,intervalMonths:1}),{start:month+'-01',end:next+'-01',days});assert.equal(initialCoverage({startsOn:registered,anchorOn:month+'-01',billingDay:28,intervalMonths:1}),next+'-01');}
 }
 const quarterly={anchorOn:'2028-01-31',billingDay:31,intervalMonths:3};assert.equal(renewalPeriod('2028-03-10',quarterly).end,'2028-04-30');
});

test('the recovery exception list cannot bypass private APIs, including own training',()=>{
 for(const path of ['GET /api/centers/app-access','POST /api/logout','POST /api/logout/all','GET /api/me'])assert.equal(renewalGateExempt(path),true,path);
 for(const path of ['GET /api/data','PUT /api/data','GET /api/centers/own/training','GET /api/centers/own/classes','POST /api/centers/own/access/token'])assert.equal(renewalGateExempt(path),false,path);
});
test('administrators are exempt without depending on SQL availability',async()=>{assert.equal((await applicationAccess({}, {enabled:true,superadminUids:[]},{id:'admin',admin:true})).blocked,false)});
test('pass states distinguish balance, expiration and unavailable conditions',()=>{
 const p={remaining:1,startsOn:'2026-10-01',endsOn:'2026-11-01',available:true};assert.equal(passState(p,'2026-10-16'),'active');assert.equal(passState({...p,remaining:0},'2026-10-16'),'exhausted');assert.equal(passState(p,'2026-11-01'),'expired');assert.equal(passState({...p,available:false},'2026-10-16'),'unavailable');
});
