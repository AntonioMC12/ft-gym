import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSharedLibrary, libraryHas, librarySlice, LIB_BY_ID } from '../coach/core/library.js';
import { validatePlan } from '../coach/core/validate.js';
import { assignedStrength } from '../centers/domain/assigned-strength.js';
const ex = { id: 'ft_consumer', n: 'FT press', bp: 'chest', eq: 'barbell', assisted: false, origin: 'platform', revision: 1 };
test('Coach resolves shared names/equipment and pins trained exercises', t => {
  registerSharedLibrary([ex]); t.after(() => registerSharedLibrary([]));
  assert.ok(libraryHas(ex.id)); assert.equal(LIB_BY_ID.get(ex.id).n, ex.n);
  assert.ok(librarySlice({customEx:[]}, ['barbell'], { keep: [ex.id] }).some(e => e.id === ex.id));
  registerSharedLibrary([{...ex,archived:true}]);
  const candidate = {opengym_plan:1,name:'FT',week:{1:'r'},routines:[{id:'r',name:'R',ex:[{id:ex.id,sets:3,reps:8}]}],customEx:[]};
  assert.equal(validatePlan(candidate).ok, false);
});
test('assigned strength includes shared definitions and historical snapshots', t => {
  registerSharedLibrary([ex]); t.after(() => registerSharedLibrary([]));
  const state = {workouts:[{id:'w',d:'2026-10-23',routineIds:['r'],entries:[{id:ex.id,rid:'r',target:{mode:'reps'},sets:[{w:20,r:10,done:true}]}]}]};
  const options = {routineIds:['r'],allowedExercises:new Map([['r',new Set([ex.id])]]),from:'2026-10-01',to:'2026-10-31'};
  assert.equal(assignedStrength(state,options)[0][0].id,ex.id);
  registerSharedLibrary([]);
  state.workouts[0].entries[0].muscleSnapshot={sharedRevision:1,n:ex.n,eq:ex.eq,assisted:false};
  assert.equal(assignedStrength(state,options)[0][0].weeks[0].load,20);
});
