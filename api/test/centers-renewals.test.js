import {test} from 'node:test';import assert from 'node:assert/strict';
import {feeAccess,renewalPeriod,passState} from '../centers/domain/renewals.js';
import {renewalGateExempt,applicationAccess} from '../centers/services/application-access.js';
test('ten civil grace days follow the last covered day, including month/year/leap boundaries',()=>{
 assert.deepEqual(feeAccess('2026-11-10','2026-11-01'),{status:'grace',blocked:false,expiresOn:'2026-10-31',deadline:'2026-11-10'});
 assert.equal(feeAccess('2026-11-11','2026-11-01').blocked,true);assert.equal(feeAccess('2026-10-31','2026-11-01').status,'active');
 assert.equal(feeAccess('2028-03-10','2028-03-01').blocked,false);assert.equal(feeAccess('2028-03-11','2028-03-01').blocked,true);
 assert.equal(feeAccess('2027-01-10','2027-01-01').blocked,false);assert.equal(feeAccess('2027-01-11','2027-01-01').blocked,true);
 assert.equal(feeAccess('2026-10-16',null).blocked,false);
});
test('renewal uses the contracted calendar and interval, never a fixed 30 days',()=>{
 const monthly={anchorOn:'2028-01-31',billingDay:31,intervalMonths:1};assert.deepEqual(renewalPeriod('2028-02-20',monthly),{start:'2028-01-31',end:'2028-02-29',days:29});
 assert.deepEqual(renewalPeriod('2028-03-10',monthly),{start:'2028-02-29',end:'2028-03-31',days:31});
 assert.equal(renewalPeriod('2028-03-10',{...monthly,intervalMonths:3}).end,'2028-04-30');
});
test('the recovery exception list cannot bypass private APIs, including own training',()=>{
 for(const path of ['GET /api/centers/app-access','POST /api/logout','POST /api/logout/all','GET /api/me'])assert.equal(renewalGateExempt(path),true,path);
 for(const path of ['GET /api/data','PUT /api/data','GET /api/centers/own/training','GET /api/centers/own/classes','POST /api/centers/own/access/token'])assert.equal(renewalGateExempt(path),false,path);
});
test('administrators are exempt without depending on SQL availability',async()=>{assert.equal((await applicationAccess({}, {enabled:true,superadminUids:[]},{id:'admin',admin:true})).blocked,false)});
test('pass states distinguish balance, expiration and unavailable conditions',()=>{
 const p={remaining:1,startsOn:'2026-10-01',endsOn:'2026-11-01',available:true};assert.equal(passState(p,'2026-10-16'),'active');assert.equal(passState({...p,remaining:0},'2026-10-16'),'exhausted');assert.equal(passState(p,'2026-11-01'),'expired');assert.equal(passState({...p,available:false},'2026-10-16'),'unavailable');
});
