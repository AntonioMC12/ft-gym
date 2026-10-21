import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignedStrength} from '../centers/domain/assigned-strength.js';
import {LIBRARY} from '../coach/core/library.js';
const set=(w,r,extra={})=>({w,r,done:true,...extra});
const entry=(sets,extra={})=>({id:'0025',rid:'assigned',target:{mode:'reps'},sets,...extra});
const workout=(id,d,entries)=>({id,d,routineIds:['assigned'],entries});
const options=(id='0025')=>({routineIds:['assigned'],allowedExercises:new Map([['assigned',new Set([id])]]),from:'2026-10-01',to:'2026-10-31'});
test('weekly reference pairs weight/reps from one completed set, ignoring warmups, unfinished rows and extras',()=>{
 const state={workouts:[workout('a','2026-10-05',[entry([set(60,8),set(40,20),set(100,12,{warmup:true}),set(200,2,{done:false}),set(50,5,{drops:[{w:40,r:99}]})])]),workout('b','2026-10-12',[entry([set(65,6),set(65,7)])])]};
 const before=structuredClone(state),result=assignedStrength(state,options())[0][0];
 assert.deepEqual(result.weeks,[{from:'2026-10-05',load:60,reps:8,sets:3},{from:'2026-10-12',load:65,reps:7,sets:2}]);assert.deepEqual(state,before);
});
test('does not mix other routines/exercises, active workouts, tombstones, duplicate sessions or future dates',()=>{
 const saved=workout('a','2026-10-05',[entry([set(60,8)]),entry([set(999,99)],{rid:'private'}),entry([set(888,88)],{id:'0043'})]);
 const state={workouts:[saved,saved,workout('deleted','2026-10-12',[entry([set(999,99)])]),workout('future','2026-11-01',[entry([set(999,99)])])],deleted:{workouts:{deleted:1}},active:workout('active','2026-10-20',[entry([set(999,99)])])};
 assert.deepEqual(assignedStrength(state,options())[0][0].weeks,[{from:'2026-10-05',load:60,reps:8,sets:1}]);
});
test('separates load meanings and sides, including only the completed side',()=>{
 const state={workouts:[workout('a','2026-10-05',[entry([set(20,8)],{target:{mode:'reps',dbLoad:'each'}}),entry([set(40,8)],{target:{mode:'reps',dbLoad:'total'}}),entry([{done:false,sides:{L:set(20,10),R:set(30,12,{done:false})}}])])]};
 const result=assignedStrength(state,options())[0];assert.equal(result.length,3);assert.deepEqual(result.map(row=>[row.side,row.dbLoad,row.weeks[0].load]),[['both','each',20],['both','total',40],['L','as',20]]);
});
test('assisted machines select the lowest assistance and retain reps from that set',()=>{
 const machine=LIBRARY.find(ex=>ex.eq==='leverage machine'&&/\bassist(ed)?\b/i.test(ex.n));assert.ok(machine);
 const state={workouts:[workout('a','2026-10-05',[entry([set(40,15),set(30,8)],{id:machine.id})])]};
 const result=assignedStrength(state,options(machine.id))[0][0];assert.equal(result.assisted,true);assert.equal(result.weeks[0].load,30);assert.equal(result.weeks[0].reps,8);
});
test('uses legacy single-routine attribution but skips ambiguous combined/freestyle entries and timed work',()=>{
 const legacy=entry([set(60,8)]);delete legacy.rid;
 const mixed=workout('b','2026-10-12',[legacy]);mixed.routineIds=['assigned','private'];
 const state={workouts:[workout('a','2026-10-05',[legacy]),mixed,workout('c','2026-10-19',[entry([set(50,10)],{rid:'private'}),legacy]),workout('d','2026-10-26',[entry([set(999,99)],{target:{mode:'time'}})])]};
 assert.deepEqual(assignedStrength(state,options())[0][0].weeks,[{from:'2026-10-05',load:60,reps:8,sets:1}]);
});
test('no data is not a zero-weight session and explicit phase overrides legacy warmup',()=>{
 const state={workouts:[workout('a','2026-10-05',[entry([set(null,8),set(50,null),set(20,0),set(0,12,{warmup:true,phase:'work'}),set(99,99,{phase:'warm-up'})])])]};
 assert.deepEqual(assignedStrength(state,options())[0][0].weeks,[{from:'2026-10-05',load:0,reps:12,sets:1}]);assert.deepEqual(assignedStrength(null,options()),[[]]);
});
