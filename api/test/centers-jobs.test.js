import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingPeriods,startBillingWorker} from '../centers/services/jobs.js';
import {centersConfig} from '../centers/config.js';
const terms={anchor_on:'2024-01-01',starts_on:'2024-01-31',ends_on:null,billing_day:1,interval_months:1,last_period:null};

test('automatic periods use calendar months, fixed next-fifth deadlines and preserve annual anchors and finite batches',()=>{
 assert.deepEqual(pendingPeriods(terms,'2024-01-31','2024-04-30').map(p=>p.periodStart),['2024-02-01','2024-03-01','2024-04-01']);
 assert.deepEqual(pendingPeriods({...terms,last_period:'2024-02-01'},'2024-01-31','2024-04-30').map(p=>p.periodStart),['2024-03-01','2024-04-01']);
 assert.deepEqual(pendingPeriods(terms,'2024-02-01','2024-02-28').map(p=>p.periodStart),['2024-02-01']);
 assert.deepEqual(pendingPeriods({...terms,anchor_on:'2024-01-31',billing_day:31,interval_months:12},'2024-02-01','2026-01-31').map(p=>p.periodStart),['2025-01-31','2026-01-31']);
 assert.deepEqual(pendingPeriods({...terms,ends_on:'2024-03-01'},'2024-01-31','2024-04-30').map(p=>p.periodStart),['2024-02-01']);
 assert.equal(pendingPeriods({...terms,starts_on:'2024-02-10',anchor_on:'2024-02-01'},'2024-02-01','2024-02-10')[0].dueOn,'2024-03-05');
});

test('worker is separately opt-in and stopping a disabled executor never resolves SQL',async()=>{
  assert.equal(centersConfig({CENTERS_ENABLED:'1'}).jobsEnabled,false);
  assert.equal(centersConfig({CENTERS_JOBS_ENABLED:'true'}).jobsEnabled,true);
  let opened=false;await startBillingWorker({platformTransaction(){opened=true;throw new Error()}},{enabled:false}).stop();assert.equal(opened,false);
});
