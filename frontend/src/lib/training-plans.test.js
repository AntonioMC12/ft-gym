import {it,expect} from 'vitest'
import {createTrainingPlan,removeTrainingPlan,moveRoutineToPlan,planOf,stateForPlan} from './training-plans.js'
import {stampEdits,mergeStates} from './sync-merge.js'
it('organizes without copying routines, changing schedules or deleting workout history',()=>{
 const s={routines:[{id:'r',name:'Torso',ex:[]}],week:{1:['r']},workouts:[{id:'w',routineId:'r'}]};createTrainingPlan(s,'Fuerza','p');expect(moveRoutineToPlan(s,'r','p')).toBe(true);expect(s.routines).toHaveLength(1);expect(stateForPlan(s,'p').week).toEqual({1:['r']});removeTrainingPlan(s,'p');expect(planOf(s,s.routines[0])).toBeNull();expect(s.week).toEqual({1:['r']});expect(s.workouts[0].routineId).toBe('r')
})
it('converges independent plan edits and does not resurrect a deleted folder from a stale device',()=>{
 const base={_ts:1,routines:[],workouts:[],trainingPlans:{}};const a=structuredClone(base),b=structuredClone(base);createTrainingPlan(a,'A','a');createTrainingPlan(b,'B','b');stampEdits(base,a,10);stampEdits(base,b,20);a._ts=10;b._ts=20;const merged=mergeStates(a,b);expect(Object.keys(merged.trainingPlans).sort()).toEqual(['a','b']);const gone=structuredClone(merged);removeTrainingPlan(gone,'a');stampEdits(merged,gone,30);gone._ts=30;expect(mergeStates(gone,a).trainingPlans.a).toBeUndefined()
})
it('old and dangling plan references are Unfiled and cannot point to an absent plan',()=>{const s={routines:[{id:'r',planId:'gone'}]};expect(planOf(s,s.routines[0])).toBeNull();expect(moveRoutineToPlan(s,'r','missing')).toBe(false)})
