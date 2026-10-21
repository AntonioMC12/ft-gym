import {it,expect} from 'vitest'
import {blankRepRows,repReference,repsEntered} from './rep-reference.js'
import {markAllSetsDone} from './backfill.js'
import {buildCompletedWorkout} from './finish-workout.js'
const entry={id:'0001',rid:'r',target:{reps:12},planned:{reps:12,repsMin:8},sets:[{r:null,w:20,done:false}]}
it('keeps the actual repetition empty and uses last matching logged work before a planned range',()=>{
 const S={workouts:[{id:'w',d:'2026-10-16',routineIds:['r'],entries:[{id:'0001',rid:'r',sets:[{r:10,w:20,done:true}]}]}]};expect(repReference(S,entry,0)).toBe('10');expect(repReference({workouts:[]},entry,0)).toBe('8–12');expect(entry.sets[0].r).toBeNull();expect(repsEntered(entry.sets[0])).toBe(false)
})
it('never uses another exercise and falls back when the previous session has no matching series',()=>{
 const S={workouts:[{id:'w',d:'2026-10-16',entries:[{id:'other',sets:[{r:99,done:true}]}]}]};expect(repReference(S,entry,0)).toBe('8–12');expect(repReference({workouts:[]},{...entry,sets:[entry.sets[0],{r:null}]},1)).toBe('8–12')
})
it('clears only freshly built repetition inputs and cannot save a suggested number as actual work',()=>{
 const seed=[{r:12,w:20,done:false}],sets=blankRepRows(seed,{mode:'reps'});expect(seed[0].r).toBe(12);expect(sets[0].r).toBeNull();const saved=buildCompletedWorkout({id:'a',d:'2026-10-17',entries:[{...entry,sets}]});expect(saved.entries).toHaveLength(0)
})

it('does not turn an explicitly empty input into completed work even if completion was requested elsewhere',()=>{
 const saved=buildCompletedWorkout({id:'a',d:'2026-10-17',entries:[{...entry,sets:[{r:null,w:20,done:true}]}]});expect(saved.entries).toHaveLength(0)
})

it('matches work series independently of warmups and respects per-series progression and pyramids',()=>{
 const e={...entry,planned:{reps:8},target:{reps:8,rowReps:[8,9]},sets:[{warmup:true,r:null},{r:null},{r:null}]};
 expect(repReference({workouts:[]},e,2)).toBe('9');
 expect(repReference({workouts:[]},{...e,target:{pyramid:[12,8,'max']}},2)).toBe('8');
 expect(repReference({workouts:[]},{...e,target:{pyramid:[12,8,'max']},sets:[{r:null},{r:null},{r:null}]},2)).toBe('');
});

it('mark all does not turn fresh empty reps into a completed set',()=>{
 const [e]=markAllSetsDone([entry]);expect(e.sets[0].done).toBe(false);expect(e.sets[0].r).toBeNull();
});

it('an emptied completed row cannot inflate the saved top weight',()=>{
 const saved=buildCompletedWorkout({entries:[{...entry,sets:[{r:10,w:20,done:true},{r:null,w:200,done:true}]}]});
 expect(saved.entries[0].topW).toBe(20);expect(saved.entries[0].sets[1].done).toBe(false);
});
