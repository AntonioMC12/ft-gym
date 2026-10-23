import {describe,it,expect} from 'vitest'
import {applyAssignmentRetirements} from './assignment-lifecycle.js'
import {applyPlanDelivery} from './plan-delivery.js'
const id='cr_'+'a'.repeat(32),other='cr_'+'b'.repeat(32)
describe('assignment removal',()=>{
 it('removes only the assigned routine and schedule, preserves active session and history, and is idempotent',()=>{
  const state={routines:[{id,ex:[]},{id:other,ex:[]}],week:{1:[id,other]},dayPlan:{'2026-01-01':id},workouts:[{id:'past',routineId:id}],active:{routineIds:[id],entries:[{id:'0025',sets:[{w:20,r:10}]}]}}
  const active=JSON.stringify(state.active),history=JSON.stringify(state.workouts)
  expect(applyAssignmentRetirements(state,[{id,at:100}],200)).toBe(true);expect(state.routines.map(r=>r.id)).toEqual([other]);expect(state.week[1]).toEqual([other]);expect(state.dayPlan).toEqual({});expect(JSON.stringify(state.active)).toBe(active);expect(JSON.stringify(state.workouts)).toBe(history);expect(applyAssignmentRetirements(state,[{id}],300)).toBe(false)
 })
 it('marks a not-yet-installed assignment removed so stale acceptance cannot install it',()=>{
  const state={unit:'kg',routines:[],workouts:[],week:{},customEx:[]};applyAssignmentRetirements(state,[{id}],200)
  const delivery={deliveryKey:'td_'+'c'.repeat(32),acceptedAt:100,routineIds:{r:id},bundle:{opengym_plan:1,unit:'kg',name:'Plan',customEx:[],week:{},routines:[{id:'r',name:'R',ex:[{id:'0025',sets:3,reps:8}]}]}}
  applyPlanDelivery(state,delivery);expect(state.routines).toEqual([])
 })
})

it('clears array-based future schedules and queued references without changing other routines',()=>{
 const state={routines:[{id},{id:other}],week:{},dayPlan:{'2027-01-01':[id,other],'2027-01-02':[id]},rotation:{sequence:[id,other]},queue:{ids:[id,other]},workouts:[],active:{routineIds:[id]}}
 applyAssignmentRetirements(state,[{id}],200);expect(state.dayPlan).toEqual({'2027-01-01':[other]});expect(state.rotation.sequence).toEqual([other]);expect(state.queue.ids).toEqual([other]);expect(state.active.routineIds).toEqual([id])
})
