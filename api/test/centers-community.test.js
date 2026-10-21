import {test} from 'node:test';
import assert from 'node:assert/strict';
import {achievementMetrics,savedWorkouts,workoutSnapshot} from '../centers/domain/community.js';
const w=(id,d,sets=[{done:true,r:10,w:40}])=>({id,d,start:1,end:2,name:'Session',entries:[{id:'0025',sets}],prs:[]});
test('declared sessions exclude duplicate IDs, tombstones, future dates, malformed dates, unfinished records and warmups',()=>{
 const good=w('a','2026-10-19'),warm=w('warm','2026-10-18',[{done:true,r:10,w:40,phase:'warm_up'}]);
 const data={workouts:[good,good,warm,w('future','2026-10-20'),w('bad','2026-02-30'),{...w('unfinished','2026-10-17'),end:null},w('deleted','2026-10-17')],deleted:{workouts:{deleted:100}}};
 assert.deepEqual(savedWorkouts(data,'2026-10-19').map(w=>w.id),['a']);
 assert.deepEqual(achievementMetrics(data,'2026-10-19').earned,{'first-session':'2026-10-19'});
});
test('phase precedence and partial side work follow existing training semantics; snapshot excludes unchecked limbs and warmups',()=>{
 const partial={done:false,sides:{L:{done:true,w:12,r:8},R:{done:false,w:99,r:1}}},explicit={done:true,w:10,r:10,phase:'work',warmup:true};
 const state={unit:'lb',workouts:[w('side','2026-10-19',[partial,explicit,{done:true,w:999,r:99,phase:'warmup'}])]};
 assert.equal(achievementMetrics(state,'2026-10-19').sessions,1);
 assert.deepEqual(workoutSnapshot(state,'side',true,'2026-10-19').exercises[0].sets,[{reps:8,load:12},{reps:10,load:10}]);
 assert.deepEqual(workoutSnapshot(state,'side',false,'2026-10-19'),{workoutId:'side',date:'2026-10-19',title:'Session'});
});
test('weeks use distinct Monday calendar weeks, never session count or duplicate days; stable IDs recompute after deletion',()=>{
 const workouts=Array.from({length:10},(_,i)=>w(String(i),['2026-09-28','2026-10-05','2026-10-12','2026-10-19'][Math.min(i,3)]));workouts[1].prs=['0025'];
 const result=achievementMetrics({workouts},'2026-10-19');assert.equal(result.earned['four-weeks'],'2026-10-19');assert.equal(result.earned['ten-sessions'],'2026-10-19');assert.equal(result.earned['first-record'],'2026-10-05');
 const removed=achievementMetrics({workouts:workouts.filter(w=>w.d!=='2026-10-05')},'2026-10-19');assert.equal(removed.earned['four-weeks'],undefined);assert.equal(removed.earned['first-record'],undefined);assert.notEqual(result.sourceHash,removed.sourceHash);
 assert.throws(()=>workoutSnapshot({workouts:[]},'not-mine',false,'2026-10-19'),e=>e.code==='community-workout-unavailable');
});

test('time and cardio legacy records count positive completed work; a load without repetitions or duration does not',()=>{
 const workouts=[w('time','2026-10-19',[{done:true,seconds:30}]),w('cardio','2026-10-19',[{done:true,min:20,speed:8}]),w('empty','2026-10-19',[{done:true,w:40,r:0}])];
 assert.deepEqual(savedWorkouts({workouts},'2026-10-19').map(w=>w.id),['time','cardio']);
});
