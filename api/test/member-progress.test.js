import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progressProjection,savedWorkouts,progressPageOptions} from '../centers/services/member-progress.js';
test('progress projection retains old sessions, metrics and private definitions without notes, media or active session',()=>{
 const state={unit:'lb',active:{secret:'active'},notes:{secret:1},customEx:[{id:'custom',n:'Private',eq:'dumbbell',primaries:['chest'],url:'secret'}],bodyweight:[{d:'2020-01-01',w:80,note:'secret'}],workouts:[{id:'old',d:'2020-01-01',notes:'secret',dur:120,entries:[{id:'custom',note:'secret',mode:'cardio',target:{mode:'cardio'},sets:[{done:true,min:5,speed:8,sec:30,w:12,r:10,note:'secret'}]}]}]};
 const before=JSON.stringify(state),out=progressProjection(state);assert.equal(JSON.stringify(state),before);assert.equal(out.workouts.length,1);assert.equal(out.workouts[0].dur,120);assert.equal(out.workouts[0].entries[0].sets[0].min,5);assert.equal(out.definitions.custom.n,'Private');assert.ok(!JSON.stringify(out).includes('secret'));assert.ok(!('active' in out));assert.equal(out.unit,'lb');
});
test('deduplicates tombstones and rejects corrupt history and invalid page selectors',()=>{
 const w={id:'w',d:'2020-01-01',entries:[{}]};assert.equal(savedWorkouts({workouts:[w,w]}).length,1);assert.equal(savedWorkouts({workouts:[w],deleted:{workouts:{w:1}}}).length,0);assert.throws(()=>savedWorkouts({workouts:{}}));assert.throws(()=>progressPageOptions(new URLSearchParams('limit=500')));assert.throws(()=>progressPageOptions(new URLSearchParams('uid=other')));
});

test('projection preserves unilateral sides, warmups, failure and bursts for existing statistics',()=>{
 const row={done:true,w:20,r:10,failure:true,phase:'work',sides:{L:{w:20,r:8,done:true,rir:1,drops:[{w:10,r:4}]},R:{w:20,r:10,done:true}},clusters:[{w:20,r:2}]};
 const result=progressProjection({workouts:[{id:'a',d:'2020-01-01',entries:[{id:'0025',target:{mode:'reps',dbLoad:'each',note:'secret'},sets:[row]}]}]});
 assert.deepEqual(result.workouts[0].entries[0].sets[0],row);assert.ok(!JSON.stringify(result).includes('secret'));
});
