import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classFields,classTimeCandidates} from '../centers/domain/classes.js';
const base={name:'Fictional class',date:'2026-10-20',startTime:'18:00',endTime:'19:00',capacity:10,waitlistCapacity:5,cancelBeforeMinutes:60,eligiblePlanIds:['plan_a']};
test('class schedule requires explicit limits and named eligible plans, without financial penalties',()=>{
  const result=classFields(base,{timezone:'Europe/Madrid'});assert.equal(result.startsAt,'2026-10-20T16:00:00.000Z');assert.equal(result.endsAt,'2026-10-20T17:00:00.000Z');assert.equal(result.cancelBeforeMinutes,60);
  for(const raw of [{...base,capacity:0},{...base,waitlistCapacity:null},{...base,cancelBeforeMinutes:-1},{...base,eligiblePlanIds:[]},{...base,eligiblePlanIds:['a','a']},{...base,penaltyMinor:100},{...base,endTime:'17:00'}])assert.throws(()=>classFields(raw,{timezone:'Europe/Madrid'}));
});
test('timezone gaps fail and repeated hours require an explicit occurrence',()=>{
  assert.deepEqual(classTimeCandidates('2026-03-29','02:30','Europe/Madrid'),[]);
  assert.deepEqual(classTimeCandidates('2026-10-25','02:30','Europe/Madrid'),['2026-10-25T00:30:00.000Z','2026-10-25T01:30:00.000Z']);
  const raw={...base,date:'2026-10-25',startTime:'02:30',endTime:'03:30'};
  assert.throws(()=>classFields(raw,{timezone:'Europe/Madrid'}),{code:'class-time-ambiguous'});
  assert.equal(classFields({...raw,disambiguation:'later'},{timezone:'Europe/Madrid'}).startsAt,'2026-10-25T01:30:00.000Z');
  const acrossFold=classFields({...raw,startTime:'02:15',endTime:'02:45',disambiguation:{start:'earlier',end:'later'}},{timezone:'Europe/Madrid'});
  assert.equal((Date.parse(acrossFold.endsAt)-Date.parse(acrossFold.startsAt))/60000,90);
});
test('quarter-hour zones, end-of-day and non-DST zones preserve civil semantics independently of process timezone',()=>{
  assert.equal(classFields({...base,startTime:'23:00',endTime:'24:00'},{timezone:'Asia/Kathmandu'}).endsAt,'2026-10-20T18:15:00.000Z');
  assert.equal(classTimeCandidates('2026-10-20','18:00','Asia/Kolkata')[0],'2026-10-20T12:30:00.000Z');
  assert.throws(()=>classFields({...base,date:'2026-02-30'},{timezone:'Europe/Madrid'}),{code:'invalid-input'});
});
