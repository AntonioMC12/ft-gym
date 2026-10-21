import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progressShareFields,sharedProgress} from '../centers/domain/shared-progress.js';
test('shared progress requires explicit limited scope and never accepts identity or implicit future selectors',()=>{
  assert.deepEqual(progressShareFields({enabled:false}),{enabled:false,routineIds:[],from:null,to:null});
  assert.deepEqual(progressShareFields({enabled:true,routineIds:['b','a'],from:'2026-01-01',to:'2026-01-31'}).routineIds,['a','b']);
  for(const fields of [{enabled:true},{enabled:true,routineIds:['a','a'],from:'2026-01-01',to:'2026-01-31'},{enabled:true,routineIds:['a'],from:'2026-02-30',to:'2026-03-01'},{enabled:true,routineIds:['a'],from:'2025-01-01',to:'2026-01-02'},{enabled:false,accountUid:'other'}])assert.throws(()=>progressShareFields(fields),{status:400});
});
test('shared projection includes only chosen routine names and bounded saved-session counts, excluding tombstones and all private payloads',()=>{
  const state={routines:[{id:'a',name:'Chosen'},{id:'secret',name:'PRIVATE_NAME'}],active:{routineIds:['a'],d:'2026-01-14'},workouts:[
    {id:'one',d:'2026-01-13',routineIds:['a','a','secret'],note:'PRIVATE_NOTE',entries:[{sets:[{w:987,r:100,done:true}],note:'PRIVATE_SET'}]},
    {id:'one',d:'2026-01-13',routineIds:['a']},{id:'two',d:'2026-01-14',routineIds:[],routineId:'a'},
    {id:'removed',d:'2026-01-14',routineIds:['a']},{id:'other',d:'2026-01-14',routineIds:['secret']},
    {id:'outside',d:'2025-12-31',routineIds:['a']},{id:'future',d:'2026-01-20',routineIds:['a']},{id:'invalid',d:'2026-02-30',routineIds:['a']}],
    deleted:{workouts:{removed:2}},bodyweight:[{v:777}],photos:['PRIVATE_PHOTO']};
  const report=sharedProgress(state,{routineIds:['a','gone'],from:'2026-01-01',to:'2026-01-14'});
  assert.deepEqual(report.routines[0],{name:'Chosen',sessions:2,days:2,lastSessionOn:'2026-01-14',weeks:[{from:'2026-01-12',sessions:2}]});
  assert.deepEqual(report.routines[1],{name:null,sessions:0,days:0,lastSessionOn:null,weeks:[]});
  for(const word of ['PRIVATE','987','777','active','routineIds','note','entries','photos','bodyweight'])assert.ok(!JSON.stringify(report).includes(word),word);
});
